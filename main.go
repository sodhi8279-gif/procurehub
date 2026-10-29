// RGS Infra ProcureHub — central procurement server for multi-site water supply & sewerage projects.
// Single executable, no external dependencies. Run it on one computer (HQ PC or a cloud
// server); every site opens it in a web browser and signs in.
package main

import (
	"archive/zip"
	"bufio"
	"bytes"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/tls"
	"embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"mime"
	"net"
	"net/http"
	"net/smtp"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed web
var webFS embed.FS

const appVersion = "6.0.2"
const appName = "RGS Infra ProcureHub"

type Doc struct {
	Data    map[string]any `json:"data,omitempty"`
	Rev     int64          `json:"rev"`
	Deleted bool           `json:"deleted,omitempty"`
}

type User struct {
	ID         string  `json:"id"`
	Username   string  `json:"username"`
	Name       string  `json:"name"`
	Role       string  `json:"role"` // "hq" or "site"
	ProjectID  string  `json:"projectId"`
	Active     bool    `json:"active"`
	Salt       string  `json:"salt"`
	Hash       string  `json:"hash"`
	Created    int64   `json:"created"`
	Phone      string  `json:"phone,omitempty"`
	MustChange bool    `json:"mustChange,omitempty"`
	LastLogin  int64   `json:"lastLogin,omitempty"`
	Access     *Access `json:"access,omitempty"`
	// Director (Procurement): signature-with-stamp image printed on approved POs
	Sign        string `json:"sign,omitempty"`
	Designation string `json:"designation,omitempty"`
	// site login of the site head / project manager, who authenticates consumption
	SiteHead bool `json:"siteHead,omitempty"`
	// fields written by other versions are kept as they are
	Extra map[string]json.RawMessage `json:"-"`
}

type Session struct {
	UserID string `json:"userId"`
	Seen   int64  `json:"seen"`
}

type SMTPConf struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Security string `json:"security"` // starttls | ssl | none
	User     string `json:"user"`
	Pass     string `json:"pass"`
	From     string `json:"from"`
	FromName string `json:"fromName"`
}

type State struct {
	Version  string                     `json:"version"`
	Epoch    string                     `json:"epoch"`
	Rev      int64                      `json:"rev"`
	Cols     map[string]map[string]*Doc `json:"cols"`
	Users    map[string]*User           `json:"users"`
	Sessions map[string]*Session        `json:"sessions"`
	Counters map[string]int64           `json:"counters"`
	SMTP     SMTPConf                   `json:"smtp"`
	Backup   BackupConf                 `json:"backup"`
	MailIn   MailInConf                 `json:"mailIn"`
	Audit    []AuditEntry               `json:"audit,omitempty"`
	// fields written by other versions are kept as they are
	Extra map[string]json.RawMessage `json:"-"`
}

var (
	mu       sync.Mutex
	st       *State
	changeCh = make(chan struct{})
	dataDir  string
	dbPath   string
	filesDir string
)

var collections = map[string]bool{"projects": true, "vendors": true, "indents": true, "rfqs": true, "pos": true, "grns": true, "dispatches": true, "catalog": true, "config": true, "sitelog": true, "stocklvl": true, "jobwork": true, "mailquotes": true, "consumption": true}

var (
	idRe       = regexp.MustCompile(`^[A-Za-z0-9_.:@+~-]{1,200}$`)
	usernameRe = regexp.MustCompile(`^[a-z0-9._-]{3,40}$`)
	prefixRe   = regexp.MustCompile(`^[A-Z]{1,6}$`)
	fyRe       = regexp.MustCompile(`^\d{2}-\d{2}$`)
	fileIDRe   = regexp.MustCompile(`^[a-f0-9]{24}\.(jpg|png|webp|pdf|xlsx)$`)
)

var fileTypes = map[string]string{".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf", ".xlsx": xlsxType}

const sessionTTL = 30 * 24 * time.Hour

/* ------------------------------ storage ------------------------------ */

func randHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func hashPw(pw, salt string) string {
	k, err := pbkdf2.Key(sha256.New, pw, []byte(salt), 120000, 32)
	if err != nil {
		panic(err)
	}
	return hex.EncodeToString(k)
}

func load() error {
	st = &State{}
	b, err := os.ReadFile(dbPath)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if errors.Is(err, os.ErrNotExist) {
		if bb, e2 := os.ReadFile(dbPath + ".bak"); e2 == nil && json.Unmarshal(bb, st) == nil {
			log.Printf("The data file was missing; ProcureHub restored it from the safety copy %s.bak", dbPath)
		}
	}
	if err == nil {
		if jerr := json.Unmarshal(b, st); jerr != nil {
			st = &State{}
			bb, e2 := os.ReadFile(dbPath + ".bak")
			if e2 != nil || json.Unmarshal(bb, st) != nil {
				return fmt.Errorf("the data file %s is damaged (%v) and the safety copy could not be used.\nRename the data file (for example to procurehub-db-damaged.json), start ProcureHub again, then use Settings > Backup > Restore with the newest file in the backups folder", dbPath, jerr)
			}
			damaged := dbPath + ".damaged-" + time.Now().Format("20060102-150405")
			os.Rename(dbPath, damaged)
			log.Printf("WARNING: the data file was damaged. ProcureHub recovered automatically from the latest safety copy. The damaged file was kept as %s", damaged)
		}
	}
	if st.Cols == nil {
		st.Cols = map[string]map[string]*Doc{}
	}
	if st.Users == nil {
		st.Users = map[string]*User{}
	}
	if st.Sessions == nil {
		st.Sessions = map[string]*Session{}
	}
	if st.Counters == nil {
		st.Counters = map[string]int64{}
	}
	if st.Epoch == "" {
		st.Epoch = randHex(8)
	}
	st.Version = appVersion
	return saveLocked()
}

func saveLocked() error {
	b, err := json.Marshal(st)
	if err != nil {
		return err
	}
	return writeAtomic(dbPath, b)
}

func notifyLocked() {
	close(changeCh)
	changeCh = make(chan struct{})
}

func shallowCopy(m map[string]any) map[string]any {
	out := make(map[string]any, len(m)+4)
	for k, v := range m {
		out[k] = v
	}
	return out
}

func str(m map[string]any, k string) string {
	if m == nil {
		return ""
	}
	s, _ := m[k].(string)
	return s
}

func configLocked(key string) string {
	if c := st.Cols["config"]; c != nil {
		if d := c["main"]; d != nil && !d.Deleted {
			return str(d.Data, key)
		}
	}
	return ""
}

// exportLocked returns the business data in the backup format.
func exportLocked() map[string]any {
	cols := map[string]map[string]any{}
	for c, docs := range st.Cols {
		m := map[string]any{}
		for id, d := range docs {
			if !d.Deleted && d.Data != nil {
				m[id] = d.Data
			}
		}
		cols[c] = m
	}
	return map[string]any{"app": "ProcureHub", "version": appVersion, "exportedAt": time.Now().Format(time.RFC3339), "cols": cols, "counters": st.Counters}
}

/* ------------------------------ http helpers ------------------------------ */

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]any{"error": msg})
}

func readJSON(w http.ResponseWriter, r *http.Request, v any, limit int64) bool {
	if r.Method != http.MethodPost {
		fail(w, 405, "Method not allowed.")
		return false
	}
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		fail(w, 415, "Expected JSON.")
		return false
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, limit)).Decode(v); err != nil {
		fail(w, 400, "The request could not be read.")
		return false
	}
	return true
}

func currentUser(r *http.Request) *User {
	c, err := r.Cookie("ph_session")
	if err != nil || c.Value == "" {
		return nil
	}
	mu.Lock()
	defer mu.Unlock()
	s := st.Sessions[c.Value]
	if s == nil {
		return nil
	}
	now := time.Now()
	if now.Sub(time.UnixMilli(s.Seen)) > sessionTTL {
		delete(st.Sessions, c.Value)
		return nil
	}
	u := st.Users[s.UserID]
	if u == nil || !u.Active {
		return nil
	}
	s.Seen = now.UnixMilli()
	cp := *u
	return &cp
}

type handler func(w http.ResponseWriter, r *http.Request, u *User)

func authed(h handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u := currentUser(r)
		if u == nil {
			fail(w, 401, "Please sign in.")
			return
		}
		h(w, r, u)
	}
}

func hqOnly(h handler) http.HandlerFunc {
	return authed(func(w http.ResponseWriter, r *http.Request, u *User) {
		if u.Role != "hq" {
			fail(w, 403, "Only HQ accounts can do this.")
			return
		}
		h(w, r, u)
	})
}

func publicUser(u *User) map[string]any {
	return map[string]any{"id": u.ID, "username": u.Username, "name": u.Name, "role": u.Role, "projectId": u.ProjectID, "active": u.Active, "created": u.Created, "phone": u.Phone, "mustChange": u.MustChange, "lastLogin": u.LastLogin, "access": u.Access, "admin": isAdmin(u),
		"sign": u.Sign, "designation": u.Designation, "siteHead": u.SiteHead}
}

func startSession(w http.ResponseWriter, r *http.Request, u *User) {
	tok := randHex(32)
	st.Sessions[tok] = &Session{UserID: u.ID, Seen: time.Now().UnixMilli()}
	secure := r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
	http.SetCookie(w, &http.Cookie{Name: "ph_session", Value: tok, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: secure, MaxAge: int(sessionTTL.Seconds())})
}

func firstNonEmpty(a ...string) string {
	for _, s := range a {
		if s != "" {
			return s
		}
	}
	return ""
}

/* ------------------------------ auth endpoints ------------------------------ */

func hMe(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	mu.Lock()
	setup := len(st.Users) == 0
	company := configLocked("company")
	logo := configLocked("logo")
	mu.Unlock()
	if u == nil {
		writeJSON(w, 401, map[string]any{"error": "Please sign in.", "setup": setup, "company": company, "logo": logo, "version": appVersion})
		return
	}
	out := map[string]any{"user": publicUser(u), "company": company, "logo": logo, "version": appVersion}
	if isAdmin(u) && len(dataNotes) > 0 {
		out["dataNotes"] = dataNotes
	}
	if isAdmin(u) {
		h, _ := os.Hostname()
		out["net"] = map[string]any{"host": strings.ToLower(h), "ips": lanIPs(), "port": listenPort}
	}
	writeJSON(w, 200, out)
}

func hSetup(w http.ResponseWriter, r *http.Request) {
	var req struct{ Company, Name, Username, Password string }
	if !readJSON(w, r, &req, 1<<16) {
		return
	}
	req.Username = strings.ToLower(strings.TrimSpace(req.Username))
	req.Name = strings.TrimSpace(req.Name)
	if !usernameRe.MatchString(req.Username) {
		fail(w, 400, "Username must be 3–40 letters, numbers, dots, dashes or underscores.")
		return
	}
	if len(req.Password) < 6 {
		fail(w, 400, "Password must be at least 6 characters.")
		return
	}
	mu.Lock()
	defer mu.Unlock()
	if len(st.Users) > 0 {
		fail(w, 409, "ProcureHub is already set up. Please sign in.")
		return
	}
	salt := randHex(16)
	u := &User{ID: "u_" + randHex(8), Username: req.Username, Name: firstNonEmpty(req.Name, req.Username), Role: "hq", Active: true, Salt: salt, Hash: hashPw(req.Password, salt), Created: time.Now().UnixMilli()}
	st.Users[u.ID] = u
	if strings.TrimSpace(req.Company) != "" {
		if st.Cols["config"] == nil {
			st.Cols["config"] = map[string]*Doc{}
		}
		data := map[string]any{}
		if d := st.Cols["config"]["main"]; d != nil && d.Data != nil {
			data = shallowCopy(d.Data)
		}
		data["company"] = strings.TrimSpace(req.Company)
		st.Rev++
		st.Cols["config"]["main"] = &Doc{Rev: st.Rev, Data: data}
		notifyLocked()
	}
	startSession(w, r, u)
	if err := saveLocked(); err != nil {
		fail(w, 500, "Could not save: "+err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

var loginFails = struct {
	sync.Mutex
	m map[string][]time.Time
}{m: map[string][]time.Time{}}

func clientIP(r *http.Request) string {
	h, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return h
}

func hLogin(w http.ResponseWriter, r *http.Request) {
	var req struct{ Username, Password string }
	if !readJSON(w, r, &req, 1<<14) {
		return
	}
	ip := clientIP(r)
	loginFails.Lock()
	var recent []time.Time
	for _, t := range loginFails.m[ip] {
		if time.Since(t) < 15*time.Minute {
			recent = append(recent, t)
		}
	}
	loginFails.m[ip] = recent
	loginFails.Unlock()
	if len(recent) >= 10 {
		fail(w, 429, "Too many wrong attempts. Wait 15 minutes and try again.")
		return
	}
	name := strings.ToLower(strings.TrimSpace(req.Username))
	mu.Lock()
	var found *User
	for _, u := range st.Users {
		if u.Username == name {
			found = u
		}
	}
	ok := found != nil && found.Active && subtle.ConstantTimeCompare([]byte(hashPw(req.Password, found.Salt)), []byte(found.Hash)) == 1
	if ok {
		found.LastLogin = time.Now().UnixMilli()
		startSession(w, r, found)
		saveLocked()
	}
	mu.Unlock()
	if !ok {
		loginFails.Lock()
		loginFails.m[ip] = append(loginFails.m[ip], time.Now())
		loginFails.Unlock()
		time.Sleep(600 * time.Millisecond)
		if found != nil && !found.Active {
			fail(w, 401, "This account is disabled. Ask HQ to enable it.")
			return
		}
		fail(w, 401, "Wrong username or password.")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func hLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie("ph_session"); err == nil {
		mu.Lock()
		delete(st.Sessions, c.Value)
		saveLocked()
		mu.Unlock()
	}
	http.SetCookie(w, &http.Cookie{Name: "ph_session", Value: "", Path: "/", MaxAge: -1})
	writeJSON(w, 200, map[string]any{"ok": true})
}

func hPassword(w http.ResponseWriter, r *http.Request, u *User) {
	var req struct{ Old, New string }
	if !readJSON(w, r, &req, 1<<14) {
		return
	}
	if len(req.New) < 6 {
		fail(w, 400, "The new password must be at least 6 characters.")
		return
	}
	if req.New == req.Old {
		fail(w, 400, "Choose a new password that is different from the current one.")
		return
	}
	mu.Lock()
	defer mu.Unlock()
	real := st.Users[u.ID]
	if subtle.ConstantTimeCompare([]byte(hashPw(req.Old, real.Salt)), []byte(real.Hash)) != 1 {
		fail(w, 400, "Your current password is not correct.")
		return
	}
	real.Salt = randHex(16)
	real.Hash = hashPw(req.New, real.Salt)
	real.MustChange = false
	cur := ""
	if c, err := r.Cookie("ph_session"); err == nil {
		cur = c.Value
	}
	for tok, s := range st.Sessions {
		if s.UserID == real.ID && tok != cur {
			delete(st.Sessions, tok)
		}
	}
	saveLocked()
	writeJSON(w, 200, map[string]any{"ok": true})
}

/* ------------------------------ users (HQ) ------------------------------ */

func hUsers(w http.ResponseWriter, r *http.Request, u *User) {
	switch r.Method {
	case http.MethodGet:
		mu.Lock()
		list := []map[string]any{}
		for _, x := range st.Users {
			list = append(list, publicUser(x))
		}
		mu.Unlock()
		writeJSON(w, 200, map[string]any{"users": list})
	case http.MethodPost:
		var req struct {
			ID, Username, Name, Role, ProjectID, Password, Phone string
			Active                                               *bool
			SiteHead                                             *bool
			Access                                               *Access
		}
		if !readJSON(w, r, &req, 1<<16) {
			return
		}
		req.Username = strings.ToLower(strings.TrimSpace(req.Username))
		req.Name = strings.TrimSpace(req.Name)
		if !usernameRe.MatchString(req.Username) {
			fail(w, 400, "Username must be 3–40 letters, numbers, dots, dashes or underscores (no spaces).")
			return
		}
		if req.Role != "hq" && req.Role != "site" {
			fail(w, 400, "Choose HQ or Site.")
			return
		}
		if req.Role == "site" && req.ProjectID == "" {
			fail(w, 400, "Choose the project this site user works on.")
			return
		}
		mu.Lock()
		defer mu.Unlock()
		for _, x := range st.Users {
			if x.Username == req.Username && x.ID != req.ID {
				fail(w, 409, "That username is already taken.")
				return
			}
		}
		var target *User
		if req.ID != "" {
			target = st.Users[req.ID]
			if target == nil {
				fail(w, 404, "User not found.")
				return
			}
		} else {
			if len(req.Password) < 6 {
				fail(w, 400, "Give the new user a password of at least 6 characters.")
				return
			}
			target = &User{ID: "u_" + randHex(8), Created: time.Now().UnixMilli(), Active: true}
		}
		active := true
		if req.Active != nil {
			active = *req.Active
		}
		if target.ID == u.ID && (!active || req.Role != "hq") {
			fail(w, 400, "You can't disable your own account or remove your own HQ access.")
			return
		}
		var acc *Access
		if req.Role == "hq" {
			acc = target.Access
			if req.Access != nil {
				a := *req.Access
				if a.Admin {
					a.Perms, a.Projects = nil, nil
				} else {
					var ps []string
					seen := map[string]bool{}
					for _, p := range a.Perms {
						if permLabels[p] != "" && !seen[p] {
							seen[p] = true
							ps = append(ps, p)
						}
					}
					a.Perms = ps
					var pj []string
					for _, p := range a.Projects {
						if c := st.Cols["projects"]; c != nil && c[p] != nil && !c[p].Deleted {
							pj = append(pj, p)
						}
					}
					a.Projects = pj
				}
				acc = &a
			} else if req.ID == "" || target.Role != "hq" {
				acc = &Access{Role: "Viewer", Perms: []string{"demands_view", "sitestock_view"}}
			}
			if target.ID == u.ID && acc != nil && !acc.Admin {
				fail(w, 400, "You can't remove your own administrator rights. Ask another administrator.")
				return
			}
		}
		admins := 0
		for _, x := range st.Users {
			if x.ID != target.ID && x.Active && isAdmin(x) {
				admins++
			}
		}
		if active && req.Role == "hq" && (acc == nil || acc.Admin) {
			admins++
		}
		if admins == 0 {
			fail(w, 400, "At least one active administrator is needed. Make someone else an administrator first.")
			return
		}
		target.Username, target.Name, target.Role, target.Active, target.Phone = req.Username, firstNonEmpty(req.Name, req.Username), req.Role, active, strings.TrimSpace(req.Phone)
		target.Access = acc
		target.ProjectID = ""
		if req.Role == "site" {
			target.ProjectID = req.ProjectID
			if req.SiteHead != nil {
				target.SiteHead = *req.SiteHead
			}
		} else {
			target.SiteHead = false
		}
		if req.Password != "" {
			if len(req.Password) < 6 {
				fail(w, 400, "Password must be at least 6 characters.")
				return
			}
			target.Salt = randHex(16)
			target.Hash = hashPw(req.Password, target.Salt)
			target.MustChange = target.ID != u.ID
			for tok, s := range st.Sessions {
				if s.UserID == target.ID && target.ID != u.ID {
					delete(st.Sessions, tok)
				}
			}
		}
		if !active {
			for tok, s := range st.Sessions {
				if s.UserID == target.ID {
					delete(st.Sessions, tok)
				}
			}
		}
		op, what := "update", "role "+target.Role
		if req.ID == "" {
			op = "set"
		}
		if target.Role == "hq" {
			if isAdmin(target) {
				what = "administrator"
			} else {
				what = firstNonEmpty(target.Access.Role, "custom") + " · " + strings.Join(target.Access.Perms, ", ")
			}
		}
		if req.Password != "" && req.ID != "" {
			what += " · password reset"
		}
		st.Users[target.ID] = target
		st.Audit = append(st.Audit, AuditEntry{At: time.Now().UnixMilli(), User: u.Username, Name: u.Name, Col: "users", ID: target.ID, Op: op, Ref: target.Username, Keys: what})
		saveLocked()
		writeJSON(w, 200, map[string]any{"ok": true, "user": publicUser(target)})
	case http.MethodDelete:
		id := r.URL.Query().Get("id")
		if id == u.ID {
			fail(w, 400, "You can't delete your own account.")
			return
		}
		mu.Lock()
		if x := st.Users[id]; x != nil && isAdmin(x) {
			n := 0
			for _, y := range st.Users {
				if y.ID != id && y.Active && isAdmin(y) {
					n++
				}
			}
			if n == 0 {
				mu.Unlock()
				fail(w, 400, "This is the only administrator. Make someone else an administrator first.")
				return
			}
		}
		if x := st.Users[id]; x != nil {
			st.Audit = append(st.Audit, AuditEntry{At: time.Now().UnixMilli(), User: u.Username, Name: u.Name, Col: "users", ID: id, Op: "delete", Ref: x.Username})
		}
		delete(st.Users, id)
		for tok, s := range st.Sessions {
			if s.UserID == id {
				delete(st.Sessions, tok)
			}
		}
		saveLocked()
		mu.Unlock()
		writeJSON(w, 200, map[string]any{"ok": true})
	default:
		fail(w, 405, "Method not allowed.")
	}
}

/* ------------------------------ data sync ------------------------------ */

func visible(u *User, col, id string, d *Doc) bool {
	if u.Role == "hq" {
		if isAdmin(u) || d.Deleted || d.Data == nil {
			return true
		}
		switch col {
		case "projects":
			return inScope(u, id)
		case "indents", "sitelog", "stocklvl", "consumption":
			return inScope(u, str(d.Data, "projectId"))
		case "dispatches":
			return inScope(u, str(d.Data, "projectId")) || inScope(u, str(d.Data, "fromProjectId"))
		}
		return true
	}
	if d.Deleted || d.Data == nil {
		return col != "vendors" && col != "rfqs" && col != "pos" && col != "grns" && col != "jobwork" && col != "mailquotes"
	}
	switch col {
	case "projects", "catalog", "config":
		return true
	case "indents", "sitelog", "stocklvl", "consumption":
		return str(d.Data, "projectId") == u.ProjectID
	case "dispatches":
		return str(d.Data, "projectId") == u.ProjectID || str(d.Data, "fromProjectId") == u.ProjectID
	}
	return false
}

type outDoc struct {
	Col     string         `json:"col"`
	ID      string         `json:"id"`
	Data    map[string]any `json:"data,omitempty"`
	Deleted bool           `json:"deleted,omitempty"`
}

func hSync(w http.ResponseWriter, r *http.Request, u *User) {
	q := r.URL.Query()
	since, _ := strconv.ParseInt(q.Get("since"), 10, 64)
	wait := q.Get("wait") == "1"
	deadline := time.Now().Add(25 * time.Second)
	for {
		mu.Lock()
		reset := q.Get("epoch") != st.Epoch || since > st.Rev
		from := since
		if reset {
			from = 0
		}
		docs := []outDoc{}
		for col, m := range st.Cols {
			for id, d := range m {
				if d.Rev > from && visible(u, col, id, d) {
					if reset && d.Deleted {
						continue
					}
					docs = append(docs, outDoc{Col: col, ID: id, Data: sanitizeFor(u, col, d.Data), Deleted: d.Deleted})
				}
			}
		}
		rev, epoch, ch := st.Rev, st.Epoch, changeCh
		mu.Unlock()
		if len(docs) > 0 || reset || !wait || from == 0 {
			writeJSON(w, 200, map[string]any{"rev": rev, "epoch": epoch, "reset": reset || from == 0, "docs": docs, "v": appVersion})
			return
		}
		since = rev
		select {
		case <-ch:
		case <-time.After(time.Until(deadline)):
			writeJSON(w, 200, map[string]any{"rev": rev, "epoch": epoch, "docs": []outDoc{}, "v": appVersion})
			return
		case <-r.Context().Done():
			return
		}
	}
}

var errDeny = errors.New("Site accounts can't change this record.")

var hqLineFields = []string{"approvedQty", "approvedAt", "rfqId", "rfqNo", "rfqAt", "poId", "poNo", "poAt", "vendorName", "orderedQty", "fromStock", "expectedDate", "hqNote", "transferId", "transferNo", "transferFrom", "transferAt", "splitFrom", "approvalNote", "decidedBy", "decidedByName", "decidedAt"}

// siteCheck limits what site accounts may write and returns the data to store.
func siteCheck(u *User, op, col string, ex, patch, merged map[string]any) (map[string]any, error) {
	switch col {
	case "indents":
		if op == "set" && ex == nil {
			if str(merged, "projectId") != u.ProjectID {
				return nil, errors.New("You can only raise demands for your own project.")
			}
			merged["createdBy"] = u.ID
			merged["createdByName"] = u.Name
			merged["raisedByHQ"] = false
			precheckNew(u, merged)
			delete(merged, "cancelled")
			delete(merged, "hqRemarks")
			lines, _ := merged["lines"].([]any)
			if len(lines) == 0 {
				return nil, errors.New("Add at least one item.")
			}
			for _, li := range lines {
				m, ok := li.(map[string]any)
				if !ok {
					return nil, errors.New("Invalid item line.")
				}
				m["status"] = "pending"
				for _, k := range hqLineFields {
					delete(m, k)
				}
			}
			return merged, nil
		}
		if op == "update" || op == "set" {
			return nil, errors.New("A demand can't be changed from site after it is sent. It is read-only here; ask HQ if something needs to change.")
		}
	case "dispatches":
		if op != "update" || ex == nil {
			break
		}
		status := str(ex, "status")
		// A signed and stamped copy can be added later to a receipt already confirmed.
		if str(ex, "projectId") == u.ProjectID && (status == "delivered" || status == "short") {
			out := shallowCopy(ex)
			for k, v := range patch {
				if k != "signedDocs" {
					return nil, errDeny
				}
				if len(anyList(v)) == 0 {
					return nil, errors.New("Attach the signed and stamped challan.")
				}
				out[k] = v
			}
			out["signedAt"] = time.Now().UnixMilli()
			return out, nil
		}
		if str(ex, "projectId") == u.ProjectID && (status == "ordered" || status == "in_transit") {
			out := shallowCopy(ex)
			for k, v := range patch {
				switch k {
				case "status":
					sv, _ := v.(string)
					if sv != "delivered" && sv != "short" {
						return nil, errDeny
					}
					out[k] = sv
				case "receivedAt", "receivedByName", "siteRemarks", "photos", "signedDocs", "receiverDesignation", "receivedOn", "declared":
					out[k] = v
				case "receivedBy":
				case "lines":
					nl, _ := v.([]any)
					ol, _ := ex["lines"].([]any)
					if len(nl) != len(ol) {
						return nil, errDeny
					}
					cp := make([]any, len(ol))
					for i := range ol {
						om, _ := ol[i].(map[string]any)
						m := shallowCopy(om)
						if nm, ok := nl[i].(map[string]any); ok {
							m["recvQty"] = nm["recvQty"]
						}
						cp[i] = m
					}
					out["lines"] = cp
				default:
					return nil, errDeny
				}
			}
			out["receivedBy"] = u.ID
			if s := str(out, "status"); s == "delivered" || s == "short" {
				if err := checkSiteReceipt(u, out); err != nil {
					return nil, err
				}
				out["signedAt"] = time.Now().UnixMilli()
			}
			return out, nil
		}
		if str(ex, "fromProjectId") == u.ProjectID && status == "to_send" {
			out := shallowCopy(ex)
			for k, v := range patch {
				switch k {
				case "status":
					if sv, _ := v.(string); sv != "in_transit" {
						return nil, errDeny
					}
					out[k] = v
				case "vehicle", "lrNo", "driver", "shippedAt", "sentByName", "sendRemarks", "sentPhotos":
					out[k] = v
				default:
					return nil, errDeny
				}
			}
			out["sentBy"] = u.ID
			return out, nil
		}
		if str(ex, "projectId") == u.ProjectID || str(ex, "fromProjectId") == u.ProjectID {
			return nil, errors.New("This consignment has already been handled or cancelled. Refresh the page.")
		}
	case "sitelog":
		if op == "set" && ex == nil {
			if str(merged, "projectId") != u.ProjectID {
				return nil, errors.New("You can only record stock for your own project.")
			}
			t := str(merged, "type")
			if t != "use" && t != "opening" && t != "damage" && t != "return" && t != "adjust" {
				return nil, errDeny
			}
			q, _ := merged["qty"].(float64)
			if t == "adjust" && q == 0 || t != "adjust" && !(q > 0) {
				return nil, errors.New("Enter a quantity.")
			}
			merged["createdBy"] = u.ID
			merged["createdByName"] = u.Name
			// values of existing stock are entered by HQ
			delete(merged, "orate")
			delete(merged, "value")
			return merged, nil
		}
	case "consumption":
		if str(merged, "projectId") != u.ProjectID || (ex != nil && str(ex, "projectId") != u.ProjectID) {
			return nil, errors.New("You can only report consumption for your own project.")
		}
		return merged, nil
	case "stocklvl":
		if str(merged, "projectId") != u.ProjectID || (ex != nil && str(ex, "projectId") != u.ProjectID) {
			return nil, errors.New("You can only set stock levels for your own project.")
		}
		if q, _ := merged["min"].(float64); q < 0 {
			return nil, errors.New("Minimum level can't be negative.")
		}
		return merged, nil
	}
	return nil, errDeny
}

func hWrite(w http.ResponseWriter, r *http.Request, u *User) {
	var req struct {
		Op   string         `json:"op"`
		Col  string         `json:"col"`
		ID   string         `json:"id"`
		Data map[string]any `json:"data"`
	}
	if !readJSON(w, r, &req, 8<<20) {
		return
	}
	if !collections[req.Col] || !idRe.MatchString(req.ID) {
		fail(w, 400, "Invalid record.")
		return
	}
	mu.Lock()
	defer mu.Unlock()
	c := st.Cols[req.Col]
	if c == nil {
		c = map[string]*Doc{}
		st.Cols[req.Col] = c
	}
	ex := c[req.ID]
	var exData map[string]any
	if ex != nil && !ex.Deleted {
		exData = ex.Data
	}
	var newData map[string]any
	switch req.Op {
	case "set":
		if req.Data == nil {
			fail(w, 400, "No data.")
			return
		}
		newData = req.Data
	case "update":
		if exData == nil {
			fail(w, 404, "This record no longer exists. Refresh and try again.")
			return
		}
		newData = shallowCopy(exData)
		for k, v := range req.Data {
			newData[k] = v
		}
	case "delete":
		if exData == nil {
			writeJSON(w, 200, map[string]any{"ok": true})
			return
		}
	default:
		fail(w, 400, "Unknown operation.")
		return
	}
	if u.Role != "hq" {
		if req.Op == "delete" {
			ownPending := req.Col == "consumption" && str(exData, "projectId") == u.ProjectID && str(exData, "reportedBy") == u.ID && str(exData, "status") == "pending"
			if !ownPending && !(req.Col == "sitelog" && str(exData, "projectId") == u.ProjectID && str(exData, "createdBy") == u.ID) && !(req.Col == "stocklvl" && str(exData, "projectId") == u.ProjectID) {
				fail(w, 403, errDeny.Error())
				return
			}
		} else {
			var err error
			newData, err = siteCheck(u, req.Op, req.Col, exData, req.Data, newData)
			if err != nil {
				fail(w, 403, err.Error())
				return
			}
		}
	} else if err := hqCheck(u, req.Op, req.Col, exData, req.Data, newData); err != nil {
		fail(w, 403, err.Error())
		return
	} else if req.Col == "indents" && req.Op != "delete" {
		if err := precheckGuard(u, req.Op, exData, req.Data, newData); err != nil {
			fail(w, 403, err.Error())
			return
		}
	}
	if u.Role == "hq" && req.Col == "config" && req.ID == "main" {
		if err := precheckConfigGuard(exData, newData); err != nil {
			fail(w, 400, err.Error())
			return
		}
	}
	// approval by the Director (Procurement), receipts and consumption, for everyone
	if req.Op != "delete" {
		if err := approvalGuard(u, req.Op, req.Col, exData, req.Data, newData); err != nil {
			fail(w, 403, err.Error())
			return
		}
		if err := receiptGuard(req.Col, exData, newData); err != nil {
			fail(w, 403, err.Error())
			return
		}
		if req.Col == "consumption" {
			if err := consumptionGuard(u, exData, req.Data, newData); err != nil {
				fail(w, 403, err.Error())
				return
			}
		}
	} else if req.Col == "consumption" && str(exData, "status") == "authenticated" && !isAdmin(u) {
		fail(w, 403, "An authenticated consumption report cannot be deleted.")
		return
	}
	if req.Col == "jobwork" && req.Op != "delete" {
		if err := checkJobwork(req.ID, newData); err != nil {
			fail(w, 400, err.Error())
			return
		}
	}
	if u.Role == "hq" && req.Col == "indents" && newData != nil {
		stampDecisions(u, exData, newData)
	}
	if u.Role == "hq" && req.Op == "set" && exData == nil && newData != nil {
		switch req.Col {
		case "dispatches":
			enrichStoreDispatch(newData)
		case "grns":
			enrichGrn(newData)
		}
	}
	auditLocked(u, req.Op, req.Col, req.ID, firstMap(newData, exData), req.Data)
	st.Rev++
	d := &Doc{Rev: st.Rev}
	if req.Op == "delete" {
		d.Deleted = true
	} else {
		d.Data = newData
	}
	c[req.ID] = d
	if err := saveLocked(); err != nil {
		fail(w, 500, "The server could not save to disk: "+err.Error())
		return
	}
	notifyLocked()
	writeJSON(w, 200, map[string]any{"ok": true, "doc": outDoc{Col: req.Col, ID: req.ID, Data: sanitizeFor(u, req.Col, d.Data), Deleted: d.Deleted}})
}

func firstMap(a, b map[string]any) map[string]any {
	if a != nil {
		return a
	}
	return b
}

func hCounter(w http.ResponseWriter, r *http.Request, u *User) {
	var req struct {
		Prefix string `json:"prefix"`
		FY     string `json:"fy"`
		Floor  int64  `json:"floor"`
	}
	if !readJSON(w, r, &req, 1<<12) {
		return
	}
	if !prefixRe.MatchString(req.Prefix) || !fyRe.MatchString(req.FY) {
		fail(w, 400, "Invalid number series.")
		return
	}
	if u.Role != "hq" && req.Prefix != "MR" && req.Prefix != "CR" {
		fail(w, 403, "Not allowed.")
		return
	}
	if u.Role == "hq" {
		perm := map[string][]string{"MR": {"raise_demand"}, "RFQ": {"rfq_create"}, "PO": {"po_issue"}, "DD": {"po_issue"}, "GRN": {"store"}, "DC": {"store"}, "TR": {"store"}, "JW": {"store", "po_issue"}, "JC": {"store", "po_issue"}, "STI": {"store", "po_issue"}, "CR": {"sitestock_edit"}, "OS": {"store", "sitestock_edit"}}[req.Prefix]
		if perm != nil {
			if err := need(u, perm...); err != nil {
				fail(w, 403, err.Error())
				return
			}
		}
	}
	mu.Lock()
	defer mu.Unlock()
	key := req.Prefix + "-" + req.FY
	n := st.Counters[key]
	if req.Floor > n {
		n = req.Floor
	}
	n++
	st.Counters[key] = n
	saveLocked()
	writeJSON(w, 200, map[string]any{"n": n})
}

/* ------------------------------ photos & files ------------------------------ */

func hUpload(w http.ResponseWriter, r *http.Request, u *User) {
	if r.Method != http.MethodPost {
		fail(w, 405, "Method not allowed.")
		return
	}
	const max = 12 << 20
	b, err := io.ReadAll(io.LimitReader(r.Body, max+1))
	if err != nil || len(b) == 0 {
		fail(w, 400, "The photo could not be read. Try again.")
		return
	}
	if len(b) > max {
		fail(w, 413, "This file is too large. The limit is 12 MB.")
		return
	}
	ext := map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf"}[http.DetectContentType(b)]
	if ext == "" {
		fail(w, 415, "Only JPG, PNG or WebP photos and PDF files can be uploaded.")
		return
	}
	id := randHex(12) + ext
	if err := os.WriteFile(filepath.Join(filesDir, id), b, 0600); err != nil {
		fail(w, 500, "The server could not save the file: "+err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"id": id})
}

func hFile(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/files/")
	if !fileIDRe.MatchString(id) {
		http.NotFound(w, r)
		return
	}
	if currentUser(r) == nil {
		mu.Lock()
		logo := configLocked("logo")
		mu.Unlock()
		if id != logo {
			fail(w, 401, "Please sign in.")
			return
		}
	}
	b, err := os.ReadFile(filepath.Join(filesDir, id))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", fileTypes[path.Ext(id)])
	w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	w.Write(b)
}

/* ------------------------------ backup / restore ------------------------------ */

func hBackup(w http.ResponseWriter, r *http.Request, u *User) {
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="procurehub-backup-`+time.Now().Format("2006-01-02")+`.zip"`)
	writeFullZip(w)
}

// writeFullZip writes data + photos + an Excel copy in the restore format.
func writeFullZip(w io.Writer) error {
	mu.Lock()
	data, err := json.MarshalIndent(exportLocked(), "", " ")
	sheets := buildWorkbookLocked()
	mu.Unlock()
	if err != nil {
		return err
	}
	zw := zip.NewWriter(w)
	if f, err := zw.Create("procurehub-data.json"); err == nil {
		f.Write(data)
	}
	if f, err := zw.Create("procurehub-data.xlsx"); err == nil {
		writeXLSX(f, sheets)
	}
	entries, _ := os.ReadDir(filesDir)
	for _, e := range entries {
		if !fileIDRe.MatchString(e.Name()) {
			continue
		}
		b, err := os.ReadFile(filepath.Join(filesDir, e.Name()))
		if err != nil {
			continue
		}
		if f, err := zw.CreateHeader(&zip.FileHeader{Name: "files/" + e.Name(), Method: zip.Store}); err == nil {
			f.Write(b)
		}
	}
	return zw.Close()
}

type restoreReq struct {
	App      string                               `json:"app"`
	Cols     map[string]map[string]map[string]any `json:"cols"`
	Counters map[string]int64                     `json:"counters"`
}

func hRestore(w http.ResponseWriter, r *http.Request, u *User) {
	var req restoreReq
	nfiles := 0
	if strings.HasPrefix(r.Header.Get("Content-Type"), "application/zip") {
		if r.Method != http.MethodPost {
			fail(w, 405, "Method not allowed.")
			return
		}
		b, err := io.ReadAll(io.LimitReader(r.Body, 2<<30))
		if err != nil {
			fail(w, 400, "The backup could not be read.")
			return
		}
		zr, err := zip.NewReader(bytes.NewReader(b), int64(len(b)))
		if err != nil {
			fail(w, 400, "This is not a ProcureHub backup file.")
			return
		}
		found := false
		for _, f := range zr.File {
			if f.Name == "procurehub-data.json" {
				rc, err := f.Open()
				if err == nil {
					found = json.NewDecoder(rc).Decode(&req) == nil
					rc.Close()
				}
			}
		}
		if !found {
			fail(w, 400, "This zip does not contain ProcureHub data.")
			return
		}
		for _, f := range zr.File {
			name := strings.TrimPrefix(f.Name, "files/")
			if !strings.HasPrefix(f.Name, "files/") || !fileIDRe.MatchString(name) {
				continue
			}
			rc, err := f.Open()
			if err != nil {
				continue
			}
			if out, err := os.Create(filepath.Join(filesDir, name)); err == nil {
				io.Copy(out, io.LimitReader(rc, 64<<20))
				out.Close()
				nfiles++
			}
			rc.Close()
		}
	} else if !readJSON(w, r, &req, 200<<20) {
		return
	}
	if req.App != "ProcureHub" || req.Cols == nil {
		fail(w, 400, "This is not a ProcureHub backup file.")
		return
	}
	mu.Lock()
	defer mu.Unlock()
	if b, err := json.Marshal(exportLocked()); err == nil {
		os.WriteFile(filepath.Join(dataDir, "backups", "before-restore-"+time.Now().Format("2006-01-02-150405")+".json"), b, 0600)
	}
	st.Cols = map[string]map[string]*Doc{}
	n := 0
	for col, docs := range req.Cols {
		if !collections[col] {
			continue
		}
		st.Cols[col] = map[string]*Doc{}
		for id, data := range docs {
			if !idRe.MatchString(id) || data == nil {
				continue
			}
			st.Rev++
			st.Cols[col][id] = &Doc{Rev: st.Rev, Data: data}
			n++
		}
	}
	for k, v := range req.Counters {
		if v > st.Counters[k] {
			st.Counters[k] = v
		}
	}
	st.Epoch = randHex(8)
	saveLocked()
	notifyLocked()
	writeJSON(w, 200, map[string]any{"ok": true, "records": n, "files": nfiles})
}

/* ------------------------------ email ------------------------------ */

func clean(s string) string { return strings.NewReplacer("\r", " ", "\n", " ").Replace(s) }

func b64wrap(s string) string {
	e := base64.StdEncoding.EncodeToString([]byte(s))
	var b strings.Builder
	for len(e) > 76 {
		b.WriteString(e[:76] + "\r\n")
		e = e[76:]
	}
	b.WriteString(e)
	return b.String()
}

type mailAttachment struct {
	Name, Type string
	Data       []byte
	CID        string // set for an image shown inside the HTML (src="cid:…")
}

func buildMsg(c SMTPConf, to []string, subject, html, text string, atts ...mailAttachment) []byte {
	from := c.From
	if c.FromName != "" {
		from = mime.QEncoding.Encode("utf-8", clean(c.FromName)) + " <" + c.From + ">"
	}
	domain := "procurehub.local"
	if i := strings.LastIndex(c.From, "@"); i >= 0 {
		domain = c.From[i+1:]
	}
	var inline, regular []mailAttachment
	for _, a := range atts {
		if a.CID != "" {
			inline = append(inline, a)
		} else {
			regular = append(regular, a)
		}
	}
	if text == "" {
		text = "Please view this message in an email program that shows HTML."
	}
	// text + html alternatives
	alt := "ph_" + randHex(12)
	var body strings.Builder
	fmt.Fprintf(&body, "--%s\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n%s\r\n", alt, b64wrap(text))
	if html != "" {
		fmt.Fprintf(&body, "--%s\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n%s\r\n", alt, b64wrap("<!doctype html><html><body>"+html+"</body></html>"))
	}
	fmt.Fprintf(&body, "--%s--\r\n", alt)
	ctype, part := fmt.Sprintf("multipart/alternative; boundary=\"%s\"", alt), body.String()
	if len(inline) > 0 { // images shown inside the mail
		rel := "phr_" + randHex(12)
		var b strings.Builder
		fmt.Fprintf(&b, "--%s\r\nContent-Type: %s\r\n\r\n%s", rel, ctype, part)
		for _, a := range inline {
			fmt.Fprintf(&b, "--%s\r\nContent-Type: %s\r\nContent-ID: <%s>\r\nContent-Disposition: inline; filename=\"%s\"\r\nContent-Transfer-Encoding: base64\r\n\r\n%s\r\n", rel, a.Type, clean(a.CID), clean(a.Name), b64wrapBytes(a.Data))
		}
		fmt.Fprintf(&b, "--%s--\r\n", rel)
		ctype, part = fmt.Sprintf("multipart/related; type=\"multipart/alternative\"; boundary=\"%s\"", rel), b.String()
	}
	if len(regular) > 0 {
		mixed := "phm_" + randHex(12)
		var b strings.Builder
		fmt.Fprintf(&b, "--%s\r\nContent-Type: %s\r\n\r\n%s", mixed, ctype, part)
		for _, a := range regular {
			fmt.Fprintf(&b, "--%s\r\nContent-Type: %s; name=\"%s\"\r\nContent-Disposition: attachment; filename=\"%s\"\r\nContent-Transfer-Encoding: base64\r\n\r\n%s\r\n", mixed, a.Type, clean(a.Name), clean(a.Name), b64wrapBytes(a.Data))
		}
		fmt.Fprintf(&b, "--%s--\r\n", mixed)
		ctype, part = fmt.Sprintf("multipart/mixed; boundary=\"%s\"", mixed), b.String()
	}
	var b strings.Builder
	fmt.Fprintf(&b, "From: %s\r\nTo: %s\r\nSubject: %s\r\nDate: %s\r\nMessage-ID: <%s@%s>\r\nMIME-Version: 1.0\r\nContent-Type: %s\r\n\r\n%s",
		from, clean(strings.Join(to, ", ")), mime.BEncoding.Encode("utf-8", clean(subject)), time.Now().Format(time.RFC1123Z), randHex(10), domain, ctype, part)
	return []byte(b.String())
}

func b64wrapBytes(d []byte) string {
	e := base64.StdEncoding.EncodeToString(d)
	var b strings.Builder
	for len(e) > 76 {
		b.WriteString(e[:76] + "\r\n")
		e = e[76:]
	}
	b.WriteString(e)
	return b.String()
}

func sendMail(c SMTPConf, to []string, subject, html, text string, atts ...mailAttachment) error {
	if c.Host == "" || c.From == "" {
		return errors.New("Email is not set up yet. Fill in the email settings in Settings.")
	}
	port := c.Port
	if port == 0 {
		port = 587
	}
	addr := net.JoinHostPort(c.Host, strconv.Itoa(port))
	dialer := &net.Dialer{Timeout: 20 * time.Second}
	var conn net.Conn
	var err error
	if c.Security == "ssl" {
		conn, err = tls.DialWithDialer(dialer, "tcp", addr, &tls.Config{ServerName: c.Host})
	} else {
		conn, err = dialer.Dial("tcp", addr)
	}
	if err != nil {
		return fmt.Errorf("Could not reach the mail server %s (%v). Check the server name, port and this computer's internet connection.", addr, err)
	}
	conn.SetDeadline(time.Now().Add(90 * time.Second))
	cl, err := smtp.NewClient(conn, c.Host)
	if err != nil {
		conn.Close()
		return fmt.Errorf("Mail server error: %v", err)
	}
	defer cl.Close()
	if c.Security != "ssl" && c.Security != "none" {
		if ok, _ := cl.Extension("STARTTLS"); ok {
			if err := cl.StartTLS(&tls.Config{ServerName: c.Host}); err != nil {
				return fmt.Errorf("Secure connection failed: %v", err)
			}
		} else {
			return errors.New("The mail server does not offer STARTTLS. Try security 'SSL' with port 465.")
		}
	}
	if c.User != "" {
		if err := cl.Auth(smtp.PlainAuth("", c.User, c.Pass, c.Host)); err != nil {
			return fmt.Errorf("The mail server rejected the login (%v). For Gmail, use an App password, not your normal password.", err)
		}
	}
	if err := cl.Mail(c.From); err != nil {
		return fmt.Errorf("Sender rejected: %v", err)
	}
	for _, t := range to {
		if err := cl.Rcpt(strings.TrimSpace(t)); err != nil {
			return fmt.Errorf("Recipient %s rejected: %v", t, err)
		}
	}
	wc, err := cl.Data()
	if err != nil {
		return err
	}
	if _, err := wc.Write(buildMsg(c, to, subject, html, text, atts...)); err != nil {
		return err
	}
	if err := wc.Close(); err != nil {
		return fmt.Errorf("Mail server did not accept the message: %v", err)
	}
	cl.Quit()
	return nil
}

func smtpPublic(c SMTPConf) map[string]any {
	return map[string]any{"host": c.Host, "port": c.Port, "security": c.Security, "user": c.User, "from": c.From, "fromName": c.FromName, "hasPass": c.Pass != "", "configured": c.Host != "" && c.From != ""}
}

func hSMTP(w http.ResponseWriter, r *http.Request, u *User) {
	if r.Method == http.MethodGet {
		mu.Lock()
		c := st.SMTP
		mu.Unlock()
		writeJSON(w, 200, smtpPublic(c))
		return
	}
	var req struct {
		Host, Security, User, Pass, From, FromName string
		Port                                       any
	}
	if !readJSON(w, r, &req, 1<<14) {
		return
	}
	port := 0
	switch p := req.Port.(type) {
	case float64:
		port = int(p)
	case string:
		port, _ = strconv.Atoi(strings.TrimSpace(p))
	}
	mu.Lock()
	defer mu.Unlock()
	c := st.SMTP
	c.Host, c.Port, c.Security, c.User = strings.TrimSpace(req.Host), port, req.Security, strings.TrimSpace(req.User)
	c.From, c.FromName = strings.TrimSpace(req.From), strings.TrimSpace(req.FromName)
	if req.Pass != "" {
		c.Pass = strings.ReplaceAll(req.Pass, " ", "")
	}
	st.SMTP = c
	saveLocked()
	writeJSON(w, 200, smtpPublic(c))
}

func hMail(w http.ResponseWriter, r *http.Request, u *User) {
	var req struct {
		To                  []string
		Subject, HTML, Text string
		RfqSheet            struct{ Rfq, Vendor string }
		PoID                string
	}
	if !readJSON(w, r, &req, 4<<20) {
		return
	}
	var to []string
	for _, t := range req.To {
		t = strings.TrimSpace(t)
		if t != "" && strings.Contains(t, "@") && !strings.ContainsAny(t, "\r\n<>,") {
			to = append(to, t)
		}
	}
	if len(to) == 0 || len(to) > 50 {
		fail(w, 400, "No valid email address.")
		return
	}
	mu.Lock()
	c := st.SMTP
	mu.Unlock()
	var atts []mailAttachment
	if req.RfqSheet.Rfq != "" { // the quotation sheet the vendor fills in and sends back
		name, data, err := buildRFQSheet(req.RfqSheet.Rfq, req.RfqSheet.Vendor)
		if err != nil {
			fail(w, 400, err.Error())
			return
		}
		atts = append(atts, mailAttachment{Name: name, Type: xlsxType, Data: data})
	}
	html := req.HTML
	if req.PoID != "" { // a purchase order may go to the vendor only once approved
		mu.Lock()
		po := docData("pos", req.PoID)
		mu.Unlock()
		if po == nil {
			fail(w, 404, "Purchase order not found.")
			return
		}
		if !poApproved(po) {
			fail(w, 403, "This purchase order is waiting for approval by the Director (Procurement). It cannot be sent to the vendor yet.")
			return
		}
		var inl []mailAttachment
		html, inl = inlineFiles(html)
		atts = append(atts, inl...)
	}
	if err := sendMail(c, to, req.Subject, html, req.Text, atts...); err != nil {
		fail(w, 502, err.Error())
		return
	}
	log.Printf("Email sent to %s: %s", strings.Join(to, ", "), clean(req.Subject))
	writeJSON(w, 200, map[string]any{"ok": true})
}

func hSMTPTest(w http.ResponseWriter, r *http.Request, u *User) {
	mu.Lock()
	c := st.SMTP
	mu.Unlock()
	if err := sendMail(c, []string{c.From}, "ProcureHub test email", "<p>Email from ProcureHub is working. RFQs and purchase orders will be sent from this address.</p>", "Email from ProcureHub is working."); err != nil {
		fail(w, 502, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "to": c.From})
}

/* ------------------------------ static web app ------------------------------ */

type asset struct {
	b         []byte
	ctype     string
	etag      string
	immutable bool
}

var assets = map[string]*asset{}

var staticTypes = map[string]string{".jpg": "image/jpeg", ".webp": "image/webp", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json"}

func loadAssets() {
	fs.WalkDir(webFS, "web", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		b, _ := webFS.ReadFile(p)
		ct := staticTypes[path.Ext(p)]
		if ct == "" {
			ct = "application/octet-stream"
		}
		sum := sha256.Sum256(b)
		rel := "/" + strings.TrimPrefix(p, "web/")
		assets[rel] = &asset{b: b, ctype: ct, etag: `"` + hex.EncodeToString(sum[:8]) + `"`, immutable: strings.HasPrefix(rel, "/fonts/")}
		return nil
	})
}

func hStatic(w http.ResponseWriter, r *http.Request) {
	p := r.URL.Path
	switch p {
	case "/":
		p = "/index.html"
	case "/favicon.ico":
		p = "/icon-192.png"
	case "/manifest.json":
		mu.Lock()
		name := firstNonEmpty(configLocked("company"), "RGS Infra")
		mu.Unlock()
		writeJSON(w, 200, map[string]any{"name": name + " ProcureHub", "short_name": "ProcureHub", "start_url": "/", "display": "standalone", "background_color": "#0E2438", "theme_color": "#0E2438",
			"icons": []map[string]any{{"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"}, {"src": "/icon.svg", "sizes": "any", "type": "image/svg+xml"}}})
		return
	}
	a := assets[p]
	if a == nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", a.ctype)
	w.Header().Set("ETag", a.etag)
	if a.immutable {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	} else if strings.HasPrefix(p, "/img/") {
		w.Header().Set("Cache-Control", "public, max-age=604800")
	} else {
		w.Header().Set("Cache-Control", "no-cache")
	}
	if r.Header.Get("If-None-Match") == a.etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Write(a.b)
}

func secure(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "SAMEORIGIN")
		w.Header().Set("Referrer-Policy", "same-origin")
		h.ServeHTTP(w, r)
	})
}

/* ------------------------------ main ------------------------------ */

func lanIPs() []string {
	var out []string
	ifs, _ := net.Interfaces()
	for _, i := range ifs {
		if i.Flags&net.FlagUp == 0 || i.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := i.Addrs()
		for _, a := range addrs {
			if ipn, ok := a.(*net.IPNet); ok && ipn.IP.To4() != nil && !ipn.IP.IsLinkLocalUnicast() {
				out = append(out, ipn.IP.String())
			}
		}
	}
	return out
}

func pauseIfWindows() {
	if runtime.GOOS == "windows" {
		fmt.Println("\nPress Enter to close this window.")
		bufio.NewReader(os.Stdin).ReadString('\n')
	}
}

func die(format string, a ...any) {
	fmt.Printf("\nERROR: "+format+"\n", a...)
	pauseIfWindows()
	os.Exit(1)
}

func openBrowser(url string) {
	switch runtime.GOOS {
	case "windows":
		exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		exec.Command("open", url).Start()
	}
}

var listenPort int

func main() {
	defPort := 8080
	if p, err := strconv.Atoi(os.Getenv("PROCUREHUB_PORT")); err == nil && p > 0 {
		defPort = p
	}
	port := flag.Int("port", defPort, "port to listen on")
	data := flag.String("data", os.Getenv("PROCUREHUB_DATA"), "folder for the database, photos and backups (default: ProcureHub-Data next to the program)")
	cert := flag.String("tls-cert", "", "TLS certificate file (optional, for https)")
	key := flag.String("tls-key", "", "TLS key file (optional, for https)")
	noBrowser := flag.Bool("no-browser", false, "do not open the browser on start")
	resetPw := flag.String("reset-password", "", "set a new password for this username and exit")
	noFw := flag.Bool("no-firewall", false, "Windows: do not set up Windows Firewall")
	installed := flag.Bool("installed", false, "internal: started by an update")
	here := flag.Bool("here", false, "use this folder's data even if another ProcureHub data folder exists")
	flag.Parse()

	setTitle(appName)
	log.SetFlags(log.Ldate | log.Ltime)
	exe, err := os.Executable()
	if err != nil {
		die("cannot find program folder: %v", err)
	}
	if real, err := filepath.EvalSymlinks(exe); err == nil {
		exe = real
	}
	dataGiven := *data != ""
	if !dataGiven {
		*data = filepath.Join(filepath.Dir(exe), "ProcureHub-Data")
	}
	if !*installed && !*here && *resetPw == "" {
		var pass []string
		for _, a := range os.Args[1:] {
			if a != "--installed" && a != "-installed" {
				pass = append(pass, a)
			}
		}
		takeOver(*port, exe, pass)
		if !dataGiven {
			relocate(exe, *data, pass)
		}
	}
	dataDir = *data
	filesDir = filepath.Join(dataDir, "files")
	for _, d := range []string{filepath.Join(dataDir, "backups"), filesDir} {
		if err := os.MkdirAll(d, 0700); err != nil {
			die("cannot create the data folder %s: %v", d, err)
		}
	}
	dbPath = filepath.Join(dataDir, "procurehub-db.json")
	_, statErr := os.Stat(dbPath)
	freshData := os.IsNotExist(statErr)
	if err := load(); err != nil {
		die("%v", err)
	}
	loadAssets()

	if *resetPw != "" {
		name := strings.ToLower(*resetPw)
		for _, u := range st.Users {
			if u.Username == name {
				pw := randHex(4) + "-" + randHex(3)
				u.Salt = randHex(16)
				u.Hash = hashPw(pw, u.Salt)
				u.Active = true
				saveLocked()
				fmt.Printf("New password for %s: %s\nSign in with it, then change it from your profile menu.\n", name, pw)
				pauseIfWindows()
				return
			}
		}
		die("no user named %q", name)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/me", hMe)
	mux.HandleFunc("/api/setup", hSetup)
	mux.HandleFunc("/api/login", hLogin)
	mux.HandleFunc("/api/logout", hLogout)
	mux.HandleFunc("/api/password", authed(hPassword))
	mux.HandleFunc("/api/me/sign", authed(hMySign))
	mux.HandleFunc("/api/items/rename", adminOnly(hItemRename))
	mux.HandleFunc("/api/users", adminOnly(hUsers))
	mux.HandleFunc("/api/audit", adminOnly(hAudit))
	mux.HandleFunc("/api/sync", authed(hSync))
	mux.HandleFunc("/api/write", authed(hWrite))
	mux.HandleFunc("/api/counter", authed(hCounter))
	mux.HandleFunc("/api/upload", authed(hUpload))
	mux.HandleFunc("/api/backup", permOnly(hBackup, "settings"))
	mux.HandleFunc("/api/backup/status", permOnly(hBackupStatus, "settings"))
	mux.HandleFunc("/api/backup/now", permOnly(hBackupNow, "settings"))
	mux.HandleFunc("/api/backup/config", permOnly(hBackupConfig, "settings"))
	mux.HandleFunc("/api/backup/file", permOnly(hBackupFile, "settings"))
	mux.HandleFunc("/api/export.xlsx", permOnly(hExportXLSX, "reports"))
	mux.HandleFunc("/api/xlsx", authed(hXLSX))
	mux.HandleFunc("/api/restore", adminOnly(hRestore))
	mux.HandleFunc("/api/smtp", permOnly(hSMTP, "settings"))
	mux.HandleFunc("/api/smtp/test", permOnly(hSMTPTest, "settings"))
	mux.HandleFunc("/api/mail", permOnly(hMail, "rfq_create", "po_issue"))
	mux.HandleFunc("/api/mailin", permOnly(hMailIn, "settings"))
	mux.HandleFunc("/api/mailin/check", permOnly(hMailInCheck, "quotes_enter", "rfq_create", "settings"))
	mux.HandleFunc("/api/mailin/assign", permOnly(hMailInAssign, "quotes_enter"))
	mux.HandleFunc("/api/rfqsheet", permOnly(hRFQSheet, "rfq_create", "quotes_enter"))
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { fail(w, 404, "Not found.") })
	mux.HandleFunc("/files/", hFile)
	mux.HandleFunc("/", hStatic)

	listenPort = *port
	writeMarker(exe, dataDir)
	if !dataGiven && !*here {
		own, _ := inspectData(dataDir)
		own.Dir = dataDir
		noteOtherData(filepath.Dir(exe), own)
	}
	fwStatus := ensureFirewall(*port, *noFw)
	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", *port))
	if err != nil {
		die("port %d is already in use. ProcureHub may already be running in another window.\nTo use another port, start it with:  RGS-ProcureHub.exe --port 8090", *port)
	}
	scheme := "http"
	if *cert != "" && *key != "" {
		scheme = "https"
	}
	fmt.Println("==============================================================")
	fmt.Printf("  %s %s is running\n", appName, appVersion)
	fmt.Println("==============================================================")
	fmt.Printf("  On this computer:      %s://localhost:%d\n", scheme, *port)
	if h, err := os.Hostname(); err == nil && h != "" {
		fmt.Printf("  Office (fixed name):   %s://%s:%d\n", scheme, strings.ToLower(h), *port)
	}
	for _, ip := range lanIPs() {
		fmt.Printf("  On the office network: %s://%s:%d\n", scheme, ip, *port)
	}
	if fwStatus != "" {
		fmt.Printf("  Windows Firewall:      %s\n", fwStatus)
	}
	fmt.Printf("  Data folder:           %s\n", dataDir)
	fmt.Printf("  Daily Excel backups:   %s\n", filepath.Join(dataDir, "backups", "excel"))
	fmt.Println("  Keep this window open. Closing it stops ProcureHub for everyone.")
	if freshData {
		fmt.Println("--------------------------------------------------------------")
		fmt.Println("  NOTE: no existing data was found in this folder, so a new empty")
		fmt.Println("  database was started. If you used ProcureHub before, close this")
		fmt.Println("  window and copy the new RGS-ProcureHub.exe into your OLD folder")
		fmt.Println("  (the one that has the ProcureHub-Data folder), replacing the old EXE.")
	}
	fmt.Println("==============================================================")

	go backupLoop()
	go mailInLoop()
	go func() {
		for {
			time.Sleep(10 * time.Minute)
			mu.Lock()
			for tok, s := range st.Sessions {
				if time.Since(time.UnixMilli(s.Seen)) > sessionTTL {
					delete(st.Sessions, tok)
				}
			}
			saveLocked()
			mu.Unlock()
		}
	}()
	if !*noBrowser {
		go func() {
			time.Sleep(700 * time.Millisecond)
			openBrowser(fmt.Sprintf("%s://localhost:%d", scheme, *port))
		}()
	}
	srv := &http.Server{Handler: secure(mux), ReadHeaderTimeout: 15 * time.Second}
	if scheme == "https" {
		err = srv.ServeTLS(ln, *cert, *key)
	} else {
		err = srv.Serve(ln)
	}
	die("server stopped: %v", err)
}
