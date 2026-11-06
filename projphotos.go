package main

import (
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

/* ---------------- project photos (6.8) ----------------
   A project keeps a gallery in "photos": [{f, t, o, cap, alt, at, by, byName}]
     f    the photo shown (may be a cropped copy)
     t    a small copy for cards and thumbnails
     o    the original upload when the photo was cropped (kept, never overwritten)
   "photo" is the cover and must be one of the gallery photos (or empty).
   Only photos uploaded by people are allowed here: every id must be a file on this server. */

var imageIDRe = regexp.MustCompile(`^[a-f0-9]{24}\.(jpg|png|webp)$`)

const maxProjectPhotos = 60

// sitePhotoUser may manage the photos of his own project: the project manager and site engineers, not the storekeeper
func sitePhotoUser(u *User, id string) bool {
	return u != nil && u.Role == "site" && u.ProjectID == id && !siteStore(u)
}

func onlyPhotoKeys(patch map[string]any) bool {
	if len(patch) == 0 {
		return false
	}
	for k := range patch {
		if k != "photos" && k != "photo" {
			return false
		}
	}
	return true
}

func fileExists(id string) bool {
	if !imageIDRe.MatchString(id) {
		return false
	}
	st, err := os.Stat(filepath.Join(filesDir, id))
	return err == nil && !st.IsDir()
}

func cleanText(s string, n int) string {
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > n {
		s = string(r[:n])
	}
	return s
}

// checkProjectPhotos validates the gallery and cover of a project being saved and normalises them in nd.
func checkProjectPhotos(u *User, ex, patch, nd map[string]any) error {
	_, hasList := patch["photos"]
	_, hasCover := patch["photo"]
	if !hasList && !hasCover {
		return nil
	}
	var exList []any
	if ex != nil {
		exList = anyList(ex["photos"])
	}
	old := map[string]map[string]any{}
	for _, x := range exList {
		if m, ok := x.(map[string]any); ok {
			old[str(m, "f")] = m
		}
	}
	list := anyList(nd["photos"])
	if len(list) > maxProjectPhotos {
		return errors.New("A project can keep up to 60 photos. Delete some before adding more.")
	}
	var out []any
	seen := map[string]bool{}
	now := float64(time.Now().UnixMilli())
	for _, x := range list {
		m, ok := x.(map[string]any)
		if !ok {
			return errors.New("Invalid photo list.")
		}
		f := str(m, "f")
		if seen[f] {
			continue
		}
		if !fileExists(f) {
			return errors.New("A photo in the list was not uploaded to this server. Upload it again.")
		}
		seen[f] = true
		p := map[string]any{"f": f, "cap": cleanText(str(m, "cap"), 200), "alt": cleanText(str(m, "alt"), 200)}
		for _, k := range []string{"t", "o"} {
			if v := str(m, k); v != "" {
				if !fileExists(v) {
					return errors.New("A photo in the list was not uploaded to this server. Upload it again.")
				}
				p[k] = v
			}
		}
		if o := old[f]; o != nil { // who added it and when cannot be changed
			p["at"], p["by"], p["byName"] = o["at"], o["by"], o["byName"]
		} else {
			p["at"], p["by"], p["byName"] = now, u.ID, u.Name
		}
		out = append(out, p)
	}
	if out == nil {
		out = []any{}
	}
	if hasList {
		nd["photos"] = out
	}
	cover := str(nd, "photo")
	if cover != "" && !seen[cover] {
		legacy := len(out) == 0 && ex != nil && cover == str(ex, "photo") // older projects had one photo and no gallery
		if !legacy {
			if hasCover && !hasList {
				return errors.New("Choose the cover from the project's photos.")
			}
			cover = ""
		}
	}
	if cover == "" && len(out) > 0 {
		cover = str(out[0].(map[string]any), "f")
	}
	nd["photo"] = cover
	return nil
}

/* ---------- supporting photographs installed by the administrator (config "photos") ---------- */

// checkSlotPhotos: slots:{name:{f,t,at}} where every file was uploaded to this server
func checkSlotPhotos(nd map[string]any) error {
	sl, _ := nd["slots"].(map[string]any)
	out := map[string]any{}
	for k, v := range sl {
		m, ok := v.(map[string]any)
		if !ok || len(k) > 40 {
			return errors.New("Invalid photograph.")
		}
		f, t := str(m, "f"), str(m, "t")
		if !fileExists(f) || (t != "" && !fileExists(t)) {
			return errors.New("The photograph was not uploaded to this server. Upload it again.")
		}
		out[k] = map[string]any{"f": f, "t": t, "at": m["at"]}
	}
	for k := range nd {
		if k != "slots" {
			delete(nd, k)
		}
	}
	nd["slots"] = out
	return nil
}

// slotPhotoFile: the sign-in page shows the dashboard photograph before anyone signs in
func slotPhotoFile(id string) bool {
	mu.Lock()
	defer mu.Unlock()
	c := st.Cols["config"]
	if c == nil || c["photos"] == nil || c["photos"].Deleted {
		return false
	}
	sl, _ := c["photos"].Data["slots"].(map[string]any)
	for _, v := range sl {
		if m, ok := v.(map[string]any); ok && (str(m, "f") == id || str(m, "t") == id) {
			return true
		}
	}
	return false
}

// heroSlot: the dashboard photograph, for the sign-in page
func heroSlot() any {
	mu.Lock()
	defer mu.Unlock()
	if c := st.Cols["config"]; c != nil && c["photos"] != nil && !c["photos"].Deleted {
		if sl, ok := c["photos"].Data["slots"].(map[string]any); ok {
			return sl["hqHero"]
		}
	}
	return nil
}
