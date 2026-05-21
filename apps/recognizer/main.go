package main

import (
	"bytes"
	"fmt"
	"image/color"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/Kagami/go-face"
	"github.com/joho/godotenv"
	"gocv.io/x/gocv"

	"ovik/pkg/attendance"
)

const (
	localModelDir       = "models"
	repoModelDir        = "apps/recognizer/models"
	localKnownDir       = "known_faces"
	repoKnownDir        = "apps/recognizer/known_faces"
	tolerance           = 0.45
)

type attendanceClient struct {
	url        string
	authToken  string
	httpClient *http.Client
	visibleNow map[string]bool
}

func main() {
	loadEnv(".env", "../../.env")

	modelDir := resolvePath(localModelDir, repoModelDir)
	knownDir := resolvePath(localKnownDir, repoKnownDir)
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

	rec.SetSamples(samples, labels)

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
		if err == nil {
			for _, f := range faces {
				name := "Unknown"

				classID := rec.ClassifyThreshold(f.Descriptor, tolerance)
				if classID >= 0 {
					name = names[int32(classID)]
					seenNames[name] = true
					if !attendance.isVisible(name) {
						if err := attendance.markPresent(name); err != nil {
						log.Printf("attendance update failed for %s: %v", name, err)
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

func (c *attendanceClient) markPresent(name string) error {
	if c.url == "" {
		return nil
	}

	payload := attendance.Event{
		Name:         name,
		Status:       "present",
		RecognizedAt: time.Now().UTC().Format(time.RFC3339),
	}

	body, err := payload.Marshal()
	if err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, c.url, bytes.NewReader(body))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	if c.authToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.authToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("unexpected status code %d", resp.StatusCode)
	}

	log.Printf("marked %s as present", name)

	return nil
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
