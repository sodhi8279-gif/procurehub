package main

// Keeping updates painless.
//
// A typical failed update on Windows looks like this: the old ProcureHub is
// still running, so Windows will not let the user replace its EXE ("file in
// use"); the user unzips the new version into another folder and starts it;
// the new version finds the port busy and closes, or it starts with an empty
// data folder. This file finds where the real data lives so the new version
// can install itself there (see install_windows.go) instead of starting empty.

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

type dataInfo struct {
	Dir     string    // the ProcureHub-Data folder
	Exe     string    // the RGS-ProcureHub.exe next to it, if any
	Records int       // live records in the database
	Mod     time.Time // last change of the database
}

// inspectData reports how much data a ProcureHub-Data folder holds.
func inspectData(dir string) (dataInfo, bool) {
	db := filepath.Join(dir, "procurehub-db.json")
	fi, err := os.Stat(db)
	if err != nil || fi.IsDir() {
		return dataInfo{}, false
	}
	b, err := os.ReadFile(db)
	if err != nil {
		return dataInfo{}, false
	}
	var s struct {
		Cols map[string]map[string]struct {
			Deleted bool `json:"deleted"`
		} `json:"cols"`
	}
	if json.Unmarshal(b, &s) != nil {
		return dataInfo{}, false
	}
	n := 0
	for _, c := range s.Cols {
		for _, d := range c {
			if !d.Deleted {
				n++
			}
		}
	}
	info := dataInfo{Dir: dir, Records: n, Mod: fi.ModTime()}
	for _, name := range []string{"RGS-ProcureHub.exe", "ProcureHub.exe", "procurehub-linux", "procurehub-mac"} {
		p := filepath.Join(filepath.Dir(dir), name)
		if _, err := os.Stat(p); err == nil {
			info.Exe = p
			break
		}
	}
	return info, true
}

// markerPath is a small file in the user's profile that remembers where
// ProcureHub last ran, so the next version finds the data straight away.
func markerPath() string {
	base, err := os.UserConfigDir()
	if err != nil || base == "" {
		return ""
	}
	return filepath.Join(base, "RGS-ProcureHub", "last-location.txt")
}

func writeMarker(exe, data string) {
	p := markerPath()
	if p == "" {
		return
	}
	_ = os.MkdirAll(filepath.Dir(p), 0700)
	_ = os.WriteFile(p, []byte(strings.Join([]string{exe, data, appVersion, time.Now().Format(time.RFC3339)}, "\n")), 0600)
}

func readMarker() (exe, data, version string) {
	p := markerPath()
	if p == "" {
		return
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return
	}
	f := strings.Split(strings.ReplaceAll(string(b), "\r", ""), "\n")
	for len(f) < 3 {
		f = append(f, "")
	}
	return f[0], f[1], f[2]
}

// candidateDataDirs lists ProcureHub-Data folders worth checking.
func candidateDataDirs(ownDir string) []string {
	var dirs []string
	add := func(globs ...string) {
		for _, g := range globs {
			m, _ := filepath.Glob(g)
			dirs = append(dirs, m...)
		}
	}
	if _, d, _ := readMarker(); d != "" {
		dirs = append(dirs, d)
	}
	parent := filepath.Dir(ownDir)
	add(filepath.Join(parent, "ProcureHub-Data"), filepath.Join(parent, "*", "ProcureHub-Data"),
		filepath.Join(filepath.Dir(parent), "ProcureHub-Data"), filepath.Join(filepath.Dir(parent), "*", "ProcureHub-Data"))
	if roots := os.Getenv("PROCUREHUB_SEARCH_ROOTS"); roots != "" { // used by tests
		for _, r := range filepath.SplitList(roots) {
			add(filepath.Join(r, "*", "ProcureHub-Data"))
		}
	} else if isWindows() {
		for _, drv := range "CDEFGH" {
			root := string(drv) + `:\`
			add(filepath.Join(root, "*ProcureHub*", "ProcureHub-Data"), filepath.Join(root, "*", "*ProcureHub*", "ProcureHub-Data"))
		}
		if h, err := os.UserHomeDir(); err == nil {
			for _, sub := range []string{"Desktop", "Downloads", "Documents", `OneDrive\Desktop`, `OneDrive\Documents`} {
				add(filepath.Join(h, sub, "*", "ProcureHub-Data"), filepath.Join(h, sub, "*", "*", "ProcureHub-Data"))
			}
		}
	}
	seen := map[string]bool{}
	var out []string
	own := strings.ToLower(filepath.Clean(filepath.Join(ownDir, "ProcureHub-Data")))
	for _, d := range dirs {
		k := strings.ToLower(filepath.Clean(d))
		if seen[k] || k == own {
			continue
		}
		seen[k] = true
		out = append(out, filepath.Clean(d))
	}
	return out
}

// otherData returns other data folders with records, largest first.
func otherData(ownDir string) []dataInfo {
	var out []dataInfo
	for _, d := range candidateDataDirs(ownDir) {
		if info, ok := inspectData(d); ok && info.Records > 0 {
			out = append(out, info)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Records != out[j].Records {
			return out[i].Records > out[j].Records
		}
		return out[i].Mod.After(out[j].Mod)
	})
	return out
}

// shouldMoveTo decides whether the real data is clearly somewhere else:
// this folder has no data, or only a handful of records next to a folder that
// has far more (the "started again from scratch by mistake" case).
func shouldMoveTo(own dataInfo, ownOK bool, other dataInfo) bool {
	if !ownOK || own.Records == 0 {
		return other.Records > 0
	}
	return own.Records < 50 && other.Records >= 3*own.Records && other.Records >= 20
}

// versionLess compares dotted version numbers ("5.2.10" < "5.3.0").
func versionLess(a, b string) bool {
	pa, pb := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < len(pa) || i < len(pb); i++ {
		var x, y int
		if i < len(pa) {
			x, _ = strconv.Atoi(pa[i])
		}
		if i < len(pb) {
			y, _ = strconv.Atoi(pb[i])
		}
		if x != y {
			return x < y
		}
	}
	return false
}

// dataNotes are shown to administrators when another data folder with more
// records exists, so a wrong folder never goes unnoticed.
var dataNotes []map[string]any

func noteOtherData(ownDir string, own dataInfo) {
	for _, o := range otherData(ownDir) {
		if o.Records > own.Records {
			dataNotes = append(dataNotes, map[string]any{"dir": o.Dir, "records": o.Records, "changed": o.Mod.UnixMilli()})
			fmt.Println("--------------------------------------------------------------")
			fmt.Printf("  NOTE: another data folder has more records than this one:\n  %s (%d records, last changed %s)\n", o.Dir, o.Records, o.Mod.Format("02 Jan 2006 15:04"))
			fmt.Printf("  This copy is using %s (%d records).\n", own.Dir, own.Records)
		}
	}
}
