package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
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
	db *pgxpool.Pool
}

func main() {
	loadEnv(".env", "../../.env")

	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	ctx := context.Background()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}
	defer db.Close()

	if err := ensureSchema(ctx, db); err != nil {
		log.Fatalf("ensure schema: %v", err)
	}

	srv := &server{db: db}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", srv.handleHealth)
	mux.HandleFunc("/attendance", srv.handleAttendance)

	addr := envOrDefault("BACKEND_ADDR", defaultListenAddr)
	log.Printf("attendance backend listening on %s", addr)

	if err := http.ListenAndServe(addr, mux); err != nil {
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

	const dropUniqueConstraint = `
ALTER TABLE attendance_records
DROP CONSTRAINT IF EXISTS attendance_records_name_attendance_date_key;`

	_, err := db.Exec(ctx, dropUniqueConstraint)
	return err
}

func (s *server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) handleAttendance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
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

func insertAttendance(ctx context.Context, db *pgxpool.Pool, event attendance.Event, recognizedAt time.Time) error {
	const query = `
INSERT INTO attendance_records (name, attendance_date, status, recognized_at, updated_at)
VALUES ($1, $2, $3, $4, NOW());`

	attendanceDate := recognizedAt.In(time.Local).Format("2006-01-02")
	_, err := db.Exec(ctx, query, event.Name, attendanceDate, event.Status, recognizedAt.UTC())
	return err
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
