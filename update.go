package main

// Software update from inside ProcureHub (administrators only).
//
// The administrator uploads the release zip (or the program file itself) from
// Settings, from any computer or phone. ProcureHub then:
//  1. checks the file is a ProcureHub program built for this server's
//     operating system, and reads its version;
//  2. makes a full backup;
//  3. test-starts the new version on a copy of the database, so a version
//     that cannot open the data is never switched on;
//  4. puts the new program in place of the old one (the old one is kept
//     next to it as .old), and restarts. The data folder is not touched.
// Browsers that are open reload by themselves when the new version answers.

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

// buildTag is stored in every program file; an uploaded update is recognised by it.
const buildTag = "PROCUREHUB-BUILD:" + appVersion + ":" + runtime.GOOS + "/" + runtime.GOARCH + ":END"

var (
	buildTagRe = regexp.MustCompile(`PROCUREHUB-BUILD:([0-9]+\.[0-9]+\.[0-9]+):([a-z0-9]+)/([a-z0-9]+):END`)
	updMu      sync.Mutex
	updBusy    bool
	updSince   time.Time
	selfArgs   []string // the arguments ProcureHub was started with, for the restart
)

type updFile struct {
	bin             []byte
	version, osArch string
	extras          map[string][]byte // setup guide etc. from the zip
}

func osName(osArch string) string {
	switch strings.SplitN(osArch, "/", 2)[0] {
	case "windows":
		return "Windows"
	case "linux":
		return "Linux"
	case "darwin":
		return "Mac"
	}
	return osArch
}

// readBuild finds the build tag in a program file.
func readBuild(b []byte) (version, osArch string, ok bool) {
	if !(bytes.HasPrefix(b, []byte("MZ")) || bytes.HasPrefix(b, []byte("\x7fELF")) || bytes.HasPrefix(b, []byte{0xcf, 0xfa, 0xed, 0xfe})) {
		return "", "", false
	}
	for _, m := range buildTagRe.FindAllSubmatch(b, -1) {
		return string(m[1]), string(m[2]) + "/" + string(m[3]), true
	}
	return "", "", false
}

// pickUpdate takes the uploaded zip or program file and returns the program for this server.
func pickUpdate(body []byte) (*updFile, error) {
	mine := runtime.GOOS + "/" + runtime.GOARCH
	if !bytes.HasPrefix(body, []byte("PK\x03\x04")) {
		v, oa, ok := readBuild(body)
		if !ok {
			return nil, fmt.Errorf("This file is not a ProcureHub program that can be installed from inside the software. Upload the RGS-ProcureHub zip (version 7.2.0 or later) exactly as you received it.")
		}
		if oa != mine {
			return nil, fmt.Errorf("This program is for %s, but this ProcureHub server runs on %s. Upload the zip, or the program file for %s.", osName(oa), osName(mine), osName(mine))
		}
		return &updFile{bin: body, version: v, osArch: oa}, nil
	}
	zr, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		return nil, fmt.Errorf("The zip file is damaged. Download it again and retry.")
	}
	out := &updFile{extras: map[string][]byte{}}
	var other string
	for _, f := range zr.File {
		base := filepath.Base(f.Name)
		if f.FileInfo().IsDir() || f.UncompressedSize64 > 400<<20 {
			continue
		}
		if base == "SETUP-GUIDE.html" || base == "Fix-Network.cmd" {
			if rc, err := f.Open(); err == nil {
				b, _ := io.ReadAll(io.LimitReader(rc, 8<<20))
				rc.Close()
				out.extras[base] = b
			}
			continue
		}
		if f.UncompressedSize64 < 1<<20 {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			continue
		}
		b, err := io.ReadAll(io.LimitReader(rc, 400<<20))
		rc.Close()
		if err != nil {
			continue
		}
		v, oa, ok := readBuild(b)
		if !ok {
			continue
		}
		if oa != mine {
			other = oa
			continue
		}
		out.bin, out.version, out.osArch = b, v, oa
	}
	if out.bin == nil {
		if other != "" {
			return nil, fmt.Errorf("This zip only has the program for %s, but this server runs on %s.", osName(other), osName(mine))
		}
		return nil, fmt.Errorf("No ProcureHub program that can be installed from inside the software was found in this zip. Use the RGS-ProcureHub zip of version 7.2.0 or later, exactly as you received it.")
	}
	return out, nil
}

// selfTest starts the new program on a copy of the database and checks it opens it.
func selfTest(newExe, version string) error {
	tmp, err := os.MkdirTemp("", "procurehub-update-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmp)
	mu.Lock()
	b, err := os.ReadFile(dbPath)
	mu.Unlock()
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(tmp, "procurehub-db.json"), b, 0600); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	c := exec.CommandContext(ctx, newExe, "--selftest", "--installed", "--here", "--no-browser", "--no-firewall", "--data", tmp)
	c.Dir = tmp
	hideWindow(c)
	out, err := c.CombinedOutput()
	if err != nil || !strings.Contains(string(out), "SELFTEST OK "+version) {
		msg := strings.TrimSpace(string(out))
		if len(msg) > 400 {
			msg = msg[len(msg)-400:]
		}
		if msg == "" && err != nil {
			msg = err.Error()
		}
		return fmt.Errorf("the new version could not open your data: %s", msg)
	}
	return nil
}

func hUpdateInfo(w http.ResponseWriter, r *http.Request, u *User) {
	exe, _ := os.Executable()
	_, old := os.Stat(exe + ".old")
	writeJSON(w, 200, map[string]any{"version": appVersion, "os": osName(runtime.GOOS), "build": buildTag, "program": exe, "data": dataDir, "hasOld": old == nil, "busy": updBusy})
}

func hUpdate(w http.ResponseWriter, r *http.Request, u *User) {
	if r.Method != http.MethodPost {
		fail(w, 405, "Method not allowed.")
		return
	}
	// receive the whole file first, with a time limit: a phone upload that stalls
	// (screen locked, network lost) must not keep the update blocked
	_ = http.NewResponseController(w).SetReadDeadline(time.Now().Add(20 * time.Minute))
	body, err := io.ReadAll(io.LimitReader(r.Body, 500<<20))
	if err != nil {
		fail(w, 400, "The file could not be received completely (the connection was slow or interrupted). Try again, preferably on Wi-Fi or from a computer.")
		return
	}
	updMu.Lock()
	if updBusy && time.Since(updSince) < 15*time.Minute {
		updMu.Unlock()
		fail(w, 409, "Another update is being installed right now. Wait a minute; ProcureHub restarts by itself when it is done.")
		return
	}
	updBusy, updSince = true, time.Now()
	updMu.Unlock()
	done := false
	defer func() {
		if !done {
			updMu.Lock()
			updBusy = false
			updMu.Unlock()
		}
	}()
	up, err := pickUpdate(body)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	if versionLess(up.version, appVersion) && r.URL.Query().Get("older") != "1" {
		writeJSON(w, 409, map[string]any{"error": fmt.Sprintf("This file is version %s, older than the running version %s.", up.version, appVersion), "older": true, "version": up.version})
		return
	}
	if r.URL.Query().Get("check") == "1" {
		writeJSON(w, 200, map[string]any{"ok": true, "version": up.version, "current": appVersion})
		return
	}
	exe, err := os.Executable()
	if err == nil {
		if real, e := filepath.EvalSymlinks(exe); e == nil {
			exe = real
		}
	}
	if err != nil {
		fail(w, 500, "Cannot find the program file: "+err.Error())
		return
	}
	if err := runBackup(true); err != nil {
		fail(w, 500, "A backup could not be made first, so nothing was changed: "+err.Error())
		return
	}
	newExe := exe + ".new"
	if err := os.WriteFile(newExe, up.bin, 0755); err != nil {
		fail(w, 500, "The new program could not be saved next to the old one ("+err.Error()+"). Check that the program folder is not read-only.")
		return
	}
	if err := selfTest(newExe, up.version); err != nil {
		os.Remove(newExe)
		fail(w, 500, "Nothing was changed: "+err.Error())
		return
	}
	for name, b := range up.extras {
		_ = os.WriteFile(filepath.Join(filepath.Dir(exe), name), b, 0644)
	}
	mu.Lock()
	st.Audit = append(st.Audit, AuditEntry{At: time.Now().UnixMilli(), User: u.Username, Name: u.Name, Col: "settings", ID: "software", Op: "update", Ref: "ProcureHub " + appVersion + " → " + up.version})
	saveLocked()
	mu.Unlock()
	log.Printf("%s is installing ProcureHub %s (was %s).", u.Name, up.version, appVersion)
	done = true
	writeJSON(w, 200, map[string]any{"ok": true, "version": up.version, "from": appVersion})
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
	go switchAndRestart(exe, newExe, up.version)
}

// switchAndRestart puts the new program in place and restarts ProcureHub.
func switchAndRestart(exe, newExe, version string) {
	time.Sleep(1500 * time.Millisecond)
	mu.Lock() // no more writes from here on
	saveLocked()
	oldExe := exe + ".old"
	os.Remove(oldExe)
	undo := func(why error) {
		log.Printf("Update to %s stopped, still running %s: %v", version, appVersion, why)
		if _, err := os.Stat(exe); err != nil {
			os.Rename(oldExe, exe)
		}
		os.Remove(newExe)
		mu.Unlock()
		updMu.Lock()
		updBusy = false
		updMu.Unlock()
	}
	if runtime.GOOS == "windows" {
		if err := os.Rename(exe, oldExe); err != nil {
			undo(err)
			return
		}
	} else if b, err := os.ReadFile(exe); err == nil {
		os.WriteFile(oldExe, b, 0755)
	}
	if err := os.Rename(newExe, exe); err != nil {
		undo(err)
		return
	}
	fmt.Println("==============================================================")
	fmt.Printf("  Updating ProcureHub %s → %s. Your data is kept.\n", appVersion, version)
	fmt.Println("==============================================================")
	if runtime.GOOS == "linux" && os.Getenv("INVOCATION_ID") != "" {
		os.Exit(0) // systemd (Restart=always) starts the new version
	}
	var args []string
	for _, a := range selfArgs {
		switch strings.TrimLeft(a, "-") {
		case "installed", "wait-port", "no-browser":
			continue
		}
		args = append(args, a)
	}
	args = append(args, "--installed", "--wait-port", "--no-browser")
	c := exec.Command(exe, args...)
	c.Dir = filepath.Dir(exe)
	detach(c)
	if err := c.Start(); err != nil {
		os.Rename(exe, newExe)
		if runtime.GOOS == "windows" {
			os.Rename(oldExe, exe)
		}
		undo(err)
		return
	}
	time.Sleep(500 * time.Millisecond)
	os.Exit(0)
}
