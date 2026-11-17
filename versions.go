package main

// Kept versions: ProcureHub keeps a copy of the program of the running version and
// of up to 5 other recent versions in the data folder (versions/). An administrator
// can switch back to any of them from Settings → Software update, for example when
// something in a new version is not wanted. Switching back goes through the same
// safe steps as an update: full backup, test-start on a copy of the data, restart.
// The data is kept as it is; records made with newer features stay in the data
// file and are there again when a newer version is installed.

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

const keepOlderVersions = 5

var (
	verMu     sync.Mutex
	verFileRe = regexp.MustCompile(`^ProcureHub-([0-9]+\.[0-9]+\.[0-9]+)-([a-z0-9]+)-([a-z0-9]+)(\.exe)?$`)
)

type verMeta struct {
	FirstRun int64  `json:"firstRun,omitempty"` // when this version was first started here
	LastRun  int64  `json:"lastRun,omitempty"`  // when it was last running
	From     string `json:"from,omitempty"`     // how the copy was made
}

func versionsDir() string { return filepath.Join(dataDir, "versions") }
func verFileName(v string) string {
	n := "ProcureHub-" + v + "-" + runtime.GOOS + "-" + runtime.GOARCH
	if runtime.GOOS == "windows" {
		n += ".exe"
	}
	return n
}
func verMetaLoad() map[string]*verMeta {
	m := map[string]*verMeta{}
	if b, err := os.ReadFile(filepath.Join(versionsDir(), "versions.json")); err == nil {
		json.Unmarshal(b, &m)
	}
	return m
}
func verMetaSave(m map[string]*verMeta) {
	if b, err := json.MarshalIndent(m, "", " "); err == nil {
		os.WriteFile(filepath.Join(versionsDir(), "versions.json"), b, 0600)
	}
}

// keepProgram stores a program file in versions/ if it is a ProcureHub build for this server.
func keepProgram(path, from string, m map[string]*verMeta) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	v, oa, ok := readBuild(b)
	if !ok || oa != runtime.GOOS+"/"+runtime.GOARCH {
		return ""
	}
	dst := filepath.Join(versionsDir(), verFileName(v))
	if fi, err := os.Stat(dst); err != nil || fi.Size() != int64(len(b)) {
		tmp := dst + ".tmp"
		if os.WriteFile(tmp, b, 0755) == nil {
			os.Rename(tmp, dst)
		}
	}
	if m[v] == nil {
		m[v] = &verMeta{From: from}
	}
	return v
}

// archiveVersions keeps the running program (and the spare .old one) and removes
// copies beyond the running version plus the 5 most recent others.
func archiveVersions() {
	verMu.Lock()
	defer verMu.Unlock()
	if dataDir == "" || os.MkdirAll(versionsDir(), 0700) != nil {
		return
	}
	exe, err := os.Executable()
	if err != nil {
		return
	}
	if real, e := filepath.EvalSymlinks(exe); e == nil {
		exe = real
	}
	m := verMetaLoad()
	now := time.Now().UnixMilli()
	keepProgram(exe, "running", m)
	if m[appVersion] == nil {
		m[appVersion] = &verMeta{From: "running"}
	}
	if m[appVersion].FirstRun == 0 {
		m[appVersion].FirstRun = now
	}
	m[appVersion].LastRun = now
	if _, err := os.Stat(exe + ".old"); err == nil {
		if v := keepProgram(exe+".old", "previous", m); v != "" && m[v].LastRun == 0 {
			if fi, err := os.Stat(exe + ".old"); err == nil {
				m[v].LastRun = fi.ModTime().UnixMilli()
			}
		}
	}
	// prune: the running version + the 5 most recent other versions
	vs := keptVersions()
	n := 0
	for _, v := range vs {
		if v == appVersion {
			continue
		}
		n++
		if n > keepOlderVersions {
			os.Remove(filepath.Join(versionsDir(), verFileName(v)))
			delete(m, v)
			log.Printf("Removed the kept copy of ProcureHub %s (only %d earlier versions are kept).", v, keepOlderVersions)
		}
	}
	for v := range m {
		if _, err := os.Stat(filepath.Join(versionsDir(), verFileName(v))); err != nil {
			delete(m, v)
		}
	}
	verMetaSave(m)
}

// keptVersions lists the versions kept for this server, newest first.
func keptVersions() []string {
	ents, _ := os.ReadDir(versionsDir())
	var vs []string
	for _, e := range ents {
		x := verFileRe.FindStringSubmatch(e.Name())
		if x == nil || x[2] != runtime.GOOS || x[3] != runtime.GOARCH {
			continue
		}
		vs = append(vs, x[1])
	}
	sort.Slice(vs, func(i, j int) bool { return versionLess(vs[j], vs[i]) })
	return vs
}

func hVersions(w http.ResponseWriter, r *http.Request, u *User) {
	verMu.Lock()
	m := verMetaLoad()
	vs := keptVersions()
	verMu.Unlock()
	out := []any{}
	for _, v := range vs {
		fi, err := os.Stat(filepath.Join(versionsDir(), verFileName(v)))
		if err != nil {
			continue
		}
		x := map[string]any{"version": v, "size": fi.Size(), "current": v == appVersion, "newer": versionLess(appVersion, v)}
		if mt := m[v]; mt != nil {
			x["firstRun"], x["lastRun"] = mt.FirstRun, mt.LastRun
		}
		out = append(out, x)
	}
	writeJSON(w, 200, map[string]any{"current": appVersion, "keep": keepOlderVersions, "versions": out})
}

func hVersionSwitch(w http.ResponseWriter, r *http.Request, u *User) {
	if r.Method != http.MethodPost {
		fail(w, 405, "Use POST.")
		return
	}
	var q struct {
		Version string `json:"version"`
		Reason  string `json:"reason"`
	}
	if !readJSON(w, r, &q, 1<<14) {
		return
	}
	if !regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+$`).MatchString(q.Version) {
		fail(w, 400, "Choose a version.")
		return
	}
	if q.Version == appVersion {
		fail(w, 400, "This version is already running.")
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
	ok := false
	defer func() {
		if !ok {
			updMu.Lock()
			updBusy = false
			updMu.Unlock()
		}
	}()
	f, err := os.Open(filepath.Join(versionsDir(), verFileName(q.Version)))
	if err != nil {
		fail(w, 404, "The kept copy of version "+q.Version+" is not there any more.")
		return
	}
	bin, err := io.ReadAll(io.LimitReader(f, 500<<20))
	f.Close()
	if err != nil {
		fail(w, 500, "The kept copy could not be read: "+err.Error())
		return
	}
	v, oa, good := readBuild(bin)
	if !good || v != q.Version || oa != runtime.GOOS+"/"+runtime.GOARCH {
		fail(w, 400, "The kept copy of version "+q.Version+" is damaged. Upload that version's zip instead.")
		return
	}
	why := " (switched back to a kept version)"
	if versionLess(appVersion, v) {
		why = " (switched to a kept newer version)"
	}
	if rs := strings.TrimSpace(q.Reason); rs != "" {
		why += ": " + clip(rs, 200)
	}
	ok = installBin(w, u, bin, v, nil, why)
	if ok {
		fmt.Printf("Switching to the kept ProcureHub %s.\n", v)
	}
}

// hVersionKeep stores an uploaded release zip / program in the kept versions without installing it.
func hVersionKeep(w http.ResponseWriter, r *http.Request, u *User) {
	if r.Method != http.MethodPost {
		fail(w, 405, "Use POST.")
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 500<<20))
	if err != nil {
		fail(w, 400, "The file could not be received completely. Try again.")
		return
	}
	up, err := pickUpdate(body)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	verMu.Lock()
	os.MkdirAll(versionsDir(), 0700)
	dst := filepath.Join(versionsDir(), verFileName(up.version))
	err = os.WriteFile(dst+".tmp", up.bin, 0755)
	if err == nil {
		err = os.Rename(dst+".tmp", dst)
	}
	if err == nil {
		m := verMetaLoad()
		if m[up.version] == nil {
			m[up.version] = &verMeta{From: "uploaded"}
		}
		verMetaSave(m)
	}
	verMu.Unlock()
	if err != nil {
		fail(w, 500, "The version could not be stored: "+err.Error())
		return
	}
	archiveVersions()
	kept := false
	for _, v := range keptVersions() {
		if v == up.version {
			kept = true
		}
	}
	writeJSON(w, 200, map[string]any{"ok": true, "version": up.version, "kept": kept})
}
