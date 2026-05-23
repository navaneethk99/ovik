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
	SnapshotPath *string   `json:"snapshot_path"`
}

type employeeRecord struct {
	ID               int64      `json:"id"`
	Name             string     `json:"name"`
	Position         *string    `json:"position"`
	Compensation     *string    `json:"compensation"`
	Age              *int       `json:"age"`
	Address          *string    `json:"address"`
	PanCard          *string    `json:"pan_card"`
	AadhaarCard      *string    `json:"aadhaar_card"`
	Email            *string    `json:"email"`
	Phone            *string    `json:"phone"`
	DateOfJoining    *string    `json:"date_of_joining"`
	EmergencyContact *string    `json:"emergency_contact"`
	CreatedAt        time.Time  `json:"created_at"`
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
	if err := ensureAttendeesDir(); err != nil {
		log.Fatalf("ensure attendees dir: %v", err)
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
	mux.HandleFunc("/employees", srv.handleEmployees)
	mux.HandleFunc("/employees/photo", srv.handleEmployeePhotoUpdate)
	mux.HandleFunc("/attendance/snapshot", srv.handleAttendanceSnapshot)
	mux.HandleFunc("/attendees/", srv.handleAttendeeImage)

	addr := envOrDefault("BACKEND_ADDR", defaultListenAddr)
	log.Printf("attendance backend listening on %s", addr)

	if err := http.ListenAndServe(addr, corsMiddleware(mux)); err != nil {
		log.Fatal(err)
	}
}

func ensureAttendeesDir() error {
	attendeesDir := envOrDefault("ATTENDEES_DIR", filepath.Join(findProjectRoot(), "apps/recognizer/attendees"))
	if err := os.MkdirAll(attendeesDir, 0755); err != nil {
		return err
	}

	log.Printf("attendance snapshots directory: %s", attendeesDir)
	return nil
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

	const addSnapshotCol = `
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS snapshot_path TEXT;`

	if _, err := db.Exec(ctx, addSnapshotCol); err != nil {
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
	if err := s.refreshRecognizerSamples(); err != nil {
		log.Printf("failed to refresh recognizer after registering %s: %v", req.Name, err)
		writeJSONError(w, http.StatusInternalServerError, "employee registered but failed to refresh recognizer")
		return
	}
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

	recordID, err := insertAttendance(ctx, s.db, event, recognizedAt)
	if err != nil {
		log.Printf("attendance write failed for %s: %v", event.Name, err)
		writeJSONError(w, http.StatusInternalServerError, "database write failed")
		return
	}

	if err := s.saveSnapshotFromRecognizerFrame(ctx, recordID, event.Name); err != nil {
		log.Printf("attendance snapshot save failed for %s (id=%d): %v", event.Name, recordID, err)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"name":   event.Name,
		"status": event.Status,
		"id":     recordID,
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

func insertAttendance(ctx context.Context, db *pgxpool.Pool, event attendance.Event, recognizedAt time.Time) (int64, error) {
	const query = `
INSERT INTO attendance_records (name, attendance_date, status, recognized_at, updated_at)
VALUES ($1, $2, $3, $4, NOW())
RETURNING id;`

	attendanceDate := recognizedAt.In(time.Local).Format("2006-01-02")
	var id int64
	err := db.QueryRow(ctx, query, event.Name, attendanceDate, event.Status, recognizedAt.UTC()).Scan(&id)
	return id, err
}

func listAttendance(ctx context.Context, db *pgxpool.Pool, limit int) ([]attendanceRecord, error) {
	const query = `
SELECT id, name, status, recognized_at, snapshot_path
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
		if err := rows.Scan(&record.ID, &record.Name, &record.Status, &record.RecognizedAt, &record.SnapshotPath); err != nil {
			return nil, err
		}
		records = append(records, record)
	}

	return records, rows.Err()
}

func (s *server) saveSnapshotFromRecognizerFrame(ctx context.Context, attendanceID int64, name string) error {
	framePath := envOrDefault("RECOGNIZER_FRAME_PATH", filepath.Join(os.TempDir(), "ovik-frame.jpg"))
	frameData, err := os.ReadFile(framePath)
	if err != nil {
		return fmt.Errorf("read recognizer frame %s: %w", framePath, err)
	}

	attendeesDir := envOrDefault("ATTENDEES_DIR", filepath.Join(findProjectRoot(), "apps/recognizer/attendees"))
	userDir := filepath.Join(attendeesDir, name)
	if err := os.MkdirAll(userDir, 0755); err != nil {
		return fmt.Errorf("create attendees directory %s: %w", userDir, err)
	}

	fileName := fmt.Sprintf("%d.jpg", attendanceID)
	filePath := filepath.Join(userDir, fileName)
	if err := os.WriteFile(filePath, frameData, 0644); err != nil {
		return fmt.Errorf("save snapshot to %s: %w", filePath, err)
	}

	relPath := name + "/" + fileName
	const updateQuery = `UPDATE attendance_records SET snapshot_path = $1 WHERE id = $2;`
	if _, err := s.db.Exec(ctx, updateQuery, relPath, attendanceID); err != nil {
		return fmt.Errorf("update snapshot_path for attendance %d: %w", attendanceID, err)
	}

	log.Printf("saved attendance snapshot from recognizer frame for %s (id=%d) -> %s", name, attendanceID, relPath)
	return nil
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

func (s *server) refreshRecognizerSamples() error {
	s.controlMu.Lock()
	enabled := s.recognizerEnabled
	running := s.recognizerCmd != nil && s.recognizerCmd.Process != nil
	s.controlMu.Unlock()

	if !enabled && !running {
		return nil
	}

	if running {
		if err := s.stopRecognizer(); err != nil {
			return fmt.Errorf("stop recognizer: %w", err)
		}
	}

	if enabled {
		if err := s.startRecognizer(); err != nil {
			return fmt.Errorf("start recognizer: %w", err)
		}
	}

	return nil
}

func (s *server) stopRecognizer() error {
	s.controlMu.Lock()
	cmd := s.recognizerCmd
	if cmd != nil && cmd.Process != nil {
		s.recognizerCmd = nil
	}
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

func (s *server) handleEmployees(w http.ResponseWriter, r *http.Request) {
	if s.isBackendDisabled() {
		writeJSONError(w, http.StatusServiceUnavailable, "backend service is disabled")
		return
	}

	switch r.Method {
	case http.MethodGet:
		s.handleEmployeesList(w, r)
	case http.MethodDelete:
		s.handleEmployeesDelete(w, r)
	default:
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *server) handleEmployeesList(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), writeTimeout)
	defer cancel()

	const query = `
SELECT id, name, position, compensation, age, address, pan_card, aadhaar_card, email, phone, date_of_joining, emergency_contact, created_at
FROM employees
ORDER BY created_at DESC;`

	rows, err := s.db.Query(ctx, query)
	if err != nil {
		log.Printf("employees read failed: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "database read failed")
		return
	}
	defer rows.Close()

	records := make([]employeeRecord, 0)
	for rows.Next() {
		var record employeeRecord
		err := rows.Scan(
			&record.ID, &record.Name, &record.Position, &record.Compensation,
			&record.Age, &record.Address, &record.PanCard, &record.AadhaarCard,
			&record.Email, &record.Phone, &record.DateOfJoining, &record.EmergencyContact,
			&record.CreatedAt,
		)
		if err != nil {
			log.Printf("failed to scan employee: %v", err)
			writeJSONError(w, http.StatusInternalServerError, "failed to scan employee record")
			return
		}
		records = append(records, record)
	}

	writeJSON(w, http.StatusOK, records)
}

func (s *server) handleEmployeesDelete(w http.ResponseWriter, r *http.Request) {
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

	// 1. Resolve employee names first
	const selectQuery = "SELECT name FROM employees WHERE id = ANY($1);"
	rows, err := s.db.Query(ctx, selectQuery, req.IDs)
	if err != nil {
		log.Printf("failed to query employee names for deletion: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "database query failed")
		return
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			names = append(names, name)
		}
	}

	// 2. Perform DB deletion
	const deleteQuery = "DELETE FROM employees WHERE id = ANY($1);"
	result, err := s.db.Exec(ctx, deleteQuery, req.IDs)
	if err != nil {
		log.Printf("failed to delete employees: %v", err)
		writeJSONError(w, http.StatusInternalServerError, "database deletion failed")
		return
	}

	rowsAffected := result.RowsAffected()
	log.Printf("deleted %d employees from DB", rowsAffected)

	// 3. Clean up face directories from filesystem
	knownFacesDir := envOrDefault("KNOWN_FACES_DIR", filepath.Join(findProjectRoot(), "apps/recognizer/known_faces"))
	deletedFolders := 0
	for _, name := range names {
		if name = strings.TrimSpace(name); name != "" {
			userDir := filepath.Join(knownFacesDir, name)
			if err := os.RemoveAll(userDir); err == nil {
				deletedFolders++
			} else {
				log.Printf("warning: failed to delete user face directory %s: %v", userDir, err)
			}
		}
	}

	if err := s.refreshRecognizerSamples(); err != nil {
		log.Printf("failed to refresh recognizer after deleting employees %v: %v", req.IDs, err)
		writeJSONError(w, http.StatusInternalServerError, "employees deleted but failed to refresh recognizer")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"message":         "successfully deleted employees",
		"deleted_count":   rowsAffected,
		"deleted_folders": deletedFolders,
	})
}

// PUT /employees/photo — replace a registered employee's face profile photo
func (s *server) handleEmployeePhotoUpdate(w http.ResponseWriter, r *http.Request) {
	if s.isBackendDisabled() {
		writeJSONError(w, http.StatusServiceUnavailable, "backend service is disabled")
		return
	}
	if r.Method != http.MethodPut {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		Name  string `json:"name"`
		Image string `json:"image"` // base64
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

	imgData, err := base64.StdEncoding.DecodeString(req.Image)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid image data (must be base64)")
		return
	}

	knownFacesDir := envOrDefault("KNOWN_FACES_DIR", filepath.Join(findProjectRoot(), "apps/recognizer/known_faces"))
	userDir := filepath.Join(knownFacesDir, req.Name)

	// Clear all existing files in the user directory
	if entries, err := os.ReadDir(userDir); err == nil {
		for _, e := range entries {
			if !e.IsDir() {
				_ = os.Remove(filepath.Join(userDir, e.Name()))
			}
		}
	}

	// Ensure the directory exists
	if err := os.MkdirAll(userDir, 0755); err != nil {
		log.Printf("failed to create directory %s: %v", userDir, err)
		writeJSONError(w, http.StatusInternalServerError, "failed to create user directory")
		return
	}

	// Write new capture.jpg
	imgPath := filepath.Join(userDir, "capture.jpg")
	if err := os.WriteFile(imgPath, imgData, 0644); err != nil {
		log.Printf("failed to save image to %s: %v", imgPath, err)
		writeJSONError(w, http.StatusInternalServerError, "failed to save image")
		return
	}

	log.Printf("updated face photo for employee: %s", req.Name)
	if err := s.refreshRecognizerSamples(); err != nil {
		log.Printf("failed to refresh recognizer after updating photo for %s: %v", req.Name, err)
		writeJSONError(w, http.StatusInternalServerError, "photo updated but failed to refresh recognizer")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "photo updated for " + req.Name})
}

// POST /attendance/snapshot — store a snapshot image taken at the moment of recognition
func (s *server) handleAttendanceSnapshot(w http.ResponseWriter, r *http.Request) {
	if s.isBackendDisabled() {
		writeJSONError(w, http.StatusServiceUnavailable, "backend service is disabled")
		return
	}
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		AttendanceID int64  `json:"attendance_id"`
		Name         string `json:"name"`
		Snapshot     string `json:"snapshot"` // base64
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.AttendanceID == 0 || req.Name == "" || req.Snapshot == "" {
		writeJSONError(w, http.StatusBadRequest, "attendance_id, name and snapshot are required")
		return
	}

	imgData, err := base64.StdEncoding.DecodeString(req.Snapshot)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid snapshot data (must be base64)")
		return
	}

	attendeesDir := envOrDefault("ATTENDEES_DIR", filepath.Join(findProjectRoot(), "apps/recognizer/attendees"))
	userDir := filepath.Join(attendeesDir, req.Name)
	if err := os.MkdirAll(userDir, 0755); err != nil {
		log.Printf("failed to create attendees directory %s: %v", userDir, err)
		writeJSONError(w, http.StatusInternalServerError, "failed to create directory")
		return
	}

	fileName := fmt.Sprintf("%d.jpg", req.AttendanceID)
	filePath := filepath.Join(userDir, fileName)
	if err := os.WriteFile(filePath, imgData, 0644); err != nil {
		log.Printf("failed to save snapshot to %s: %v", filePath, err)
		writeJSONError(w, http.StatusInternalServerError, "failed to save snapshot")
		return
	}

	// Relative path for storage: "<Name>/<id>.jpg"
	relPath := req.Name + "/" + fileName

	ctx, cancel := context.WithTimeout(r.Context(), writeTimeout)
	defer cancel()

	const updateQuery = `UPDATE attendance_records SET snapshot_path = $1 WHERE id = $2;`
	if _, err := s.db.Exec(ctx, updateQuery, relPath, req.AttendanceID); err != nil {
		log.Printf("failed to update snapshot_path for attendance %d: %v", req.AttendanceID, err)
		writeJSONError(w, http.StatusInternalServerError, "failed to update database")
		return
	}

	log.Printf("saved attendance snapshot for %s (id=%d) -> %s", req.Name, req.AttendanceID, relPath)
	writeJSON(w, http.StatusOK, map[string]string{"snapshot_path": relPath})
}

// GET /attendees/<name>/<file> — serve an attendance snapshot image
func (s *server) handleAttendeeImage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	relPath := strings.TrimPrefix(r.URL.Path, "/attendees/")
	relPath = strings.TrimSuffix(relPath, "/")
	if relPath == "" {
		writeJSONError(w, http.StatusBadRequest, "path required")
		return
	}

	attendeesDir := envOrDefault("ATTENDEES_DIR", filepath.Join(findProjectRoot(), "apps/recognizer/attendees"))
	imgPath := filepath.Join(attendeesDir, filepath.FromSlash(relPath))

	// Security: ensure the resolved path is still within attendeesDir
	clean := filepath.Clean(imgPath)
	if !strings.HasPrefix(clean, filepath.Clean(attendeesDir)) {
		writeJSONError(w, http.StatusForbidden, "access denied")
		return
	}

	if _, err := os.Stat(clean); os.IsNotExist(err) {
		writeJSONError(w, http.StatusNotFound, "snapshot not found")
		return
	}

	http.ServeFile(w, r, clean)
}
