package main

// Add a vendor or an item from inside a cash purchase.
//
// While entering a cash bill, the shop may not be in Vendors yet, or an item
// may not be in the Item catalogue. Anyone who may make cash purchases (HQ
// right "cash_spend", a site login marked "May make cash purchases") or who
// keeps vendors / items can add it right there, without leaving the bill.
// Only new entries are made here: an existing vendor (same GSTIN or same name)
// or item (same name) is returned as it is and never changed. Entries made
// this way are marked addedVia "cash" so HQ can complete them later.

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"
)

var (
	quickItemIDRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,119}$`)
	quickGSTINRe  = regexp.MustCompile(`^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]{3}$`)
	quickSpaceRe  = regexp.MustCompile(`[^a-z0-9]+`)
)

func quickNorm(s string) string {
	return strings.TrimSpace(quickSpaceRe.ReplaceAllString(strings.ToLower(s), " "))
}

func cashQuickAllowed(u *User, kind string) bool {
	if isAdmin(u) {
		return true
	}
	if u.Role == "site" {
		return u.CashSpend
	}
	if can(u, "cash_spend") {
		return true
	}
	if kind == "vendor" {
		return can(u, "masters_vendors")
	}
	return canAny(u, "masters_items", "demands_approve")
}

func hCashQuick(w http.ResponseWriter, r *http.Request, u *User) {
	var req struct {
		Kind                                       string
		Name, GSTIN, Phone, Contact, City, Address string
		ID, Desc, Spec, Unit, Category, HSN        string
		GST                                        *float64
		Sizes                                      []string
		Attrs                                      []struct {
			Name     string
			Opts     []string
			Req      bool
			ShowName bool
		}
		Rel json.RawMessage
	}
	if !readJSON(w, r, &req, 1<<19) {
		return
	}
	if req.Kind != "vendor" && req.Kind != "item" {
		fail(w, 400, "Unknown request.")
		return
	}
	if !cashQuickAllowed(u, req.Kind) {
		if req.Kind == "vendor" {
			fail(w, 403, "You don't have permission to add vendors. Ask your administrator.")
		} else {
			fail(w, 403, "You don't have permission to add items. Ask your administrator.")
		}
		return
	}
	now := time.Now().UnixMilli()
	mu.Lock()
	defer mu.Unlock()

	if req.Kind == "vendor" {
		name := clip(strings.Join(strings.Fields(req.Name), " "), 120)
		if name == "" {
			fail(w, 400, "Enter the vendor name.")
			return
		}
		g := strings.ToUpper(strings.TrimSpace(req.GSTIN))
		if g != "" && !quickGSTINRe.MatchString(g) {
			fail(w, 400, "The GSTIN should be 15 characters, like 01ABCDE1234F1Z5.")
			return
		}
		// already in Vendors? use that one
		for id, d := range st.Cols["vendors"] {
			if d == nil || d.Deleted || d.Data == nil {
				continue
			}
			vg := strings.ToUpper(strings.TrimSpace(str(d.Data, "gstin")))
			if (g != "" && vg == g) || quickNorm(str(d.Data, "name")) == quickNorm(name) {
				writeJSON(w, 200, map[string]any{"ok": true, "existing": true, "id": id, "name": str(d.Data, "name"), "gstin": str(d.Data, "gstin")})
				return
			}
		}
		id := newDocID()
		doc := map[string]any{"name": name, "gstin": g, "contact": clip(strings.TrimSpace(req.Contact), 80), "phone": clip(strings.TrimSpace(req.Phone), 40),
			"email": "", "city": clip(strings.TrimSpace(req.City), 60), "address": clip(strings.TrimSpace(req.Address), 400), "payment": "", "rating": "",
			"categories": []any{}, "at": now, "addedVia": "cash", "addedBy": u.Name}
		putDocLocked("vendors", id, doc)
		st.Audit = append(st.Audit, AuditEntry{At: now, User: u.Username, Name: u.Name, Col: "vendors", ID: id, Op: "set", Ref: name, Keys: "added from a cash purchase"})
		if err := saveLocked(); err != nil {
			fail(w, 500, "The server could not save to disk: "+err.Error())
			return
		}
		notifyLocked()
		writeJSON(w, 200, map[string]any{"ok": true, "id": id, "name": name, "gstin": g})
		return
	}

	// item
	desc := clip(strings.Join(strings.Fields(req.Desc), " "), 120)
	if desc == "" {
		fail(w, 400, "Enter the item name.")
		return
	}
	if !quickItemIDRe.MatchString(req.ID) {
		fail(w, 400, "Unknown item.")
		return
	}
	if req.GST != nil && (*req.GST < 0 || *req.GST > 100) {
		fail(w, 400, "GST % must be between 0 and 100.")
		return
	}
	for id, d := range st.Cols["catalog"] {
		if d == nil || d.Deleted || d.Data == nil || str(d.Data, "desc") == "" {
			continue
		}
		if id == req.ID || quickNorm(str(d.Data, "desc")) == quickNorm(desc) {
			writeJSON(w, 200, map[string]any{"ok": true, "existing": true, "id": id, "desc": str(d.Data, "desc")})
			return
		}
	}
	unit := clip(strings.TrimSpace(req.Unit), 20)
	if unit == "" {
		unit = "Nos"
	}
	cat := clip(strings.TrimSpace(req.Category), 60)
	if cat == "" {
		cat = "others"
	}
	doc := map[string]any{"desc": desc, "spec": clip(strings.TrimSpace(req.Spec), 300), "unit": unit, "category": cat, "photo": "", "sizes": []any{},
		"hidden": false, "hsn": clip(strings.TrimSpace(req.HSN), 12), "gst": "", "attrs": []any{}, "at": now, "addedVia": "cash", "addedBy": u.Name}
	if req.GST != nil {
		doc["gst"] = *req.GST
	}
	// sizes and varieties (drop-downs), as in Item catalogue
	sizes, seen := []any{}, map[string]bool{}
	for _, z := range req.Sizes {
		z = clip(strings.TrimSpace(z), 60)
		if z != "" && !seen[strings.ToLower(z)] && len(sizes) < 400 {
			seen[strings.ToLower(z)] = true
			sizes = append(sizes, z)
		}
	}
	doc["sizes"] = sizes
	attrs := []any{}
	for _, a := range req.Attrs {
		name := clip(strings.TrimSpace(a.Name), 40)
		opts := []any{}
		for _, o := range a.Opts {
			if o = clip(strings.TrimSpace(o), 80); o != "" && len(opts) < 300 {
				opts = append(opts, o)
			}
		}
		if name == "" || len(attrs) >= 12 {
			continue
		}
		attrs = append(attrs, map[string]any{"name": name, "opts": opts, "req": a.Req, "showName": a.ShowName})
	}
	doc["attrs"] = attrs
	if len(req.Rel) > 0 && string(req.Rel) != "null" && len(req.Rel) < 400000 {
		var rel map[string]any
		if json.Unmarshal(req.Rel, &rel) == nil {
			if _, ok := rel["map"].(map[string]any); ok && str(rel, "by") != "" {
				doc["rel"] = rel
			}
		}
	}
	putDocLocked("catalog", req.ID, doc)
	st.Audit = append(st.Audit, AuditEntry{At: now, User: u.Username, Name: u.Name, Col: "catalog", ID: req.ID, Op: "set", Ref: desc, Keys: "added from a cash purchase"})
	if err := saveLocked(); err != nil {
		fail(w, 500, "The server could not save to disk: "+err.Error())
		return
	}
	notifyLocked()
	writeJSON(w, 200, map[string]any{"ok": true, "id": req.ID, "desc": desc})
}
