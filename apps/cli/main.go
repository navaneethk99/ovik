package main

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// ANSI Color Escape Codes
const (
	Reset     = "\033[0m"
	Bold      = "\033[1m"
	Dim       = "\033[2m"
	Italic    = "\033[3m"
	Underline = "\033[4m"

	// Foreground Colors
	Black   = "\033[30m"
	Red     = "\033[31m"
	Green   = "\033[32m"
	Yellow  = "\033[33m"
	Blue    = "\033[34m"
	Magenta = "\033[35m"
	Cyan    = "\033[36m"
	White   = "\033[37m"
	Grey    = "\033[90m"

	// High Intensity Foreground Colors
	GreenHi = "\033[92m"
	CyanHi  = "\033[96m"

	// Background Colors
	BgRed     = "\033[41m"
	BgGreen   = "\033[42m"
	BgYellow  = "\033[43m"
	BgBlue    = "\033[44m"
	BgMagenta = "\033[45m"
	BgCyan    = "\033[46m"
	BgBlack   = "\033[40m"
)

// Default Configuration
const defaultBackendURL = "http://localhost:8080"

// Global Variables
var backendURL = defaultBackendURL
var reader = bufio.NewReader(os.Stdin)

// API Data Structures
type ControlStatus struct {
	Frontend          bool `json:"frontend"`
	Backend           bool `json:"backend"`
	Recognizer        bool `json:"recognizer"`
	RecognizerRunning bool `json:"recognizer_running"`
}

type AttendanceRecord struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Status       string    `json:"status"`
	RecognizedAt time.Time `json:"recognized_at"`
}

type RegisterRequest struct {
	Name             string `json:"name"`
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
	Image            string `json:"image"` // Base64 encoded JPEG/PNG
}

// Spinner Helper Struct
type Spinner struct {
	done chan struct{}
}

func startSpinner(message string) *Spinner {
	s := &Spinner{done: make(chan struct{})}
	chars := []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}
	go func() {
		i := 0
		ticker := time.NewTicker(80 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-s.done:
				return
			case <-ticker.C:
				fmt.Printf("\r\033[K  %s%s%s %s", CyanHi, chars[i], Reset, message)
				i = (i + 1) % len(chars)
			}
		}
	}()
	return s
}

func (s *Spinner) stop(successMessage string, isError bool) {
	close(s.done)
	time.Sleep(100 * time.Millisecond) // Give goroutine a moment to exit
	fmt.Printf("\r\033[K")
	if isError {
		fmt.Printf("  %s✗%s %s\n", Red, Reset, successMessage)
	} else {
		fmt.Printf("  %s✓%s %s\n", Green, Reset, successMessage)
	}
}

// Print OVIK Ascii Art Header
func printBanner() {
	fmt.Printf("%s%s", Magenta, Bold)
	fmt.Println("  ██████╗ ██╗   ██╗██╗██╗  ██╗")
	fmt.Println(" ██╔═══██╗██║   ██║██║██║ ██╔╝")
	fmt.Println(" ██║   ██║██║   ██║██║█████╔╝ ")
	fmt.Println(" ██║   ██║╚██╗ ██╔╝██║██╔═██╗ ")
	fmt.Println(" ╚██████╔╝ ╚████╔╝ ██║██║  ██╗")
	fmt.Println("  ╚═════╝   ╚═══╝  ╚═╝╚═╝  ╚═╝")
	fmt.Printf("  %s%s%s   Attendance Control Center (CLI)\n", Dim, Italic, White)
	fmt.Println(Reset)
}

func getBackendURL() string {
	if envVal := os.Getenv("OVIK_BACKEND_URL"); envVal != "" {
		return strings.TrimSuffix(envVal, "/")
	}
	return backendURL
}

func main() {
	// Parse CLI Arguments
	args := os.Args[1:]

	// Look for global --url override
	for i, arg := range args {
		if (arg == "--url" || arg == "-u") && i+1 < len(args) {
			backendURL = strings.TrimSuffix(args[i+1], "/")
			// remove the flag & its value from args
			args = append(args[:i], args[i+2:]...)
			break
		}
	}

	backendURL = getBackendURL()

	if len(args) == 0 {
		printHelp()
		return
	}

	subcommand := args[0]
	switch subcommand {
	case "status":
		cmdStatus()
	case "toggle":
		cmdToggle(args[1:])
	case "logs", "attendance":
		cmdLogs(args[1:])
	case "register":
		cmdRegister()
	case "monitor":
		cmdMonitor()
	case "help", "-h", "--help":
		printHelp()
	default:
		fmt.Printf("%sError: Unknown command '%s'%s\n\n", Red, subcommand, Reset)
		printHelp()
	}
}

func printHelp() {
	printBanner()
	fmt.Printf("%s%sUSAGE%s\n", Bold, White, Reset)
	fmt.Println("  ovik <command> [flags]")
	fmt.Println()
	fmt.Printf("%s%sCOMMANDS%s\n", Bold, White, Reset)
	fmt.Printf("  %sstatus%s      Check OVIK backend system and controller states\n", Cyan, Reset)
	fmt.Printf("  %stoggle%s      Toggle subsystem status (frontend, backend, or recognizer)\n", Cyan, Reset)
	fmt.Printf("  %slogs%s        Fetch and display recent employee check-in logs\n", Cyan, Reset)
	fmt.Printf("  %sregister%s    Launch interactive employee enrollment wizard (uploads base64 face image)\n", Cyan, Reset)
	fmt.Printf("  %smonitor%s     Enter live-updating full-screen terminal diagnostics monitor\n", Cyan, Reset)
	fmt.Printf("  %shelp%s        Show this help documentation\n", Cyan, Reset)
	fmt.Println()
	fmt.Printf("%s%sGLOBAL FLAGS%s\n", Bold, White, Reset)
	fmt.Printf("  %s-u, --url%s   Specify backend REST server URL (default: http://localhost:8080)\n", Cyan, Reset)
	fmt.Printf("  Alternatively, set the %sOVIK_BACKEND_URL%s environment variable.\n", Yellow, Reset)
	fmt.Println()
	fmt.Printf("%s%sEXAMPLES%s\n", Bold, White, Reset)
	fmt.Println("  ovik status")
	fmt.Println("  ovik toggle recognizer")
	fmt.Println("  ovik logs --limit 15")
	fmt.Println("  ovik -u http://192.168.1.100:8080 monitor")
	fmt.Println()
}

// subcommand: status
func cmdStatus() {
	printBanner()
	fmt.Printf("%sConnecting to backend at %s%s%s...\n\n", Grey, Cyan, backendURL, Reset)

	s := startSpinner("Fetching OVIK System Status")
	status, err := fetchControlStatus()
	if err != nil {
		s.stop("Failed to connect to backend", true)
		fmt.Printf("\n%sError: %v%s\n", Red, err, Reset)
		fmt.Println("Make sure the backend is running and the URL is correct.")
		return
	}
	s.stop("Connected successfully", false)

	// Fetch health check for db status
	dbStatus := "unknown"
	client := &http.Client{Timeout: 3 * time.Second}
	if resp, err := client.Get(backendURL + "/health"); err == nil {
		defer resp.Body.Close()
		var health struct {
			Database string `json:"database"`
		}
		if json.NewDecoder(resp.Body).Decode(&health) == nil {
			if health.Database == "ok" {
				dbStatus = "healthy"
			} else {
				dbStatus = "unhealthy"
			}
		} else {
			if resp.StatusCode == http.StatusOK {
				dbStatus = "healthy"
			} else {
				dbStatus = "unhealthy"
			}
		}
	} else {
		dbStatus = "unreachable"
	}

	fmt.Println()
	fmt.Printf("%s┌──────────────────────────────────────────────┐%s\n", Blue, Reset)
	fmt.Printf("%s│ %s%sOVIK SYSTEM REPORT%s                       %s│%s\n", Blue, Bold, White, Reset, Blue, Reset)
	fmt.Printf("%s├──────────────────────────────────────────────┤%s\n", Blue, Reset)
	
	fmt.Printf("%s│%s  Backend Endpoint:   %s%-24s%s │\n", Blue, Reset, Cyan, backendURL, Reset)
	
	dbColor := Red
	if dbStatus == "healthy" {
		dbColor = Green
	}
	fmt.Printf("%s│%s  Database Status:    %s%-24s%s │\n", Blue, Reset, dbColor, dbStatus, Reset)

	fmt.Printf("%s│%s  Subsystems:                                 │\n", Blue, Reset)
	
	feStatus := fmtState(status.Frontend)
	fmt.Printf("%s│%s    - Web Frontend:   %-28s  %s│\n", Blue, Reset, feStatus, Blue)
	
	beStatus := fmtState(status.Backend)
	fmt.Printf("%s│%s    - REST Service:   %-28s  %s│\n", Blue, Reset, beStatus, Blue)

	recStatus := fmtState(status.Recognizer)
	fmt.Printf("%s│%s    - Scan Controller:%-28s  %s│\n", Blue, Reset, recStatus, Blue)
	
	var recRunning string
	if status.RecognizerRunning {
		recRunning = Green + "● SPAWNED" + Reset
	} else {
		recRunning = Red + "○ TERMINATED" + Reset
	}
	fmt.Printf("%s│%s    - Daemon Process: %-28s  %s│\n", Blue, Reset, recRunning, Blue)

	fmt.Printf("%s└──────────────────────────────────────────────┘%s\n", Blue, Reset)
	fmt.Println()
}

func fmtState(enabled bool) string {
	if enabled {
		return Green + "✔ ENABLED" + Reset
	}
	return Red + "✘ DISABLED" + Reset
}

// subcommand: toggle
func cmdToggle(args []string) {
	service := "recognizer"
	if len(args) > 0 {
		service = strings.ToLower(args[0])
	}

	if service != "frontend" && service != "backend" && service != "recognizer" {
		fmt.Printf("%sError: Invalid service '%s'. Must be frontend, backend, or recognizer.%s\n", Red, service, Reset)
		return
	}

	s := startSpinner(fmt.Sprintf("Fetching current state of '%s'", service))
	status, err := fetchControlStatus()
	if err != nil {
		s.stop("Failed to get current status", true)
		fmt.Printf("%sError: %v%s\n", Red, err, Reset)
		return
	}
	s.stop("Fetched current state", false)

	// Determine new state
	currentVal := false
	switch service {
	case "frontend":
		currentVal = status.Frontend
	case "backend":
		currentVal = status.Backend
	case "recognizer":
		currentVal = status.Recognizer
	}
	newVal := !currentVal

	actionStr := "Enabling"
	if !newVal {
		actionStr = "Disabling"
	}

	s2 := startSpinner(fmt.Sprintf("%s '%s' Subsystem", actionStr, service))

	// Call toggle API
	bodyData := map[string]any{
		"service": service,
		"enable":  newVal,
	}
	jsonBody, _ := json.Marshal(bodyData)
	
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Post(backendURL+"/control/toggle", "application/json", bytes.NewBuffer(jsonBody))
	if err != nil {
		s2.stop(fmt.Sprintf("Failed to toggle '%s'", service), true)
		fmt.Printf("%sError: %v%s\n", Red, err, Reset)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var errData struct {
			Error string `json:"error"`
		}
		json.NewDecoder(resp.Body).Decode(&errData)
		s2.stop(fmt.Sprintf("Server returned error: %s", errData.Error), true)
		return
	}

	var updatedStatus ControlStatus
	if err := json.NewDecoder(resp.Body).Decode(&updatedStatus); err != nil {
		s2.stop("Failed to parse server response", true)
		return
	}

	s2.stop(fmt.Sprintf("Toggled successfully!"), false)
	fmt.Println()
	fmt.Printf("Subsystem %s%s%s is now %s\n\n", Bold, service, Reset, fmtState(newVal))
}

// subcommand: logs
func cmdLogs(args []string) {
	limit := 25
	for i, arg := range args {
		if (arg == "--limit" || arg == "-l") && i+1 < len(args) {
			parsed, err := strconv.Atoi(args[i+1])
			if err == nil && parsed > 0 {
				limit = parsed
			}
		}
	}

	s := startSpinner("Fetching attendance log records")
	records, err := fetchAttendanceRecords(limit)
	if err != nil {
		s.stop("Failed to fetch logs", true)
		fmt.Printf("%sError: %v%s\n", Red, err, Reset)
		return
	}
	s.stop(fmt.Sprintf("Fetched %d log records", len(records)), false)
	fmt.Println()

	if len(records) == 0 {
		fmt.Println("No check-in logs found in database.")
		return
	}

	// Print Clean ASCII Table
	fmt.Printf("%s┌───────┬──────────────────────────┬───────────┬────────────────────────────────┐%s\n", Cyan, Reset)
	fmt.Printf("%s│ %sID%s    │ %sEMPLOYEE NAME%s            │ %sSTATUS%s    │ %sCHECK-IN TIME (KOLKATA)%s       │%s\n", Cyan, Bold, Reset, Bold, Reset, Bold, Reset, Bold, Reset, Cyan)
	fmt.Printf("%s├───────┼──────────────────────────┼───────────┼────────────────────────────────┤%s\n", Cyan, Reset)

	for _, rec := range records {
		idStr := fmt.Sprintf("%-5d", rec.ID)
		nameStr := fmt.Sprintf("%-24s", truncate(rec.Name, 24))
		statusVal := strings.ToUpper(rec.Status)
		
		statusStr := fmt.Sprintf("%-9s", statusVal)
		if statusVal == "PRESENT" {
			statusStr = Green + fmt.Sprintf("%-9s", statusVal) + Reset
		} else if statusVal == "ABSENT" {
			statusStr = Red + fmt.Sprintf("%-9s", statusVal) + Reset
		}

		// Convert to IST (Kolkata) time zone
		loc, err := time.LoadLocation("Asia/Kolkata")
		var timeStr string
		if err == nil {
			timeStr = rec.RecognizedAt.In(loc).Format("2006-01-02 03:04:05 PM")
		} else {
			timeStr = rec.RecognizedAt.Format("2006-01-02 03:04:05 PM")
		}
		timeColStr := fmt.Sprintf("%-30s", timeStr)

		fmt.Printf("│ %s │ %s │ %s │ %s │\n", idStr, nameStr, statusStr, timeColStr)
	}
	fmt.Printf("%s└───────┴──────────────────────────┴───────────┴────────────────────────────────┘%s\n", Cyan, Reset)
	fmt.Println()
}

// subcommand: register
func cmdRegister() {
	printBanner()
	fmt.Printf("%sEMPLOYEE ENROLLMENT WIZARD%s\n", Bold+Underline, Reset)
	fmt.Println("Please provide the following details to register the employee's profile and face details.")
	fmt.Println()

	var req RegisterRequest

	req.Name = promptRequired("1. Full Name")
	req.Position = promptOptional("2. Job Position/Title", "Staff")
	req.Compensation = promptOptional("3. Compensation/Salary (e.g. 500000)", "N/A")
	
	ageStr := promptOptional("4. Age", "0")
	ageVal, _ := strconv.Atoi(ageStr)
	req.Age = ageVal

	req.Address = promptOptional("5. Residential Address", "N/A")
	req.PanCard = promptOptional("6. PAN Card Identification", "N/A")
	req.AadhaarCard = promptOptional("7. Aadhaar Card ID (12 digits)", "N/A")
	req.Email = promptOptional("8. Email Address", "N/A")
	req.Phone = promptOptional("9. Mobile Phone Number", "N/A")
	req.EmergencyContact = promptOptional("10. Emergency Contact Info", "N/A")

	today := time.Now().Format("2006-01-02")
	req.DateOfJoining = promptOptional("11. Date of Joining (YYYY-MM-DD)", today)

	imgPath := ""
	for {
		imgPath = promptRequired("12. Path to Face Photo File (JPEG/PNG)")
		if _, err := os.Stat(imgPath); os.IsNotExist(err) {
			fmt.Printf("  %sError: File '%s' does not exist. Please enter a valid path.%s\n", Red, imgPath, Reset)
			continue
		}
		break
	}

	// Read and base64-encode image file
	s := startSpinner("Reading and encoding image file")
	imgBytes, err := os.ReadFile(imgPath)
	if err != nil {
		s.stop("Failed to read image file", true)
		fmt.Printf("%sError: %v%s\n", Red, err, Reset)
		return
	}

	// Detect content type / validate formats
	ext := strings.ToLower(filepath.Ext(imgPath))
	mimeType := "image/jpeg"
	if ext == ".png" {
		mimeType = "image/png"
	}
	_ = mimeType // keep placeholder check
	
	base64Str := base64.StdEncoding.EncodeToString(imgBytes)
	req.Image = base64Str
	s.stop("Image encoded successfully", false)

	fmt.Println()
	fmt.Printf("%sAre you sure you want to register employee '%s'? (y/n): %s", Bold, req.Name, Reset)
	confirm, _ := reader.ReadString('\n')
	confirm = strings.TrimSpace(strings.ToLower(confirm))
	if confirm != "y" && confirm != "yes" {
		fmt.Println("Registration aborted.")
		return
	}

	s2 := startSpinner("Submitting registration details and face profile to server")
	
	jsonBody, err := json.Marshal(req)
	if err != nil {
		s2.stop("Failed to marshal request payload", true)
		return
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Post(backendURL+"/register", "application/json", bytes.NewBuffer(jsonBody))
	if err != nil {
		s2.stop("Failed to submit details", true)
		fmt.Printf("%sError: %v%s\n", Red, err, Reset)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		s2.stop(fmt.Sprintf("Failed to register: Code %d", resp.StatusCode), true)
		fmt.Printf("%sServer Error Response: %s%s\n", Red, string(bodyBytes), Reset)
		return
	}

	s2.stop(fmt.Sprintf("Employee '%s' successfully registered and face model updated!", req.Name), false)
	fmt.Println()
}

func promptRequired(label string) string {
	for {
		fmt.Printf("%s%s *:%s ", Bold, label, Reset)
		input, err := reader.ReadString('\n')
		if err != nil {
			continue
		}
		input = strings.TrimSpace(input)
		if input == "" {
			fmt.Printf("  %sError: This field is required.%s\n", Red, Reset)
			continue
		}
		return input
	}
}

func promptOptional(label string, defaultValue string) string {
	fmt.Printf("%s%s [%s]:%s ", Bold, label, defaultValue, Reset)
	input, err := reader.ReadString('\n')
	if err != nil {
		return defaultValue
	}
	input = strings.TrimSpace(input)
	if input == "" {
		return defaultValue
	}
	return input
}

// subcommand: monitor
func cmdMonitor() {
	// Setup SIGINT handler to restore terminal screen when exiting
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-c
		// Clear screen, show cursor, and exit
		fmt.Print("\033[?25h\033[H\033[2J")
		fmt.Println("Monitor closed. Goodbye!")
		os.Exit(0)
	}()

	// Hide cursor
	fmt.Print("\033[?25l")

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	// Initial render
	renderMonitorDashboard()

	for range ticker.C {
		renderMonitorDashboard()
	}
}

func renderMonitorDashboard() {
	status, err := fetchControlStatus()
	isOffline := err != nil

	var records []AttendanceRecord
	if !isOffline {
		records, _ = fetchAttendanceRecords(10)
	}

	// ANSI clear screen and reset cursor
	fmt.Print("\033[H\033[2J")

	// Print Dashboard Header
	fmt.Printf("%s%s┌──────────────────────────────────────────────────────────────────────────────┐%s\n", BgBlue, White, Reset)
	fmt.Printf("%s%s│  OVIK MONITORING DASHBOARD - LIVE FEED                                       │%s\n", BgBlue, White, Reset)
	fmt.Printf("%s%s│  Time: %-21s  Backend Endpoint: %-26s │%s\n", BgBlue, White, time.Now().Format("2006-01-02 03:04:05 PM"), backendURL, Reset)
	fmt.Printf("%s%s└──────────────────────────────────────────────────────────────────────────────┘%s\n", BgBlue, White, Reset)
	fmt.Println()

	// Service Status Boxes
	fmt.Printf("%sSYSTEM STATUS%s\n", Bold+Underline, Reset)
	
	if isOffline {
		fmt.Printf("  Connection: %s● OFFLINE (Cannot connect to backend)%s\n\n", Red+Bold, Reset)
		fmt.Println("  Waiting for backend connection recovery...")
		return
	}

	fmt.Printf("  Connection: %s● ONLINE%s\n", Green+Bold, Reset)

	// Format Subsystems
	feStatus := Red + "OFFLINE" + Reset
	if status.Frontend {
		feStatus = Green + "ACTIVE" + Reset
	}
	beStatus := Red + "OFFLINE" + Reset
	if status.Backend {
		beStatus = Green + "ACTIVE" + Reset
	}
	recStatus := Red + "DISABLED" + Reset
	if status.Recognizer {
		if status.RecognizerRunning {
			recStatus = Green + "ACTIVE (SPAWNED)" + Reset
		} else {
			recStatus = Yellow + "ENABLED (NO PROCESS)" + Reset
		}
	}

	fmt.Printf("  Web Frontend:  [%-8s]     REST Backend: [%-8s]     Camera Scanner: [%s]\n", feStatus, beStatus, recStatus)
	fmt.Println()

	// Display logs
	fmt.Printf("%sRECENT CHECK-INS%s\n", Bold+Underline, Reset)
	fmt.Println()

	if len(records) == 0 {
		fmt.Println("  No recent check-ins recorded in DB.")
		fmt.Println()
		return
	}

	fmt.Printf("  %-6s  %-24s  %-10s  %-26s\n", "ID", "NAME", "STATUS", "TIME")
	fmt.Println("  ----------------------------------------------------------------------------")

	for _, rec := range records {
		idStr := fmt.Sprintf("%d", rec.ID)
		nameStr := truncate(rec.Name, 24)
		statusVal := strings.ToUpper(rec.Status)
		
		statusStr := statusVal
		if statusVal == "PRESENT" {
			statusStr = Green + statusVal + Reset
		} else if statusVal == "ABSENT" {
			statusStr = Red + statusVal + Reset
		}

		// Convert to IST (Kolkata)
		loc, err := time.LoadLocation("Asia/Kolkata")
		var timeStr string
		if err == nil {
			timeStr = rec.RecognizedAt.In(loc).Format("2006-01-02 03:04:05 PM")
		} else {
			timeStr = rec.RecognizedAt.Format("2006-01-02 03:04:05 PM")
		}

		fmt.Printf("  %-6s  %-24s  %-10s  %-26s\n", idStr, nameStr, statusStr, timeStr)
	}
	fmt.Println()
	fmt.Printf("%sPress Ctrl+C to stop monitoring.%s\n", Grey, Reset)
}

// HTTP Helper Functions
func fetchControlStatus() (*ControlStatus, error) {
	client := &http.Client{Timeout: 4 * time.Second}
	resp, err := client.Get(backendURL + "/control/status")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("server returned status code %d", resp.StatusCode)
	}

	var status ControlStatus
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		return nil, err
	}
	return &status, nil
}

func fetchAttendanceRecords(limit int) ([]AttendanceRecord, error) {
	client := &http.Client{Timeout: 4 * time.Second}
	resp, err := client.Get(fmt.Sprintf("%s/attendance?limit=%d", backendURL, limit))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("server returned status code %d", resp.StatusCode)
	}

	var records []AttendanceRecord
	if err := json.NewDecoder(resp.Body).Decode(&records); err != nil {
		return nil, err
	}
	return records, nil
}

// String Helper Utilities
func truncate(str string, limit int) string {
	if len(str) <= limit {
		return str
	}
	return str[:limit-3] + "..."
}
