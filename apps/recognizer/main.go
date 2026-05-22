package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image/color"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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

var tolerance float32 = 0.35

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

				// Calculate exact distances to all known samples for diagnostic logging
				var distLogs []string
				for idx, sample := range samples {
					dist := face.SquaredEuclideanDistance(f.Descriptor, sample)
					sampleLabel := labels[idx]
					sampleName := names[sampleLabel]
					distLogs = append(distLogs, fmt.Sprintf("%s=%.4f", sampleName, dist))
				}
				distStr := strings.Join(distLogs, ", ")

				classID := rec.ClassifyThreshold(f.Descriptor, tolerance)
				if classID >= 0 {
					name = names[int32(classID)]
					seenNames[name] = true
				}
				log.Printf("  Face %d at %v: classID=%d, name=%s, tolerance=%.4f, isVisible=%t, distances: {%s}",
					i, f.Rectangle, classID, name, tolerance, attendance.isVisible(name), distStr)

				if classID >= 0 {
					if !attendance.isVisible(name) {
						if recorded, err := attendance.markPresent(name); err != nil {
							log.Printf("attendance update failed for %s: %v", name, err)
						} else if recorded {
							// Update visibility immediately to prevent multiple markPresent calls in the same frame
							attendance.visibleNow[name] = true
							go playWelcomeVoice(name)
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

func (c *attendanceClient) markPresent(name string) (bool, error) {
	if c.url == "" {
		return true, nil
	}

	payload := attendance.Event{
		Name:         name,
		Status:       "present",
		RecognizedAt: time.Now().UTC().Format(time.RFC3339),
	}

	body, err := payload.Marshal()
	if err != nil {
		return false, err
	}

	req, err := http.NewRequest(http.MethodPost, c.url, bytes.NewReader(body))
	if err != nil {
		return false, err
	}

	req.Header.Set("Content-Type", "application/json")
	if c.authToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.authToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return false, fmt.Errorf("unexpected status code %d", resp.StatusCode)
	}

	var res struct {
		Name   string `json:"name"`
		Status string `json:"status"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err == nil {
		if res.Status == "cooldown" {
			log.Printf("attendance check: %s is in cooldown, skipping", name)
			return false, nil
		}
	}

	log.Printf("marked %s as present", name)

	return true, nil
}

func (c *attendanceClient) isVisible(name string) bool {
	return c.visibleNow[name]
}

func (c *attendanceClient) updateVisible(seenNames map[string]bool) {
	c.visibleNow = seenNames
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

	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		log.Printf("failed to create tts_cache directory: %v", err)
		return
	}

	safeName := sanitizeFilename(name)
	audioPath := filepath.Join(cacheDir, fmt.Sprintf("welcome_%s.mp3", safeName))

	if _, err := os.Stat(audioPath); os.IsNotExist(err) {
		welcomeText := fmt.Sprintf("Welcome %s", name)
		log.Printf("Generating TTS voice: %q -> %s", welcomeText, audioPath)
		cmd := exec.Command(gttsCli, welcomeText, "-o", audioPath)
		var stderr bytes.Buffer
		cmd.Stderr = &stderr
		if err := cmd.Run(); err != nil {
			log.Printf("gtts-cli failed: %v (stderr: %s)", err, stderr.String())
			return
		}
	}

	log.Printf("Playing TTS voice for %s", name)
	cmd := exec.Command("afplay", audioPath)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		log.Printf("afplay failed: %v (stderr: %s)", err, stderr.String())
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
