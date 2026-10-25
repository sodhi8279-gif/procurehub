//go:build windows

package main

// Windows Firewall ties "allow" rules to the exact program path. When the
// EXE is replaced or run from another folder, Windows treats it as a new
// program; if its "Allow access" prompt is missed or cancelled, Windows adds
// BLOCK rules and the sites can no longer reach ProcureHub. ensureFirewall
// removes such block rules and allows this program and its port, asking once
// for administrator permission (one "Yes" click).

import (
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unicode/utf16"
)

const fwRule = "RGS ProcureHub"

func hidden(name string, args ...string) *exec.Cmd {
	c := exec.Command(name, args...)
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return c
}

func q(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }

func fwScript(exe string, port int, done string) string {
	return strings.Join([]string{
		"$ErrorActionPreference = 'SilentlyContinue'",
		"$exe = " + q(exe),
		"Get-NetFirewallApplicationFilter -Program $exe | Get-NetFirewallRule | Remove-NetFirewallRule",
		"netsh advfirewall firewall delete rule name=all program=\"$exe\" | Out-Null",
		"Get-NetFirewallRule -DisplayName " + q(fwRule) + " | Remove-NetFirewallRule",
		"$a = New-NetFirewallRule -DisplayName " + q(fwRule) + " -Direction Inbound -Action Allow -Program $exe -Profile Any",
		fmt.Sprintf("$b = New-NetFirewallRule -DisplayName %s -Direction Inbound -Action Allow -Protocol TCP -LocalPort %d -Profile Any", q(fwRule), port),
		"if ($a -and $b) { Set-Content -LiteralPath " + q(done) + " -Value 'ok' -Encoding ASCII }",
		"",
	}, "\r\n")
}

// ensureFirewall returns a one-line status for the console window.
func ensureFirewall(port int, skip bool) string {
	if skip {
		return "not checked (--no-firewall)"
	}
	exe, err := os.Executable()
	if err != nil {
		return "could not check"
	}
	if r, err := filepath.EvalSymlinks(exe); err == nil {
		exe = r
	}
	marker := filepath.Join(dataDir, "firewall-ok.txt")
	want := fmt.Sprintf("%s|%d", exe, port)
	if b, err := os.ReadFile(marker); err == nil && strings.TrimSpace(string(b)) == want {
		return "other computers are allowed in"
	}
	done := filepath.Join(dataDir, "firewall-done.tmp")
	_ = os.Remove(done)
	script := filepath.Join(dataDir, "allow-firewall.ps1")
	bom := []byte{0xEF, 0xBB, 0xBF}
	if err := os.WriteFile(script, append(bom, []byte(fwScript(exe, port, done))...), 0600); err != nil {
		return "could not check"
	}
	defer os.Remove(script)
	defer os.Remove(done)
	fmt.Println("  Setting up Windows Firewall so the sites can connect.")
	fmt.Println("  If Windows asks \"Do you want to allow this app to make changes?\", click YES.")
	ps := "try { Start-Process -FilePath powershell -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList " +
		q(`-NoProfile -ExecutionPolicy Bypass -File "`+script+`"`) + " } catch { exit 1 }"
	ch := make(chan error, 1)
	u := utf16.Encode([]rune(ps))
	raw := make([]byte, 2*len(u))
	for i, c := range u {
		raw[2*i], raw[2*i+1] = byte(c), byte(c>>8)
	}
	enc := base64.StdEncoding.EncodeToString(raw)
	go func() {
		ch <- hidden("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc).Run()
	}()
	select {
	case <-ch:
	case <-time.After(3 * time.Minute):
	}
	if _, err := os.Stat(done); err == nil {
		_ = os.WriteFile(marker, []byte(want), 0600)
		return "allowed for other computers (set up now)"
	}
	return "NOT SET UP - sites may not connect. Close this window, start again and click YES, or right-click Fix-Network.cmd > Run as administrator"
}
