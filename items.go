package main

// Correcting item names and units.
//
// An administrator may correct the spelling, specification, unit or category
// of an item.
// The correction is applied to every record that carries the item (demands,
// quotations, purchase orders, receipts, challans, site stock, job work and
// consumption), so stock and history stay together. Correcting an item onto
// the name of another existing item merges the two. Units are relabelled, not
// converted.

import (
	"net/http"
	"regexp"
	"strings"
	"time"
)

// same as itemKey() in the web app
func keyOf(desc, spec, unit string) string {
	return normS(desc) + "|" + normS(spec) + "|" + strings.ToLower(unit)
}

type itemName struct{ Desc, Spec, Unit, Cat string }

var catIDRe = regexp.MustCompile(`^[a-z0-9_-]{1,60}$`)

var renameLineCols = []string{"indents", "rfqs", "pos", "grns", "dispatches", "jobwork", "consumption", "mailquotes"}
var renameDocCols = []string{"sitelog", "stocklvl"}

func hItemRename(w http.ResponseWriter, r *http.Request, u *User) {
	var req struct {
		From, To itemName
		Dry      bool
	}
	if !readJSON(w, r, &req, 1<<14) {
		return
	}
	req.To.Desc, req.To.Spec, req.To.Unit = strings.TrimSpace(req.To.Desc), strings.TrimSpace(req.To.Spec), strings.TrimSpace(req.To.Unit)
	if req.To.Desc == "" || req.To.Unit == "" {
		fail(w, 400, "Enter the item name and unit.")
		return
	}
	if req.To.Cat != "" && !catIDRe.MatchString(req.To.Cat) {
		fail(w, 400, "Unknown category.")
		return
	}
	if len(req.To.Desc) > 200 || len(req.To.Spec) > 300 || len(req.To.Unit) > 20 {
		fail(w, 400, "The name is too long.")
		return
	}
	from := keyOf(req.From.Desc, req.From.Spec, req.From.Unit)
	to := keyOf(req.To.Desc, req.To.Spec, req.To.Unit)
	match := func(m map[string]any) bool {
		if m == nil {
			return false
		}
		if k := str(m, "itemKey"); k != "" && k == from {
			return true
		}
		return str(m, "desc") != "" && keyOf(str(m, "desc"), str(m, "spec"), str(m, "unit")) == from
	}
	fix := func(m map[string]any) map[string]any {
		c := shallowCopy(m)
		c["desc"], c["spec"], c["unit"] = req.To.Desc, req.To.Spec, req.To.Unit
		if req.To.Cat != "" { // demand lines keep it as "category", the others as "cat"
			if _, has := c["category"]; has {
				c["category"] = req.To.Cat
				c["catSrc"] = "manual"
			}
			if _, has := c["cat"]; has || c["category"] == nil {
				c["cat"] = req.To.Cat
			}
		}
		if _, has := c["itemKey"]; has {
			c["itemKey"] = to
		}
		return c
	}
	mu.Lock()
	defer mu.Unlock()
	type change struct {
		col, id string
		data    map[string]any
	}
	var changes []change
	lines := 0
	for _, col := range renameLineCols {
		for id, d := range st.Cols[col] {
			if d == nil || d.Deleted || d.Data == nil {
				continue
			}
			ls := anyList(d.Data["lines"])
			var nl []any
			hit := 0
			for i, li := range ls {
				m, ok := li.(map[string]any)
				if ok && match(m) {
					if nl == nil {
						nl = append([]any(nil), ls...)
					}
					nl[i] = fix(m)
					hit++
				}
			}
			if hit > 0 {
				nd := shallowCopy(d.Data)
				nd["lines"] = nl
				changes = append(changes, change{col, id, nd})
				lines += hit
			}
		}
	}
	for _, col := range renameDocCols {
		for id, d := range st.Cols[col] {
			if d == nil || d.Deleted || !match(d.Data) {
				continue
			}
			nd := fix(d.Data)
			if col == "stocklvl" {
				nd["itemKey"] = to
			}
			changes = append(changes, change{col, id, nd})
			lines++
		}
	}
	if req.Dry {
		writeJSON(w, 200, map[string]any{"ok": true, "docs": len(changes), "lines": lines, "merge": from != to && keyInUse(to)})
		return
	}
	if from == to && req.From.Desc == req.To.Desc && req.From.Spec == req.To.Spec && req.From.Unit == req.To.Unit && req.To.Cat == "" {
		writeJSON(w, 200, map[string]any{"ok": true, "docs": 0, "lines": 0})
		return
	}
	for _, c := range changes {
		st.Rev++
		st.Cols[c.col][c.id] = &Doc{Rev: st.Rev, Data: c.data}
	}
	st.Audit = append(st.Audit, AuditEntry{At: time.Now().UnixMilli(), User: u.Username, Name: u.Name, Col: "items", ID: "", Op: "update", Ref: clip(req.From.Desc+" "+req.From.Spec+" ("+req.From.Unit+")", 120),
		Keys: clip("corrected to "+req.To.Desc+" "+req.To.Spec+" ("+req.To.Unit+")"+map[bool]string{true: " · category " + req.To.Cat}[req.To.Cat != ""], 200)})
	if err := saveLocked(); err != nil {
		fail(w, 500, "The server could not save to disk: "+err.Error())
		return
	}
	notifyLocked()
	writeJSON(w, 200, map[string]any{"ok": true, "docs": len(changes), "lines": lines})
}

// keyInUse: is there already stock or history under this item? (caller holds mu)
func keyInUse(k string) bool {
	for _, col := range append(append([]string{}, renameLineCols...), renameDocCols...) {
		for _, d := range st.Cols[col] {
			if d == nil || d.Deleted || d.Data == nil {
				continue
			}
			if str(d.Data, "itemKey") == k || (str(d.Data, "desc") != "" && keyOf(str(d.Data, "desc"), str(d.Data, "spec"), str(d.Data, "unit")) == k) {
				return true
			}
			for _, li := range anyList(d.Data["lines"]) {
				if m, ok := li.(map[string]any); ok && (str(m, "itemKey") == k || (str(m, "desc") != "" && keyOf(str(m, "desc"), str(m, "spec"), str(m, "unit")) == k)) {
					return true
				}
			}
		}
	}
	return false
}
