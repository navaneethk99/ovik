package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"ovik/pkg/attendance"
)

const (
	defaultListenAddr = ":8080"
	writeTimeout      = 5 * time.Second
)

type server struct {
	db                  *pgxpool.Pool
	cooldownSec         int
	lastRecognizerPing  time.Time
	recognizerMu        sync.Mutex

	// System Control fields
	frontendEnabled     bool
	backendEnabled      bool
	recognizerEnabled   bool
	recognizerCmd       *exec.Cmd
	controlMu           sync.Mutex
}

type attendanceRecord struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Status       string    `json:"status"`
	RecognizedAt time.Time `json:"recognized_at"`
}

func main() {
	net.DefaultResolver = &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			d := net.Dialer{Timeout: 5 * time.Second}
			return d.DialContext(ctx, "udp", "8.8.8.8:53")
		},
	}

	loadEnv(".env", "../../.env")

	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	ctx := context.Background()
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		log.Fatalf("parse database config: %v", err)
	}
	dialer := &net.Dialer{
		Timeout: 10 * time.Second,
		Resolver: &net.Resolver{
			PreferGo: true,
			Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
				d := net.Dialer{Timeout: 5 * time.Second}
				return d.DialContext(ctx, "udp", "8.8.8.8:53")
			},
		},
	}
	config.ConnConfig.DialFunc = func(ctx context.Context, _, addr string) (net.Conn, error) {
		return dialer.DialContext(ctx, "tcp4", addr)
	}
	db, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}
	defer db.Close()

	if err := ensureSchema(ctx, db); err != nil {
		log.Fatalf("ensure schema: %v", err)
	}

	cooldownSec := 60
	if valStr := os.Getenv("ATTENDANCE_MARK_COOLDOWN_SECONDS"); valStr != "" {
		if val, err := strconv.Atoi(valStr); err == nil {
			cooldownSec = val
		}
	}

	srv := &server{
		db:              db,
		cooldownSec:     cooldownSec,
		frontendEnabled: true,
		backendEnabled:  true,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", srv.handleHealth)
	mux.HandleFunc("/attendance", srv.handleAttendance)
	mux.HandleFunc("/register", srv.handleRegister)
	mux.HandleFunc("/recognizer/ping", srv.handleRecognizerPing)
	mux.HandleFunc("/faces/", srv.handleFaceImage)
	mux.HandleFunc("/recogniser/known_faces/", srv.handleFaceImage)
	mux.HandleFunc("/recognizer/known_faces/", srv.handleFaceImage)
	mux.HandleFunc("/control/status", srv.handleControlStatus)
	mux.HandleFunc("/control/toggle", srv.handleControlToggle)

	addr := envOrDefault("BACKEND_ADDR", defaultListenAddr)
	log.Printf("attendance backend listening on %s", addr)

	if err := http.ListenAndServe(addr, corsMiddleware(mux)); err != nil {
		log.Fatal(err)
	}
}

func ensureSchema(ctx context.Context, db *pgxpool.Pool) error {
	const schema = `
CREATE TABLE IF NOT EXISTS attendance_records (
	id BIGSERIAL PRIMARY KEY,
	name TEXT NOT NULL,
	attendance_date DATE NOT NULL,
	status TEXT NOT NULL,
	recognized_at TIMESTAMPTZ NOT NULL,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`

	if _, err := db.Exec(ctx, schema); err != nil {
		return err
	}

	const employeeSchema = `
CREATE TABLE IF NOT EXISTS employees (
	id BIGSERIAL PRIMARY KEY,
	name TEXT NOT NULL UNIQUE,
	position TEXT,
	compensation TEXT,
	age INT,
	address TEXT,
	pan_card TEXT,
	aadhaar_card TEXT,
	email TEXT,
	phone TEXT,
	date_of_joining TEXT,
	emergency_contact TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`

	if _, err := db.Exec(ctx, employeeSchema); err != nil {
		return err
	}

	const dropUniqueConstraint = `
ALTER TABLE attendance_records
DROP CONSTRAINT IF EXISTS attendance_records_name_attendance_date_key;`

	_, err := db.Exec(ctx, dropUniqueConstraint)
	return err
}

func (s *server) isBackendDisabled() bool {
	s.controlMu.Lock()
	disabled := !s.backendEnabled
	s.controlMu.Unlock()
	return disabled
}

func (s *server) handleRegister(w http.ResponseWriter, r *http.Request) {
	if s.isBackendDisabled() {
		writeJSONError(w, http.StatusServiceUnavailable, "backend service is disabled")
		return
	}

	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		Name             string `json:"name"`
		Image            string `json:"image"` // base64
		Position         string `json:"position"`
		Compensation     string `json:"compensation"`
		Age              int    `json:"age"`
		Address          string `json:"address"`
		PanCard          string `json:"pan_card"`
		AadhaarCard      string `json:"aadhaar_card"`
		Email            string `json:"email"`
		Phone            string `json:"phone"`
		DateOfJoining    string `json:"date_of_joining"`
		EmergencyContact string `json:"emergency_contact"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || req.Image == "" {
		writeJSONError(w, http.StatusBadRequest, "name and image are required")
		return
	}

	knownFacesDir := envOrDefault("KNOWN_FACES_DIR", filepath.Join(findProjectRoot(), "apps/recognizer/known_faces"))

	// Create user directory
	userDir := filepath.Join(knownFacesDir, req.Name)
	if err := os.MkdirAll(userDir, 0755); err != nil {
		log.Printf("failed to create directory %s: %v", userDir, err)
		writeJSONError(w, http.StatusInternalServerError, "failed to create user directory")
		return
	}

	// Decode base64 image
	imgData, err := base64.StdEncoding.DecodeString(req.Image)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid image data (must be base64)")
		return
	}

	// Save image
	imgPaths := filepath.Join(userDir, "capture.jpg")
	if err := os.WriteFile(imgPaths, imgData, 0644); err != nil {
		log.Printf("failed to save image to %s: %v", imgPaths, err)
		writeJSONError(w, http.StatusInternalServerError, "failed to save image")
		return
	}

	// Save detailed employee metadata to database
	ctx, cancel := context.WithTimeout(r.Context(), writeTimeout)
	defer cancel()

	const insertQuery = `
INSERT INTO employees (name, position, compensation, age, address, pan_card, aadhaar_card, email, phone, date_of_joining, emergency_contact)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
ON CONFLICT (name) DO UPDATE SET
	position = EXCLUDED.position,
	compensation = EXCLUDED.compensation,
	age = EXCLUDED.age,
	address = EXCLUDED.address,
	pan_card = EXCLUDED.pan_card,
	aadhaar_card = EXCLUDED.aadhaar_card,
	email = EXCLUDED.email,
	phone = EXCLUDED.phone,
	date_of_joining = EXCLUDED.date_of_joining,
	emergency_contact = EXCLUDED.emergency_contact;`

	_, err = s.db.Exec(ctx, insertQuery,
		req.Name, req.Position, req.Compensation, req.Age, req.Address,
		req.PanCard, req.AadhaarCard, req.Email, req.Phone, req.DateOfJoining,
		req.EmergencyContact,
	)
	if err != nil {
		log.Printf("failed to save employee details for %s: %v", req.Name, err)
		writeJSONError(w, http.StatusInternalServerError, "failed to save employee details to database")
		return
	}

	log.Printf("registered new user with details: %s", req.Name)
	writeJSON(w, http.StatusOK, map[string]string{"message": "successfully registered " + req.Name})
}

func (s *server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), writeTimeout)
	defer cancel()

	dbStatus := "ok"
	if err := s.db.Ping(ctx); err != nil {
		dbStatus = "error"
	}

	s.recognizerMu.Lock()
	lastPing := s.lastRecognizerPing
	s.recognizerMu.Unlock()

	recStatus := "offline"
	var lastSeenStr string
	if !lastPing.IsZero() {
		lastSeenStr = lastPing.UTC().Format(time.RFC3339)
		if time.Since(lastPing) < 15*time.Second {
			recStatus = "ok"
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"backend":  "ok",
		"database": dbStatus,
		"recognizer": map[string]any{
			"status":    recStatus,
			"last_seen": lastSeenStr,
		},
	})
}

func (s *server) handleRecognizerPing(w http.ResponseWriter, r *http.Request) {
	if s.isBackendDisabled() {
		writeJSONError(w, http.StatusServiceUnavailable, "backend service is disabled")
		return
	}

	if r.Method != http.MethodPost && r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	s.recognizerMu.Lock()
	s.lastRecognizerPing = time.Now()
	s.recognizerMu.Unlock()

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) handleFaceImage(w http.ResponseWriter, r *http.Request) {
	if s.isBackendDisabled() {
		writeJSONError(w, http.StatusServiceUnavailable, "backend service is disabled")
		return
	}

	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	name := r.URL.Path
	if strings.HasPrefix(name, "/recogniser/known_faces/") {
		name = strings.TrimPrefix(name, "/recogniser/known_faces/")
	} else if strings.HasPrefix(name, "/recognizer/known_faces/") {
		name = strings.TrimPrefix(name, "/recognizer/known_faces/")
	} else {
		name = strings.TrimPrefix(name, "/faces/")
	}
	name = strings.TrimSuffix(name, "/")
	if name == "" {
		writeJSONError(w, http.StatusBadRequest, "name is required")
		return
	}

	knownFacesDir := envOrDefault("KNOWN_FACES_DIR", filepath.Join(findProjectRoot(), "apps/recognizer/known_faces"))
	userDir := filepath.Join(knownFacesDir, name)

	files, err := os.ReadDir(userDir)
	if err != nil || len(files) == 0 {
		writeJSONError(w, http.StatusNotFound, "image directory not found or empty")
		return
	}

	var firstFile string
	for _, f := range files {
		if !f.IsDir() && !strings.HasPrefix(f.Name(), ".") {
			firstFile = f.Name()
			break
		}
	}

	if firstFile == "" {
		writeJSONError(w, http.StatusNotFound, "no image file found")
		return
	}

	imgPath := filepath.Join(userDir, firstFile)
	http.ServeFile(w, r, imgPath)
}

func (s *server) handleAttendance(w http.ResponseWriter, r *http.Request) {
	if s.isBackendDisabled() {
		writeJSONError(w, http.StatusServiceUnavailable, "backend service is disabled")
		return
	}

	switch r.Method {
	case http.MethodGet:
		s.handleAttendanceList(w, r)
		return
	case http.MethodPost:
	case http.MethodDelete:
		s.handleAttendanceDelete(w, r)
		return
	default:
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var event attendance.Event
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if err := validateEvent(event); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	recognizedAt, err := time.Parse(time.RFC3339, event.RecognizedAt)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "recognized_at must be RFC3339")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), writeTimeout)
	defer cancel()

	inCooldown, err := checkCooldown(ctx, s.db, event.Name, recognizedAt, s.cooldownSec)
	if err != nil {
		log.Printf("cooldown check failed for %s: %v", event.Name, err)
		writeJSONError(w, http.StatusInternalServerError, "database check failed")
		return
	}

	if inCooldown {
		log.Printf("attendance check: %s is in cooldown (%d seconds), skipping db write", event.Name, s.cooldownSec)
		writeJSON(w, http.StatusOK, map[string]string{
			"name":   event.Name,
			"status": "cooldown",
		})
		return
	}

	if err := insertAttendance(ctx, s.db, event, recognizedAt); err != nil {
		log.Printf("attendance write failed for %s: %v", event.Name, err)
		writeJSONError(w, http.StatusInternalServerError, "database write failed")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"name":   event.Name,
		"status": event.Status,
	})
}

func (s *server) handleAttendanceList(w http.ResponseWriter, r *http.Request) {
	limit := 25
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed <= 0 || parsed > 200 {
			writeJSONError(w, http.StatusBadRequest, "limit must be between 1 and 200")
			return
		}
		limit = parsed
	}

	ctx, cancel := context.WithTimeout(r.Context(), writeTimeout)
	defer cancel()

	records, err := listAttendance(ctx, s.db, limit)
	if err != nil {
		log.Printf("attendance read failed: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "database read failed")
		return
	}

	writeJSON(w, http.StatusOK, records)
}

func insertAttendance(ctx context.Context, db *pgxpool.Pool, event attendance.Event, recognizedAt time.Time) error {
	const query = `
INSERT INTO attendance_records (name, attendance_date, status, recognized_at, updated_at)
VALUES ($1, $2, $3, $4, NOW());`

	attendanceDate := recognizedAt.In(time.Local).Format("2006-01-02")
	_, err := db.Exec(ctx, query, event.Name, attendanceDate, event.Status, recognizedAt.UTC())
	return err
}

func listAttendance(ctx context.Context, db *pgxpool.Pool, limit int) ([]attendanceRecord, error) {
	const query = `
SELECT id, name, status, recognized_at
FROM attendance_records
ORDER BY recognized_at DESC
LIMIT $1;`

	rows, err := db.Query(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := make([]attendanceRecord, 0, limit)
	for rows.Next() {
		var record attendanceRecord
		if err := rows.Scan(&record.ID, &record.Name, &record.Status, &record.RecognizedAt); err != nil {
			return nil, err
		}
		records = append(records, record)
	}

	return records, rows.Err()
}

func validateEvent(event attendance.Event) error {
	if strings.TrimSpace(event.Name) == "" {
		return errors.New("name is required")
	}
	if strings.TrimSpace(event.Status) == "" {
		return errors.New("status is required")
	}
	if strings.TrimSpace(event.RecognizedAt) == "" {
		return errors.New("recognized_at is required")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("response encode failed: %v", err)
	}
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func envOrDefault(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func loadEnv(paths ...string) {
	for _, path := range paths {
		if err := godotenv.Load(path); err != nil && !os.IsNotExist(err) {
			log.Printf("could not load %s: %v", path, err)
		}
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func findProjectRoot() string {
	dir, err := os.Getwd()
	if err != nil {
		return "."
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "."
}

func checkCooldown(ctx context.Context, db *pgxpool.Pool, name string, recognizedAt time.Time, cooldownSec int) (bool, error) {
	if cooldownSec <= 0 {
		return false, nil
	}
	const query = `
SELECT EXISTS (
	SELECT 1 FROM attendance_records
	WHERE name = $1
	  AND recognized_at >= $2
);`
	cutoff := recognizedAt.Add(-time.Duration(cooldownSec) * time.Second)
	var exists bool
	err := db.QueryRow(ctx, query, name, cutoff).Scan(&exists)
	return exists, err
}

func (s *server) startRecognizer() error {
	s.controlMu.Lock()
	defer s.controlMu.Unlock()

	if s.recognizerCmd != nil && s.recognizerCmd.Process != nil {
		return nil
	}

	root := findProjectRoot()
	binPath := filepath.Join(root, "recognizer-bin")

	if _, err := os.Stat(binPath); err != nil {
		return fmt.Errorf("recognizer-bin binary not found at %s: %w", binPath, err)
	}

	cmd := exec.Command(binPath)
	cmd.Dir = root
	cmd.Env = os.Environ()
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start recognizer process: %w", err)
	}

	s.recognizerCmd = cmd
	log.Printf("[System Control] Started recognizer process (PID: %d)", cmd.Process.Pid)

	go func(c *exec.Cmd) {
		err := c.Wait()
		log.Printf("[System Control] Recognizer process exited: %v", err)

		s.controlMu.Lock()
		if s.recognizerCmd == c {
			s.recognizerCmd = nil
			s.recognizerEnabled = false
		}
		s.controlMu.Unlock()
	}(cmd)

	return nil
}

func (s *server) stopRecognizer() error {
	s.controlMu.Lock()
	cmd := s.recognizerCmd
	s.controlMu.Unlock()

	if cmd == nil || cmd.Process == nil {
		return nil
	}

	log.Printf("[System Control] Stopping recognizer process (PID: %d)", cmd.Process.Pid)

	if err := cmd.Process.Kill(); err != nil {
		log.Printf("[System Control] Failed to kill recognizer process: %v", err)
		return err
	}

	return nil
}

func (s *server) handleControlStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	s.controlMu.Lock()
	fe := s.frontendEnabled
	be := s.backendEnabled
	re := s.recognizerEnabled
	running := s.recognizerCmd != nil && s.recognizerCmd.Process != nil
	s.controlMu.Unlock()

	writeJSON(w, http.StatusOK, map[string]any{
		"frontend":           fe,
		"backend":            be,
		"recognizer":         re,
		"recognizer_running": running,
	})
}

func (s *server) handleControlToggle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		Service string `json:"service"`
		Enable  bool   `json:"enable"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	req.Service = strings.ToLower(strings.TrimSpace(req.Service))
	if req.Service != "frontend" && req.Service != "backend" && req.Service != "recognizer" {
		writeJSONError(w, http.StatusBadRequest, "invalid service name (must be frontend, backend, or recognizer)")
		return
	}

	log.Printf("[System Control] Toggling %s to %t", req.Service, req.Enable)

	switch req.Service {
	case "frontend":
		s.controlMu.Lock()
		s.frontendEnabled = req.Enable
		s.controlMu.Unlock()
	case "backend":
		s.controlMu.Lock()
		s.backendEnabled = req.Enable
		s.controlMu.Unlock()
	case "recognizer":
		s.controlMu.Lock()
		s.recognizerEnabled = req.Enable
		s.controlMu.Unlock()

		var err error
		if req.Enable {
			err = s.startRecognizer()
		} else {
			err = s.stopRecognizer()
		}

		if err != nil {
			log.Printf("[System Control] Error toggling recognizer: %v", err)
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	s.controlMu.Lock()
	fe := s.frontendEnabled
	be := s.backendEnabled
	re := s.recognizerEnabled
	running := s.recognizerCmd != nil && s.recognizerCmd.Process != nil
	s.controlMu.Unlock()

	writeJSON(w, http.StatusOK, map[string]any{
		"frontend":           fe,
		"backend":            be,
		"recognizer":         re,
		"recognizer_running": running,
	})
}

func (s *server) handleAttendanceDelete(w http.ResponseWriter, r *http.Request) {
	if s.isBackendDisabled() {
		writeJSONError(w, http.StatusServiceUnavailable, "backend service is disabled")
		return
	}
	if r.Method != http.MethodDelete {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		IDs []int64 `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if len(req.IDs) == 0 {
		writeJSONError(w, http.StatusBadRequest, "no IDs provided for deletion")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), writeTimeout)
	defer cancel()
	const query = "DELETE FROM attendance_records WHERE id = ANY($1);"
	result, err := s.db.Exec(ctx, query, req.IDs)
	if err != nil {
		log.Printf("failed to delete attendance records: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "database deletion failed")
		return
	}
	rowsAffected := result.RowsAffected()
	log.Printf("deleted %d attendance records", rowsAffected)
	writeJSON(w, http.StatusOK, map[string]any{
		"message":       "successfully deleted records",
		"deleted_count": rowsAffected,
	})
}

