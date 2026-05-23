package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Kagami/go-face"
	"github.com/joho/godotenv"
	"gocv.io/x/gocv"

	"ovik/pkg/attendance"
)

const (
	localModelDir = "models"
	repoModelDir  = "apps/recognizer/models"
	localKnownDir = "known_faces"
	repoKnownDir  = "apps/recognizer/known_faces"
)

var tolerance float32 = 0.25
var minConfidenceGap float32 = 0.02

type attendanceClient struct {
	url        string
	authToken  string
	httpClient *http.Client
	visibleNow map[string]bool
}

func main() {
	loadEnv(".env", "../../.env")

	if tolStr := os.Getenv("RECOGNIZER_TOLERANCE"); tolStr != "" {
		if val, err := strconv.ParseFloat(tolStr, 32); err == nil {
			tolerance = float32(val)
			log.Printf("Using tolerance configured from env: %f", tolerance)
		} else {
			log.Printf("invalid RECOGNIZER_TOLERANCE '%s', using default %f", tolStr, tolerance)
		}
	}
	if gapStr := os.Getenv("RECOGNIZER_MIN_CONFIDENCE_GAP"); gapStr != "" {
		if val, err := strconv.ParseFloat(gapStr, 32); err == nil {
			minConfidenceGap = float32(val)
			log.Printf("Using min confidence gap configured from env: %f", minConfidenceGap)
		} else {
			log.Printf("invalid RECOGNIZER_MIN_CONFIDENCE_GAP '%s', using default %f", gapStr, minConfidenceGap)
		}
	}

	root := findProjectRoot()
	modelDir := envOrDefault("MODEL_DIR", filepath.Join(root, "apps/recognizer/models"))
	knownDir := envOrDefault("KNOWN_FACES_DIR", filepath.Join(root, "apps/recognizer/known_faces"))
	framePath := filepath.Join(os.TempDir(), "ovik-frame.jpg")

	runtime.LockOSThread()
	rec, err := face.NewRecognizer(modelDir)
	if err != nil {
		log.Fatal(err)
	}
	defer rec.Close()

	var samples []face.Descriptor
	var labels []int32
	names := map[int32]string{}

	var label int32

	people, err := os.ReadDir(knownDir)
	if err != nil {
		log.Fatal(err)
	}

	for _, person := range people {
		if !person.IsDir() {
			continue
		}

		personName := person.Name()
		personPath := filepath.Join(knownDir, personName)

		files, err := os.ReadDir(personPath)
		if err != nil {
			log.Printf("skipping %s: %v", personPath, err)
			label++
			continue
		}

		for _, file := range files {
			if file.IsDir() {
				continue
			}

			imgPath := filepath.Join(personPath, file.Name())
			faces, err := rec.RecognizeFile(imgPath)
			if err != nil || len(faces) != 1 {
				fmt.Println("Skipping:", imgPath)
				continue
			}

			samples = append(samples, faces[0].Descriptor)
			labels = append(labels, label)
			names[label] = personName
		}

		label++
	}

	log.Printf("Loaded %d samples for %d people. Mappings: %v", len(samples), len(names), names)
	rec.SetSamples(samples, labels)

	// Background health ping loop to backend
	go func() {
		pingURL := "http://localhost:8080/recognizer/ping"
		if postURL := os.Getenv("ATTENDANCE_POST_URL"); postURL != "" {
			if strings.HasSuffix(postURL, "/attendance") {
				pingURL = strings.TrimSuffix(postURL, "/attendance") + "/recognizer/ping"
			}
		}
		log.Printf("Starting recognizer health ping to %s", pingURL)
		client := &http.Client{Timeout: 5 * time.Second}
		// Send initial ping
		if resp, err := client.Post(pingURL, "application/json", nil); err == nil {
			resp.Body.Close()
		}
		ticker := time.NewTicker(5 * time.Second)
		for range ticker.C {
			resp, err := client.Post(pingURL, "application/json", nil)
			if err != nil {
				log.Printf("Health ping failed: %v", err)
				continue
			}
			resp.Body.Close()
		}
	}()

	attendance := newAttendanceClient()

	webcam, err := gocv.OpenVideoCapture(0)
	if err != nil {
		log.Fatal(err)
	}
	defer webcam.Close()

	window := gocv.NewWindow("Ovik Face Recognition")
	defer window.Close()

	img := gocv.NewMat()
	defer img.Close()

	fmt.Println("Camera started. Press ESC to quit.")

	for {
		if ok := webcam.Read(&img); !ok || img.Empty() {
			continue
		}

		gocv.IMWrite(framePath, img)
		seenNames := make(map[string]bool)

		faces, err := rec.RecognizeFile(framePath)
		if err != nil {
			log.Printf("recognize error: %v", err)
		} else {
			if len(faces) > 0 {
				log.Printf("Detected %d face(s) in frame", len(faces))
			}
			for i, f := range faces {
				name := "Unknown"
				bestName, bestDist, secondBestDist, matched, distStr := classifyDescriptor(f.Descriptor, samples, labels, names, tolerance, minConfidenceGap)
				if matched {
					name = bestName
					seenNames[name] = true
				}
				log.Printf("  Face %d at %v: name=%s, matched=%t, bestDist=%.4f, secondBestDist=%.4f, tolerance=%.4f, minGap=%.4f, isVisible=%t, distances: {%s}",
					i, f.Rectangle, name, matched, bestDist, secondBestDist, tolerance, minConfidenceGap, attendance.isVisible(name), distStr)

				if matched {
					if !attendance.isVisible(name) {
						recordID, recorded, err := attendance.markPresent(name)
						if err != nil {
							log.Printf("attendance update failed for %s: %v", name, err)
						} else if recorded {
							// Update visibility immediately to prevent multiple markPresent calls in the same frame
							attendance.visibleNow[name] = true
							go playWelcomeVoice(name)
							// Capture the recognized face from this exact frame and link it to the saved attendance row.
							frameData, err := captureSnapshot(img, f.Rectangle)
							if err != nil {
								log.Printf("snapshot capture failed for %s (id=%d): %v", name, recordID, err)
							} else if err := attendance.uploadSnapshot(recordID, name, frameData); err != nil {
								log.Printf("snapshot upload failed for %s (id=%d): %v", name, recordID, err)
							}
						} else {
							// If not recorded (cooldown), we should still mark visibleNow to prevent spamming
							attendance.visibleNow[name] = true
						}
					}
				}

				rect := f.Rectangle
				gocv.Rectangle(&img, rect, color.RGBA{0, 255, 0, 0}, 2)
				gocv.PutText(&img, name, rect.Min, gocv.FontHersheySimplex, 0.8, color.RGBA{0, 255, 0, 0}, 2)
			}
		}
		attendance.updateVisible(seenNames)

		window.IMShow(img)

		if window.WaitKey(1) == 27 {
			break
		}
	}
}

func classifyDescriptor(
	descriptor face.Descriptor,
	samples []face.Descriptor,
	labels []int32,
	names map[int32]string,
	tolerance float32,
	minGap float32,
) (bestName string, bestDist float32, secondBestDist float32, matched bool, distLog string) {
	bestByName := make(map[string]float32)

	for idx, sample := range samples {
		dist := face.SquaredEuclideanDistance(descriptor, sample)
		sampleName := names[labels[idx]]
		prev, exists := bestByName[sampleName]
		if !exists || dist < prev {
			bestByName[sampleName] = dist
		}
	}

	bestDist = float32(1e9)
	secondBestDist = float32(1e9)
	var distLogs []string

	for sampleName, dist := range bestByName {
		distLogs = append(distLogs, fmt.Sprintf("%s=%.4f", sampleName, dist))
		if dist < bestDist {
			secondBestDist = bestDist
			bestDist = dist
			bestName = sampleName
		} else if dist < secondBestDist {
			secondBestDist = dist
		}
	}

	sort.Strings(distLogs)
	distLog = strings.Join(distLogs, ", ")

	if bestName == "" {
		return "", bestDist, secondBestDist, false, distLog
	}
	if bestDist > tolerance {
		return bestName, bestDist, secondBestDist, false, distLog
	}
	if secondBestDist < float32(1e9) && secondBestDist-bestDist < minGap {
		return bestName, bestDist, secondBestDist, false, distLog
	}

	return bestName, bestDist, secondBestDist, true, distLog
}

func newAttendanceClient() *attendanceClient {
	return &attendanceClient{
		url:       os.Getenv("ATTENDANCE_POST_URL"),
		authToken: os.Getenv("ATTENDANCE_AUTH_TOKEN"),
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		visibleNow: make(map[string]bool),
	}
}

func (c *attendanceClient) markPresent(name string) (recordID int64, recorded bool, err error) {
	if c.url == "" {
		return 0, true, nil
	}

	payload := attendance.Event{
		Name:         name,
		Status:       "present",
		RecognizedAt: time.Now().UTC().Format(time.RFC3339),
	}

	body, err := payload.Marshal()
	if err != nil {
		return 0, false, err
	}

	req, err := http.NewRequest(http.MethodPost, c.url, bytes.NewReader(body))
	if err != nil {
		return 0, false, err
	}

	req.Header.Set("Content-Type", "application/json")
	if c.authToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.authToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return 0, false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return 0, false, fmt.Errorf("unexpected status code %d", resp.StatusCode)
	}

	var res struct {
		Name   string `json:"name"`
		Status string `json:"status"`
		ID     int64  `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err == nil {
		if res.Status == "cooldown" {
			log.Printf("attendance check: %s is in cooldown, skipping", name)
			return 0, false, nil
		}
		recordID = res.ID
	}

	log.Printf("marked %s as present (attendance id=%d)", name, recordID)
	return recordID, true, nil
}

// uploadSnapshot sends the captured recognition image to the backend to be stored with the attendance row.
func (c *attendanceClient) uploadSnapshot(attendanceID int64, name string, frameData []byte) error {
	if c.url == "" || attendanceID == 0 {
		return nil
	}

	snapshotBase64 := base64.StdEncoding.EncodeToString(frameData)

	// Derive snapshot URL from attendance URL (replace /attendance suffix)
	snapshotURL := strings.TrimSuffix(c.url, "/attendance") + "/attendance/snapshot"
	if !strings.Contains(c.url, "/attendance") {
		snapshotURL = c.url + "/attendance/snapshot"
	}

	payload, err := json.Marshal(map[string]any{
		"attendance_id": attendanceID,
		"name":          name,
		"snapshot":      snapshotBase64,
	})
	if err != nil {
		return fmt.Errorf("snapshot marshal failed: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, snapshotURL, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("snapshot request create failed: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.authToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.authToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("snapshot upload failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("snapshot upload returned status %d", resp.StatusCode)
	}
	log.Printf("attendance snapshot uploaded for %s (id=%d)", name, attendanceID)
	return nil
}

func (c *attendanceClient) isVisible(name string) bool {
	return c.visibleNow[name]
}

func (c *attendanceClient) updateVisible(seenNames map[string]bool) {
	c.visibleNow = seenNames
}

func captureSnapshot(img gocv.Mat, faceRect image.Rectangle) ([]byte, error) {
	if img.Empty() {
		return nil, fmt.Errorf("empty frame")
	}

	bounds := expandRect(faceRect, img.Cols(), img.Rows(), 24)
	region := img.Region(bounds)
	defer region.Close()

	snapshot := region.Clone()
	defer snapshot.Close()

	tmpFile, err := os.CreateTemp("", "ovik-attendance-*.jpg")
	if err != nil {
		return nil, fmt.Errorf("create temp snapshot: %w", err)
	}

	tmpPath := tmpFile.Name()
	if err := tmpFile.Close(); err != nil {
		os.Remove(tmpPath)
		return nil, fmt.Errorf("close temp snapshot: %w", err)
	}
	defer os.Remove(tmpPath)

	if ok := gocv.IMWrite(tmpPath, snapshot); !ok {
		return nil, fmt.Errorf("write temp snapshot image")
	}

	data, err := os.ReadFile(tmpPath)
	if err != nil {
		return nil, fmt.Errorf("read temp snapshot: %w", err)
	}

	return data, nil
}

func expandRect(rect image.Rectangle, maxWidth, maxHeight, padding int) image.Rectangle {
	minX := max(0, rect.Min.X-padding)
	minY := max(0, rect.Min.Y-padding)
	maxX := min(maxWidth, rect.Max.X+padding)
	maxY := min(maxHeight, rect.Max.Y+padding)

	if minX >= maxX || minY >= maxY {
		return image.Rect(0, 0, maxWidth, maxHeight)
	}

	return image.Rect(minX, minY, maxX, maxY)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func resolvePath(preferred, fallback string) string {
	if _, err := os.Stat(preferred); err == nil {
		return preferred
	}
	return fallback
}

func loadEnv(paths ...string) {
	for _, path := range paths {
		if err := godotenv.Load(path); err != nil && !os.IsNotExist(err) {
			log.Printf("could not load %s: %v", path, err)
		}
	}
}

func envOrDefault(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
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

func playWelcomeVoice(name string) {
	root := findProjectRoot()
	gttsCli := filepath.Join(root, "apps/recognizer/.venv/bin/gtts-cli")
	cacheDir := filepath.Join(root, "apps/recognizer/tts_cache")
	welcomeText := fmt.Sprintf("Welcome %s", name)

	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		log.Printf("failed to create tts_cache directory: %v", err)
		return
	}

	safeName := sanitizeFilename(name)
	audioPath := filepath.Join(cacheDir, fmt.Sprintf("welcome_%s.mp3", safeName))

	if _, err := os.Stat(audioPath); os.IsNotExist(err) {
		if _, err := os.Stat(gttsCli); err == nil {
			log.Printf("Generating TTS voice: %q -> %s", welcomeText, audioPath)
			cmd := exec.Command(gttsCli, welcomeText, "-o", audioPath)
			var stderr bytes.Buffer
			cmd.Stderr = &stderr
			if err := cmd.Run(); err != nil {
				log.Printf("gtts-cli failed: %v (stderr: %s)", err, stderr.String())
			}
		} else {
			log.Printf("gtts-cli not found at %s, falling back to macOS say", gttsCli)
		}
	}

	if _, err := os.Stat(audioPath); err == nil {
		log.Printf("Playing TTS voice for %s", name)
		cmd := exec.Command("afplay", audioPath)
		var stderr bytes.Buffer
		cmd.Stderr = &stderr
		if err := cmd.Run(); err != nil {
			log.Printf("afplay failed: %v (stderr: %s)", err, stderr.String())
		}
		return
	}

	log.Printf("Speaking fallback greeting for %s via macOS say", name)
	cmd := exec.Command("say", welcomeText)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		log.Printf("say failed: %v (stderr: %s)", err, stderr.String())
	}
}

func sanitizeFilename(s string) string {
	var result strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			result.WriteRune(r)
		} else if r == ' ' {
			result.WriteRune('_')
		}
	}
	return result.String()
}
