//go:build windows

package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

func isWindows() bool { return true }

func portBusy(port int) bool {
	c, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), time.Second)
	if err != nil {
		return false
	}
	c.Close()
	return true
}

// isProcureHubOn checks that the program answering on the port is ProcureHub.
func isProcureHubOn(port int) bool {
	cl := http.Client{Timeout: 3 * time.Second}
	r, err := cl.Get(fmt.Sprintf("http://127.0.0.1:%d/api/me", port))
	if err != nil {
		return false
	}
	defer r.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(r.Body, 1<<16))
	var m map[string]any
	if json.Unmarshal(b, &m) != nil {
		return false
	}
	_, a := m["company"]
	_, s := m["setup"]
	_, u := m["user"]
	return a || s || u
}

// listener finds the process id and program path listening on the port.
func listener(port int) (int, string) {
	ps := fmt.Sprintf(`$c = Get-NetTCPConnection -LocalPort %d -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; Write-Output ("" + $c.OwningProcess + "|" + $p.Path) }`, port)
	if out, err := hidden("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps).Output(); err == nil {
		f := strings.SplitN(strings.TrimSpace(string(out)), "|", 2)
		if pid, err := strconv.Atoi(f[0]); err == nil && pid > 0 {
			path := ""
			if len(f) == 2 {
				path = strings.TrimSpace(f[1])
			}
			return pid, path
		}
	}
	// Fallback for older Windows: netstat and tasklist.
	out, err := hidden("netstat", "-ano", "-p", "TCP").Output()
	if err != nil {
		return 0, ""
	}
	for _, line := range strings.Split(string(out), "\n") {
		f := strings.Fields(line)
		if len(f) >= 5 && strings.HasSuffix(f[1], fmt.Sprintf(":%d", port)) && (strings.HasSuffix(f[2], ":0") || f[2] == "*:*") {
			if pid, err := strconv.Atoi(f[len(f)-1]); err == nil && pid > 0 {
				name := ""
				if o, err := hidden("tasklist", "/FI", fmt.Sprintf("PID eq %d", pid), "/FO", "CSV", "/NH").Output(); err == nil {
					name = strings.Trim(strings.SplitN(strings.TrimSpace(string(o)), ",", 2)[0], `"`)
				}
				return pid, name
			}
		}
	}
	return 0, ""
}

func samePath(a, b string) bool {
	return strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
}

// takeOver handles "port already in use" when the port belongs to an older
// ProcureHub: it closes the old program and, if the old program ran from the
// folder that holds the data, installs this version there and restarts.
func takeOver(port int, exe string, args []string) {
	if !portBusy(port) || !isProcureHubOn(port) {
		return
	}
	pid, path := listener(port)
	if pid == 0 || !strings.Contains(strings.ToLower(path), "procurehub") {
		return
	}
	if path != "" && filepath.IsAbs(path) && samePath(path, exe) {
		fmt.Println("  ProcureHub is already running from this folder in another window.")
		fmt.Println("  Opening it in your browser. This window will close.")
		openBrowser(fmt.Sprintf("http://localhost:%d", port))
		time.Sleep(4 * time.Second)
		os.Exit(0)
	}
	fmt.Println("==============================================================")
	fmt.Println("  An older ProcureHub is still running:")
	if filepath.IsAbs(path) {
		fmt.Println("  " + path)
	}
	fmt.Printf("  Closing it so version %s can take over. Your data is safe.\n", appVersion)
	_ = hidden("taskkill", "/PID", strconv.Itoa(pid), "/T", "/F").Run()
	for i := 0; i < 30 && portBusy(port); i++ {
		time.Sleep(500 * time.Millisecond)
	}
	if !filepath.IsAbs(path) || samePath(filepath.Dir(path), filepath.Dir(exe)) {
		return
	}
	oldData := filepath.Join(filepath.Dir(path), "ProcureHub-Data")
	old, oldOK := inspectData(oldData)
	own, ownOK := inspectData(filepath.Join(filepath.Dir(exe), "ProcureHub-Data"))
	if !oldOK || (ownOK && own.Records > old.Records) {
		return // this folder holds the real data; keep running here
	}
	installAndRestart(exe, path, oldData, old.Records, args)
}

// relocate is used when no older copy is running: if this copy was started
// from a folder without data while the real data is elsewhere, it installs
// itself next to that data and restarts there.
func relocate(exe, ownDataDir string, args []string) {
	own, ownOK := inspectData(ownDataDir)
	others := otherData(filepath.Dir(exe))
	if len(others) == 0 || !shouldMoveTo(own, ownOK, others[0]) {
		return
	}
	best := others[0]
	if mExe, mData, mVer := readMarker(); mData != "" && samePath(mData, best.Dir) && mVer != "" && versionLess(appVersion, mVer) {
		fmt.Printf("  Your data is in %s, which runs a newer ProcureHub (%s).\n  Start %s instead.\n", best.Dir, mVer, mExe)
		return
	}
	target := best.Exe
	if target == "" || !strings.HasSuffix(strings.ToLower(target), ".exe") {
		target = filepath.Join(filepath.Dir(best.Dir), "RGS-ProcureHub.exe")
	}
	fmt.Println("==============================================================")
	fmt.Println("  Your existing ProcureHub data was found in:")
	fmt.Printf("  %s (%d records)\n", best.Dir, best.Records)
	if ownOK && own.Records > 0 {
		fmt.Printf("  (This folder only has %d records. They are kept untouched in %s.)\n", own.Records, ownDataDir)
	}
	installAndRestart(exe, target, best.Dir, best.Records, args)
}

func copyExe(src, dst string) error {
	in, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	tmp := dst + ".new"
	if err := os.WriteFile(tmp, in, 0755); err != nil {
		return err
	}
	var last error
	for i := 0; i < 20; i++ {
		_ = os.Remove(dst + ".old")
		if _, err := os.Stat(dst); err == nil {
			if last = os.Rename(dst, dst+".old"); last != nil {
				time.Sleep(500 * time.Millisecond)
				continue
			}
		}
		if last = os.Rename(tmp, dst); last == nil {
			_ = os.Remove(dst + ".old")
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	_ = os.Remove(tmp)
	return last
}

func installAndRestart(exe, target, dataDir string, records int, args []string) {
	fmt.Printf("  Installing version %s into %s\n", appVersion, filepath.Dir(target))
	run := target
	extra := []string{"--installed"}
	if err := copyExe(exe, target); err != nil {
		fmt.Printf("  Could not replace the program file there (%v).\n  Starting this copy with that data folder instead.\n", err)
		run = exe
		extra = append(extra, "--data", dataDir)
	} else {
		for _, f := range []string{"Fix-Network.cmd", "SETUP-GUIDE.html"} {
			if b, err := os.ReadFile(filepath.Join(filepath.Dir(exe), f)); err == nil {
				_ = os.WriteFile(filepath.Join(filepath.Dir(target), f), b, 0644)
			}
		}
	}
	c := exec.Command(run, append(args, extra...)...)
	c.Dir = filepath.Dir(run)
	c.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x00000010} // new console window
	if err := c.Start(); err != nil {
		fmt.Printf("  Could not start it automatically: %v\n  Please double-click %s\n", err, run)
		pauseIfWindows()
		os.Exit(1)
	}
	fmt.Printf("  ProcureHub %s is starting in a new window with your %d records.\n", appVersion, records)
	fmt.Println("  This window will close in a few seconds.")
	fmt.Println("==============================================================")
	time.Sleep(6 * time.Second)
	os.Exit(0)
}
