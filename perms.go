package main

// HQ roles and permissions. Users created before this version have no Access
// record and keep full administrator rights, so upgrading changes nothing
// until an administrator assigns roles.

import (
	"errors"
	"net/http"
	"sort"
	"strings"
	"time"
)

type Access struct {
	Admin    bool     `json:"admin"`
	Role     string   `json:"role,omitempty"` // preset name shown in the UI
	Perms    []string `json:"perms"`
	Projects []string `json:"projects"` // empty = all sites
}

var permLabels = map[string]string{
	"demands_view":     "see site demands",
	"demands_approve":  "approve or reject demands",
	"demands_precheck": "pre-check demands",
	"raise_demand":     "raise demands for sites",
	"rfq_create":       "call for quotations",
	"quotes_enter":     "upload or enter quotations",
	"compare_approve":  "approve comparative statements",
	"po_issue":         "issue purchase orders",
	"rates_view":       "see rates and values",
	"store":            "work in the central store and dispatch",
	"sitestock_view":   "see site stock",
	"sitestock_edit":   "change site stock",
	"masters_projects": "add or edit projects",
	"masters_vendors":  "add or edit vendors",
	"masters_items":    "edit the item catalogue",
	"reports":          "see reports and download data",
	"settings":         "change company, email and backup settings",
	"po_approve":       "approve purchase orders and site transfer indents",
	"consume_auth":     "authenticate site consumption reports",
	"cash_spend":       "make cash (counter) purchases",
	"cash_approve":     "approve cash purchases and their consumption",
}

func isAdmin(u *User) bool { return u != nil && u.Role == "hq" && (u.Access == nil || u.Access.Admin) }

func can(u *User, p string) bool {
	if u == nil || u.Role != "hq" {
		return false
	}
	if isAdmin(u) {
		// Pre-check is a separate duty: administrators approve, pre-checkers pre-check.
		// separate duties: administrators do not pre-check demands, approve
		// purchase orders or authenticate site consumption themselves
		return p != "demands_precheck" && p != "po_approve" && p != "consume_auth"
	}
	for _, x := range u.Access.Perms {
		if x == p {
			return true
		}
	}
	if p == "rates_view" { // people who handle quotes or orders must see prices
		return canAny(u, "quotes_enter", "compare_approve", "po_issue", "po_approve", "reports")
	}
	return false
}

func canAny(u *User, ps ...string) bool {
	for _, p := range ps {
		if can(u, p) {
			return true
		}
	}
	return false
}

// inScope: may this HQ user see/handle data of project pid?
func inScope(u *User, pid string) bool {
	if u.Role != "hq" {
		return pid == u.ProjectID
	}
	if isAdmin(u) || len(u.Access.Projects) == 0 || pid == "" {
		return true
	}
	for _, p := range u.Access.Projects {
		if p == pid {
			return true
		}
	}
	return false
}

func errNoPerm(p string) error {
	l := permLabels[p]
	if l == "" {
		l = "do this"
	}
	return errors.New("You don't have permission to " + l + ". Ask your administrator.")
}

func need(u *User, ps ...string) error {
	if canAny(u, ps...) {
		return nil
	}
	return errNoPerm(ps[0])
}

func permOnly(h handler, ps ...string) http.HandlerFunc {
	return authed(func(w http.ResponseWriter, r *http.Request, u *User) {
		if err := need(u, ps...); err != nil {
			fail(w, 403, err.Error())
			return
		}
		h(w, r, u)
	})
}

func adminOnly(h handler) http.HandlerFunc {
	return authed(func(w http.ResponseWriter, r *http.Request, u *User) {
		if !isAdmin(u) {
			fail(w, 403, "Only administrators can do this.")
			return
		}
		h(w, r, u)
	})
}

// hqCheck decides whether a non-administrator HQ user may make this write.
func hqCheck(u *User, op, col string, ex, patch, merged map[string]any) error {
	if isAdmin(u) {
		return nil
	}
	src := merged
	if src == nil {
		src = ex
	}
	switch col {
	case "indents", "sitelog", "stocklvl", "consumption":
		if !inScope(u, str(src, "projectId")) || (ex != nil && !inScope(u, str(ex, "projectId"))) {
			return errors.New("This project is not one of the sites assigned to you.")
		}
	case "vreturns", "cashbuys":
		if p := str(src, "projectId"); p != "" && !inScope(u, p) {
			return errors.New("This project is not one of the sites assigned to you.")
		}
	case "dispatches":
		if !inScope(u, str(src, "projectId")) && !inScope(u, str(src, "fromProjectId")) {
			return errors.New("This project is not one of the sites assigned to you.")
		}
	}
	keys := func() []string {
		ks := make([]string, 0, len(patch))
		for k := range patch {
			ks = append(ks, k)
		}
		return ks
	}
	switch col {
	case "projects":
		return need(u, "masters_projects")
	case "vendors":
		return need(u, "masters_vendors")
	case "catalog":
		return need(u, "masters_items", "demands_approve")
	case "config":
		// the list of item categories may also be kept by people who look after the catalogue
		if op == "update" && len(patch) > 0 {
			only := true
			for k := range patch {
				if k != "cats" {
					only = false
				}
			}
			if only {
				return need(u, "masters_items", "settings")
			}
		}
		return need(u, "settings")
	case "sitelog", "stocklvl":
		return need(u, "sitestock_edit")
	case "cashbuys": // the steps are checked in cashGuard
		if op == "delete" {
			return errors.New("Only administrators can delete cash purchases.")
		}
		return nil
	case "vreturns":
		if op == "delete" {
			return errors.New("Only administrators can delete returns. Cancel it instead.")
		}
		if ex != nil {
			for k := range patch {
				if k != "status" && k != "cancelNote" {
					return errors.New("A return note cannot be changed. Cancel it and make a new one.")
				}
			}
			return need(u, "store")
		}
		return need(u, "store", "sitestock_edit", "po_issue")
	case "consumption":
		if op == "delete" {
			return errors.New("Only administrators can delete consumption reports.")
		}
		if _, ok := patch["status"]; ok && ex != nil {
			return need(u, "consume_auth")
		}
		return need(u, "sitestock_edit")
	case "mailquotes":
		// created by the mail reader; people only accept or set aside
		if op != "update" {
			return errors.New("Quotations from email are created by the mail reader.")
		}
		for k := range patch {
			if k != "status" && k != "decidedAt" && k != "decidedBy" && k != "decidedByName" {
				return errors.New("Only the status of a quotation from email can be changed.")
			}
		}
		return need(u, "quotes_enter")
	case "jobwork":
		// material with vendors for job work
		if op == "delete" {
			return errors.New("Only administrators can delete job-work entries.")
		}
		return need(u, "store", "po_issue")
	case "grns":
		if op == "delete" {
			return errors.New("Only administrators can delete goods receipts.")
		}
		return need(u, "store")
	case "dispatches":
		if op == "delete" {
			return errors.New("Only administrators can delete dispatches.")
		}
		if op == "update" && len(patch) == 1 && patch["approval"] != nil {
			return need(u, "po_approve", "store", "po_issue")
		}
		return need(u, "store", "po_issue")
	case "indents":
		switch {
		case op == "delete":
			return errors.New("Only administrators can delete demands.")
		case op == "set" && ex == nil:
			return need(u, "raise_demand")
		default:
			return need(u, "demands_approve", "demands_precheck", "rfq_create", "po_issue", "store", "raise_demand")
		}
	case "pos":
		if op == "delete" {
			return errors.New("Only administrators can delete purchase orders.")
		}
		if op == "update" {
			only := true
			for _, k := range keys() {
				if k != "received" {
					only = false
				}
			}
			if only {
				return need(u, "store", "po_issue")
			}
			if len(patch) == 1 && patch["approval"] != nil {
				return need(u, "po_approve", "po_issue")
			}
		}
		return need(u, "po_issue")
	case "rfqs":
		if op == "delete" {
			return errors.New("Only administrators can delete RFQs.")
		}
		if op == "set" && ex == nil {
			return need(u, "rfq_create")
		}
		for _, k := range keys() {
			var err error
			switch k {
			case "quotes":
				err = need(u, "quotes_enter")
			case "award", "approvedAt", "approvedBy", "approvalNote":
				err = need(u, "compare_approve")
			case "poIds", "orderedAt":
				err = need(u, "po_issue")
			case "status":
				switch s, _ := patch[k].(string); s {
				case "approved":
					err = need(u, "compare_approve")
				case "ordered":
					err = need(u, "po_issue")
				case "sent":
					err = need(u, "rfq_create", "quotes_enter", "compare_approve")
				default:
					err = need(u, "rfq_create")
				}
			default:
				err = need(u, "rfq_create")
			}
			if err != nil {
				return err
			}
		}
		return nil
	}
	return errors.New("Only administrators can change this record.")
}

// sanitizeFor hides prices from HQ users who may not see rates.
func sanitizeFor(u *User, col string, data map[string]any) map[string]any {
	if data == nil || can(u, "rates_view") {
		return data
	}
	if col == "sitelog" {
		if _, has := data["value"]; !has {
			if _, has2 := data["orate"]; !has2 {
				return data
			}
		}
		out := shallowCopy(data)
		delete(out, "value")
		delete(out, "orate")
		out["ratesHidden"] = true
		return out
	}
	if col == "mailquotes" {
		out := shallowCopy(data)
		delete(out, "quote")
		out["ratesHidden"] = true
		return out
	}
	if col == "jobwork" {
		out := shallowCopy(data)
		var ls []any
		for _, l := range subList(data, "lines") {
			c := shallowCopy(l)
			delete(c, "rate")
			ls = append(ls, c)
		}
		if ls != nil {
			out["lines"] = ls
		}
		delete(out, "amount")
		out["ratesHidden"] = true
		return out
	}
	if col == "vreturns" {
		out := shallowCopy(data)
		var ls []any
		for _, l := range subList(data, "lines") {
			c := shallowCopy(l)
			delete(c, "rate")
			delete(c, "gst")
			ls = append(ls, c)
		}
		if ls != nil {
			out["lines"] = ls
		}
		out["ratesHidden"] = true
		return out
	}
	if col == "dispatches" || col == "grns" {
		if _, has := data["totals"]; !has && col == "dispatches" {
			return data
		}
		out := shallowCopy(data)
		var ls []any
		for _, l := range subList(data, "lines") {
			c := shallowCopy(l)
			for _, k := range []string{"rate", "taxable", "tax", "orate", "value"} {
				delete(c, k)
			}
			ls = append(ls, c)
		}
		if ls != nil {
			out["lines"] = ls
		}
		delete(out, "totals")
		out["ratesHidden"] = true
		return out
	}
	if u.Role != "hq" {
		return data
	}
	switch col {
	case "rfqs":
		out := shallowCopy(data)
		if q, ok := out["quotes"].(map[string]any); ok {
			hidden := map[string]any{}
			for vid, v := range q {
				m, _ := v.(map[string]any)
				hidden[vid] = map[string]any{"at": m["at"], "hidden": true}
			}
			out["quotes"] = hidden
		}
		delete(out, "award")
		return out
	case "pos":
		out := shallowCopy(data)
		var ls []any
		for _, l := range subList(data, "lines") {
			c := shallowCopy(l)
			delete(c, "rate")
			delete(c, "gst")
			ls = append(ls, c)
		}
		out["lines"] = ls
		delete(out, "freight")
		out["ratesHidden"] = true
		return out
	}
	return data
}

/* ------------------------------ activity log ------------------------------ */

type AuditEntry struct {
	At   int64  `json:"at"`
	User string `json:"user"`
	Name string `json:"name"`
	Col  string `json:"col"`
	ID   string `json:"id"`
	Op   string `json:"op"`
	Ref  string `json:"ref"`
	Keys string `json:"keys"`
}

// auditLocked records who changed what. Caller holds mu.
func auditLocked(u *User, op, col, id string, data, patch map[string]any) {
	ref := firstNonEmpty(str(data, "no"), str(data, "name"), str(data, "desc"), str(data, "code"))
	var ks []string
	for k := range patch {
		if k != "at" {
			ks = append(ks, k)
		}
	}
	sort.Strings(ks)
	if len(ks) > 6 {
		ks = append(ks[:6], "…")
	}
	st.Audit = append(st.Audit, AuditEntry{At: time.Now().UnixMilli(), User: u.Username, Name: u.Name, Col: col, ID: id, Op: op, Ref: ref, Keys: strings.Join(ks, ", ")})
	if n := len(st.Audit); n > 4000 {
		st.Audit = append([]AuditEntry(nil), st.Audit[n-3000:]...)
	}
}

func hAudit(w http.ResponseWriter, r *http.Request, u *User) {
	mu.Lock()
	n := len(st.Audit)
	start := n - 600
	if start < 0 {
		start = 0
	}
	out := make([]AuditEntry, 0, n-start)
	for i := n - 1; i >= start; i-- {
		out = append(out, st.Audit[i])
	}
	mu.Unlock()
	writeJSON(w, 200, map[string]any{"entries": out})
}

// stampDecisions records who approved, held or rejected each demand line and
// who wrote each HQ remark, so the site sees a trustworthy name and time.
func stampDecisions(u *User, ex, nd map[string]any) {
	now := time.Now().UnixMilli()
	old := map[string]map[string]any{}
	for _, l := range subList(ex, "lines") {
		old[str(l, "id")] = l
	}
	lines, _ := nd["lines"].([]any)
	for _, li := range lines {
		l, ok := li.(map[string]any)
		if !ok {
			continue
		}
		o := old[str(l, "id")]
		// item changed by HQ after pre-check (e.g. Cement OPC to PPC while approving):
		// keep what the site asked for and who changed it. Pre-check keeps its own record.
		if o != nil && pcStatus(ex) != "pending" {
			if str(o, "desc") != str(l, "desc") || str(o, "spec") != str(l, "spec") || str(o, "unit") != str(l, "unit") {
				if po, _ := o["apprOrig"].(map[string]any); po != nil {
					l["apprOrig"] = po
				} else {
					l["apprOrig"] = map[string]any{"desc": o["desc"], "spec": o["spec"], "unit": o["unit"], "qty": o["qty"], "category": o["category"]}
				}
				l["chgBy"], l["chgByName"], l["chgAt"] = u.ID, u.Name, now
				if op, _ := l["apprOrig"].(map[string]any); op != nil && str(op, "desc") == str(l, "desc") && str(op, "spec") == str(l, "spec") && str(op, "unit") == str(l, "unit") {
					for _, k := range []string{"apprOrig", "chgBy", "chgByName", "chgAt", "chgNote"} { // changed back to what the site asked
						delete(l, k)
					}
				}
			} else {
				for _, k := range []string{"apprOrig", "chgBy", "chgByName", "chgAt"} { // only the server sets these
					if v, has := o[k]; has {
						l[k] = v
					} else {
						delete(l, k)
					}
				}
			}
		}
		st := str(l, "status")
		if st == "" || st == "pending" {
			for _, k := range []string{"decidedBy", "decidedByName", "decidedAt"} {
				delete(l, k)
			}
			continue
		}
		if o == nil || str(o, "status") != st || str(o, "approvalNote") != str(l, "approvalNote") {
			l["decidedBy"], l["decidedByName"], l["decidedAt"] = u.ID, u.Name, now
		}
	}
	nr, _ := nd["hqRemarks"].([]any)
	or, _ := ex["hqRemarks"].([]any)
	for i := len(or); i < len(nr); i++ {
		if m, ok := nr[i].(map[string]any); ok {
			m["by"], m["name"], m["at"] = u.ID, u.Name, now
		}
	}
	if len(nr) < len(or) { // remarks can not be removed
		nd["hqRemarks"] = or
	}
}
