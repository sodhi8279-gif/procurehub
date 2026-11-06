package main

// Stores at a site, the storekeeper, the project manager, issue heads and gate passes (6.6).
//
// A site may have more than one store. Stock that existed before stores were
// introduced belongs to the "Main store" (id "main"), so old data needs no change.
//
// Site logins have a site role:
//   - "pm"    project manager: raises demands, keeps the stores and issue heads,
//     approves gate passes and stock entered by the storekeeper, authenticates
//     consumption (he is the site head);
//   - "store" storekeeper: receives material and prepares gate passes for his
//     stores; cannot raise demands, and nothing he issues or enters counts until
//     the project manager approves it;
//   - ""      site user as before 6.6 (all site tasks).
//
// A gate pass (collection "siteissues") takes material out of a store to an
// issue head of the site (contractor, works contractor, company works,
// miscellaneous consumption), to another site, back to the company warehouse
// (HQ store) or back to a vendor. It is prepared by the storekeeper and gets
// its number only when the project manager approves it. Approving it to
// another site creates the transfer that the other site receives; to the HQ
// store, the returns into the HQ store; to a vendor, the return note.
// A site manager at HQ (right site_approve) may approve for the sites assigned
// to him.

import (
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"
)

const mainStore = "main"

var headTypes = map[string]string{"contractor": "Contractor", "works": "Works contractor", "company": "Company works (departmental)", "misc": "Misc. consumption"}

var issueDests = map[string]bool{"head": true, "site": true, "hq": true, "vendor": true, "repair": true}

var dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func sitePM(u *User) bool    { return u != nil && u.Role == "site" && (u.SiteRole == "pm" || u.SiteHead) }
func siteStore(u *User) bool { return u != nil && u.Role == "site" && u.SiteRole == "store" }

func storeOf(m map[string]any, k string) string {
	if s := str(m, k); s != "" {
		return s
	}
	return mainStore
}

// may this person approve gate passes and stock entries of project pid?
func siteApprover(u *User, pid string) bool {
	if u.Role == "site" {
		return sitePM(u) && u.ProjectID == pid
	}
	return can(u, "site_approve") && inScope(u, pid)
}

// is there an active storekeeper login at this project? (caller holds mu)
func hasStorekeeper(pid string) bool {
	for _, x := range st.Users {
		if x.Active && x.Role == "site" && x.SiteRole == "store" && x.ProjectID == pid {
			return true
		}
	}
	return false
}

func projectDoc(pid string) map[string]any {
	if c := st.Cols["projects"]; c != nil {
		if d := c[pid]; d != nil && !d.Deleted {
			return d.Data
		}
	}
	return nil
}

func listItem(list any, id string) map[string]any {
	for _, x := range anyList(list) {
		if m, ok := x.(map[string]any); ok && str(m, "id") == id {
			return m
		}
	}
	return nil
}

// does the store exist (and is it in use) at this project?
func storeExists(pid, sid string) bool {
	if sid == mainStore {
		return true
	}
	s := listItem(projectDoc(pid)["stores"], sid)
	return s != nil && s["active"] != false
}

// the storekeeper works only in the stores given to him (none listed = all stores of his site)
func storeAllowed(u *User, sid string) bool {
	if !siteStore(u) || len(u.Stores) == 0 {
		return true
	}
	for _, s := range u.Stores {
		if s == sid {
			return true
		}
	}
	return false
}

func checkStore(u *User, pid, sid string) error {
	if !storeExists(pid, sid) {
		return errors.New("Choose the store.")
	}
	if !storeAllowed(u, sid) {
		return errors.New("This store is not one of the stores given to you.")
	}
	return nil
}

func nextNo(prefix string) string {
	fy := finYear(time.Now())
	key := prefix + "-" + fy
	st.Counters[key]++
	return fmt.Sprintf("%s/%s/%04d", prefix, fy, st.Counters[key])
}

func putDoc(col, id string, data map[string]any) {
	if st.Cols[col] == nil {
		st.Cols[col] = map[string]*Doc{}
	}
	st.Rev++
	st.Cols[col][id] = &Doc{Rev: st.Rev, Data: data}
}

// rateOf: latest PO rate incl. GST for an item, else the value entered with existing stock (caller holds mu)
func rateOf(k string) float64 {
	best, at := 0.0, int64(-1)
	for _, d := range st.Cols["pos"] {
		if d == nil || d.Deleted || d.Data == nil || str(d.Data, "status") == "cancelled" {
			continue
		}
		pat := int64(fnum(d.Data["at"]))
		for _, l := range subList(d.Data, "lines") {
			lk := str(l, "itemKey")
			if lk == "" {
				lk = keyOf(str(l, "desc"), str(l, "spec"), str(l, "unit"))
			}
			if lk == k && pat >= at {
				best, at = fnum(l["rate"])*(1+fnum(l["gst"])/100), pat
			}
		}
	}
	if at >= 0 {
		return best
	}
	oat := int64(-1)
	try := func(m map[string]any, t int64) {
		lk := str(m, "itemKey")
		if lk == "" {
			lk = keyOf(str(m, "desc"), str(m, "spec"), str(m, "unit"))
		}
		if lk == k && fnum(m["orate"]) > 0 && t >= oat {
			best, oat = fnum(m["orate"]), t
		}
	}
	for _, d := range st.Cols["grns"] {
		if d != nil && !d.Deleted && d.Data != nil && str(d.Data, "type") == "opening" {
			for _, l := range subList(d.Data, "lines") {
				try(l, int64(fnum(d.Data["at"])))
			}
		}
	}
	for _, d := range st.Cols["sitelog"] {
		if d != nil && !d.Deleted && d.Data != nil && str(d.Data, "type") == "opening" && str(d.Data, "status") != "pending" && str(d.Data, "status") != "rejected" {
			try(d.Data, int64(fnum(d.Data["at"])))
		}
	}
	return best
}

func cleanFreight(v any) map[string]any {
	m, _ := v.(map[string]any)
	if m == nil {
		return nil
	}
	amt := fnum(m["amt"])
	if amt < 0 {
		amt = 0
	}
	by := str(m, "by")
	switch by {
	case "us", "vendor", "inbill", "receiver", "sender":
	default:
		by = ""
	}
	out := map[string]any{"amt": amt, "by": by, "transporter": clip(strings.TrimSpace(str(m, "transporter")), 120), "lr": clip(strings.TrimSpace(str(m, "lr")), 60), "note": clip(strings.TrimSpace(str(m, "note")), 300)}
	if amt == 0 && by == "" && out["transporter"] == "" && out["lr"] == "" && out["note"] == "" {
		return nil
	}
	return out
}

/* ---------------- stores and issue heads kept on the project ---------------- */

// checkProjectLists validates the stores and heads a project manager (or HQ) saves.
// Entries are never removed, only switched off, so history keeps its names.
func checkProjectLists(ex, patch, nd map[string]any) error {
	for _, k := range []string{"stores", "heads"} {
		if _, has := patch[k]; !has {
			continue
		}
		var out []any
		seen := map[string]bool{}
		for _, x := range anyList(nd[k]) {
			m, ok := x.(map[string]any)
			if !ok {
				return errors.New("Invalid list.")
			}
			id, name := str(m, "id"), strings.TrimSpace(str(m, "name"))
			if !idRe.MatchString(id) || seen[id] {
				return errors.New("Invalid list.")
			}
			seen[id] = true
			if name == "" {
				return errors.New("Enter the name.")
			}
			c := map[string]any{"id": id, "name": clip(name, 100), "active": m["active"] != false}
			for _, f := range []string{"place", "contact", "phone", "gstin", "note", "work"} {
				if v := strings.TrimSpace(str(m, f)); v != "" {
					c[f] = clip(v, 300)
				}
			}
			if k == "heads" {
				if headTypes[str(m, "type")] == "" {
					return errors.New("Choose the type of head.")
				}
				c["type"] = str(m, "type")
			}
			if v, ok := m["at"].(float64); ok {
				c["at"] = v
			}
			out = append(out, c)
		}
		for _, x := range anyList(ex[k]) {
			if m, ok := x.(map[string]any); ok && !seen[str(m, "id")] {
				return errors.New("A store or head that is already saved cannot be removed. Switch it off instead.")
			}
		}
		if out == nil {
			out = []any{}
		}
		nd[k] = out
	}
	return nil
}

// sitePMProject: the project manager may keep the stores and heads of his project, nothing else
func sitePMProject(u *User, op string, ex, patch, merged map[string]any, id string) (map[string]any, error) {
	if op != "update" || ex == nil || id != u.ProjectID || !sitePM(u) {
		return nil, errors.New("Only the project manager can add stores and issue heads.")
	}
	for k := range patch {
		if k != "stores" && k != "heads" {
			return nil, errDeny
		}
	}
	if err := checkProjectLists(ex, patch, merged); err != nil {
		return nil, err
	}
	return merged, nil
}

/* ---------------- gate passes ---------------- */

func issueCheckNew(u *User, nd map[string]any) error {
	if str(nd, "kind") == "return" {
		return returnCheckNew(u, nd)
	}
	delete(nd, "kind")
	delete(nd, "againstId")
	pid := str(nd, "projectId")
	if projectDoc(pid) == nil {
		return errors.New("Choose the project.")
	}
	if u.Role == "site" && pid != u.ProjectID {
		return errors.New("You can only issue material from your own site.")
	}
	sid := storeOf(nd, "storeId")
	nd["storeId"] = sid
	if err := checkStore(u, pid, sid); err != nil {
		return err
	}
	dest := str(nd, "dest")
	if !issueDests[dest] {
		return errors.New("Choose where the material goes.")
	}
	for _, k := range []string{"headId", "headName", "headType", "toProjectId", "toStoreId", "toProjectName", "vendorName", "reason"} {
		if dest == "head" && strings.HasPrefix(k, "head") || dest == "site" && strings.HasPrefix(k, "to") || dest == "vendor" && (k == "vendorName" || k == "reason") || dest == "repair" && k == "vendorName" {
			continue
		}
		delete(nd, k)
	}
	switch dest {
	case "head":
		h := listItem(projectDoc(pid)["heads"], str(nd, "headId"))
		if h == nil || h["active"] == false {
			return errors.New("Choose the contractor or head the material is issued to.")
		}
		nd["headName"], nd["headType"] = str(h, "name"), str(h, "type")
	case "site":
		to := str(nd, "toProjectId")
		if to == "" || to == pid || projectDoc(to) == nil {
			return errors.New("Choose the site the material goes to.")
		}
		if ts := str(nd, "toStoreId"); ts != "" && !storeExists(to, ts) {
			return errors.New("Choose the receiving store.")
		}
		nd["toProjectName"] = str(projectDoc(to), "name") // shown to people who cannot see that site
	case "vendor":
		if strings.TrimSpace(str(nd, "vendorName")) == "" {
			return errors.New("Enter the vendor the material goes back to.")
		}
	case "repair":
		if strings.TrimSpace(str(nd, "vendorName")) == "" {
			return errors.New("Enter where it goes: repairer, testing lab or the party it is lent to.")
		}
	}
	// returnable gate pass: tools, shuttering, pumps, testing equipment that must come back
	if (dest == "head" && nd["returnable"] == true) || dest == "repair" {
		due := str(nd, "dueDate")
		if !dateRe.MatchString(due) || due < time.Now().Format("2006-01-02") {
			return errors.New("Give the date by which the material must come back.")
		}
		nd["returnable"] = true
	} else {
		delete(nd, "returnable")
		delete(nd, "dueDate")
	}
	rem := strings.TrimSpace(str(nd, "remarks"))
	if rem == "" {
		return errors.New("Write the remarks / narration for this issue.")
	}
	nd["remarks"] = clip(rem, 2000)
	ls := anyList(nd["lines"])
	if len(ls) == 0 {
		return errors.New("Add the material to issue.")
	}
	var out []any
	for _, li := range ls {
		m, ok := li.(map[string]any)
		if !ok || strings.TrimSpace(str(m, "desc")) == "" {
			return errors.New("Invalid item line.")
		}
		if q, _ := m["qty"].(float64); !(q > 0) {
			return errors.New("Enter the quantity of " + str(m, "desc") + ".")
		}
		c := map[string]any{}
		for _, k := range []string{"desc", "spec", "unit", "cat", "qty", "itemKey", "note"} {
			if v, has := m[k]; has {
				c[k] = v
			}
		}
		if str(c, "itemKey") == "" {
			c["itemKey"] = keyOf(str(c, "desc"), str(c, "spec"), str(c, "unit"))
		}
		out = append(out, c)
	}
	nd["lines"] = out
	if f := cleanFreight(nd["freight"]); f != nil && dest != "head" {
		nd["freight"] = f
	} else {
		delete(nd, "freight")
	}
	for _, k := range []string{"vehicle", "driver", "lrNo"} {
		nd[k] = clip(strings.TrimSpace(str(nd, k)), 60)
	}
	for _, k := range []string{"no", "appr", "dispatchId", "vreturnId", "value"} {
		delete(nd, k)
	}
	nd["status"] = "pending"
	nd["by"], nd["byName"], nd["at"] = u.ID, u.Name, float64(time.Now().UnixMilli())
	return nil
}

// issueGuard checks every write to a gate pass, by site or HQ.
func issueGuard(u *User, id string, ex, patch, nd map[string]any) error {
	if ex == nil {
		return issueCheckNew(u, nd)
	}
	want := str(patch, "status")
	for k := range patch {
		if k != "status" && k != "apprNote" && k != "cancelNote" {
			return errors.New("A gate pass cannot be changed after it is made. Cancel it and make a new one.")
		}
	}
	if str(ex, "status") != "pending" {
		return errors.New("This gate pass has already been " + str(ex, "status") + ".")
	}
	pid := str(ex, "projectId")
	now := float64(time.Now().UnixMilli())
	switch want {
	case "cancelled":
		if !(u.Role == "site" && str(ex, "by") == u.ID) && !siteApprover(u, pid) {
			return errors.New("Only the person who made the gate pass can cancel it.")
		}
		nd["cancelNote"] = clip(str(patch, "cancelNote"), 500)
		return nil
	case "rejected":
		if !siteApprover(u, pid) {
			return errors.New("Only the project manager can reject a gate pass.")
		}
		note := strings.TrimSpace(str(patch, "apprNote"))
		if note == "" {
			return errors.New("Write why it is rejected.")
		}
		nd["appr"] = map[string]any{"by": u.ID, "byName": u.Name, "at": now, "note": clip(note, 500), "status": "rejected"}
		delete(nd, "apprNote")
		return nil
	case "approved":
		if !siteApprover(u, pid) {
			return errors.New("Only the project manager can approve a gate pass.")
		}
	default:
		return errors.New("Unknown step.")
	}
	// approved: number, values and what follows from it
	if str(ex, "kind") == "return" {
		return returnApprove(u, id, ex, patch, nd, now)
	}
	no := nextNo("GP")
	nd["no"] = no
	nd["appr"] = map[string]any{"by": u.ID, "byName": u.Name, "at": now, "note": clip(strings.TrimSpace(str(patch, "apprNote")), 500), "status": "approved", "designation": u.Designation}
	delete(nd, "apprNote")
	var ls []any
	total := 0.0
	for _, l := range subList(ex, "lines") {
		c := shallowCopy(l)
		r := rateOf(str(c, "itemKey"))
		c["rate"] = r
		c["value"] = r * fnum(c["qty"])
		total += r * fnum(c["qty"])
		ls = append(ls, c)
	}
	nd["lines"], nd["value"] = ls, total
	plain := func() []any {
		var out []any
		for _, l := range subList(ex, "lines") {
			out = append(out, map[string]any{"desc": l["desc"], "spec": l["spec"], "unit": l["unit"], "cat": l["cat"], "itemKey": l["itemKey"], "qty": l["qty"]})
		}
		return out
	}
	switch str(ex, "dest") {
	case "site":
		did := "gp-" + id
		putDoc("dispatches", did, map[string]any{"no": no, "type": "transfer", "siteIssue": true, "issueId": id, "fromProjectId": pid, "fromStoreId": storeOf(ex, "storeId"),
			"projectId": str(ex, "toProjectId"), "toStoreId": str(ex, "toStoreId"), "status": "in_transit", "lines": plain(), "vehicle": str(ex, "vehicle"), "driver": str(ex, "driver"),
			"lrNo": str(ex, "lrNo"), "freight": ex["freight"], "shippedAt": now, "sentByName": str(ex, "byName"), "sendRemarks": str(ex, "remarks"), "approvedByName": u.Name,
			"date": time.Now().Format("2006-01-02"), "at": now})
		nd["dispatchId"] = did
	case "hq":
		for i, l := range subList(ex, "lines") {
			putDoc("sitelog", fmt.Sprintf("gp-%s-%d", id, i), map[string]any{"type": "return", "issueId": id, "gpNo": no, "projectId": pid, "storeId": storeOf(ex, "storeId"),
				"itemKey": l["itemKey"], "desc": l["desc"], "spec": l["spec"], "unit": l["unit"], "cat": l["cat"], "qty": l["qty"], "date": time.Now().Format("2006-01-02"),
				"location": str(ex, "vehicle"), "remarks": no + " · " + str(ex, "remarks"), "at": now, "createdBy": str(ex, "by"), "createdByName": str(ex, "byName")})
		}
	case "vendor":
		vid := "gp-" + id
		reason := str(ex, "reason")
		if reason == "" {
			reason = "other"
		}
		var vl []any
		for _, l := range subList(ex, "lines") {
			vl = append(vl, map[string]any{"itemKey": l["itemKey"], "poKey": "", "desc": l["desc"], "spec": l["spec"], "unit": l["unit"], "cat": l["cat"], "qty": l["qty"], "rate": nil, "gst": nil})
		}
		putDoc("vreturns", vid, map[string]any{"no": nextNo("RTV"), "gpNo": no, "issueId": id, "from": "site", "projectId": pid, "storeId": storeOf(ex, "storeId"), "vendorId": "",
			"vendorName": str(ex, "vendorName"), "poId": "", "poNo": "", "dispatchId": "", "date": time.Now().Format("2006-01-02"), "reason": reason, "replace": false,
			"remarks": str(ex, "remarks"), "vehicle": str(ex, "vehicle"), "lrNo": str(ex, "lrNo"), "photos": []any{}, "status": "returned", "at": now,
			"createdBy": str(ex, "by"), "createdByName": str(ex, "byName"), "freight": ex["freight"], "lines": vl})
		nd["vreturnId"] = vid
	}
	st.Audit = append(st.Audit, AuditEntry{At: time.Now().UnixMilli(), User: u.Username, Name: u.Name, Col: "siteissues", ID: id, Op: "update", Ref: no, Keys: "gate pass approved"})
	return nil
}

/* ---------------- site rules added in 6.6 ---------------- */

// siteRoleCheck runs before the older site rules. It returns handled=true when it decided the write itself.
func siteRoleCheck(u *User, op, col, id string, ex, patch, merged map[string]any) (map[string]any, bool, error) {
	switch col {
	case "projects":
		out, err := sitePMProject(u, op, ex, patch, merged, id)
		return out, true, err
	case "siteissues":
		if op == "set" && ex == nil {
			return merged, true, nil // checked in issueGuard
		}
		if ex == nil || str(ex, "projectId") != u.ProjectID {
			return nil, true, errDeny
		}
		return merged, true, nil
	case "indents":
		if op == "set" && ex == nil && siteStore(u) {
			return nil, true, errors.New("A storekeeper cannot raise demands. The project manager raises the site's demands.")
		}
	case "vreturns":
		if siteStore(u) {
			return nil, true, errors.New("Make a gate pass to return material to the vendor. The project manager approves it.")
		}
	case "sitelog":
		if op == "set" && ex == nil {
			if siteStore(u) && str(merged, "type") != "opening" {
				return nil, true, errors.New("Material leaves the store only on a gate pass approved by the project manager.")
			}
			sid := storeOf(merged, "storeId")
			if err := checkStore(u, str(merged, "projectId"), sid); err != nil {
				return nil, true, err
			}
			merged["storeId"] = sid
			return nil, false, nil
		}
		// the project manager approves or rejects existing stock entered by the storekeeper
		if op == "update" && ex != nil && str(ex, "status") == "pending" {
			if !siteApprover(u, str(ex, "projectId")) {
				return nil, true, errors.New("Only the project manager can approve stock entries.")
			}
			out, err := stockApproval(u, ex, patch, merged)
			return out, true, err
		}
	case "dispatches":
		if op != "update" || ex == nil {
			return nil, false, nil
		}
		s := str(patch, "status")
		// receipt at site: by the storekeeper, into one of his stores
		if str(ex, "projectId") == u.ProjectID && (s == "delivered" || s == "short") {
			if hasStorekeeper(u.ProjectID) && !siteStore(u) {
				return nil, true, errors.New("Material arriving at site is received by the storekeeper.")
			}
			sid := storeOf(patch, "storeId")
			if err := checkStore(u, u.ProjectID, sid); err != nil {
				return nil, true, err
			}
			return nil, false, nil
		}
		// a transfer HQ asked for: the storekeeper prepares it, the project manager lets it go
		if str(ex, "fromProjectId") == u.ProjectID && str(ex, "status") == "to_send" {
			if _, has := patch["sendOk"]; has && len(patch) == 1 {
				if !sitePM(u) || ex["sendReq"] == nil {
					return nil, true, errors.New("Only the project manager can let this material go.")
				}
				out := shallowCopy(ex)
				out["status"], out["sendOk"] = "in_transit", map[string]any{"by": u.ID, "byName": u.Name, "at": float64(time.Now().UnixMilli())}
				return out, true, nil
			}
			if s == "in_transit" {
				if siteStore(u) {
					if err := checkStore(u, u.ProjectID, storeOf(patch, "fromStoreId")); err != nil {
						return nil, true, err
					}
				}
				return nil, false, nil
			}
		}
	}
	return nil, false, nil
}

// after the older rules accepted a transfer being sent by the storekeeper, it waits for the project manager
func holdForPM(u *User, ex, nd map[string]any) {
	if siteStore(u) && ex != nil && str(ex, "status") == "to_send" && str(nd, "status") == "in_transit" && str(ex, "fromProjectId") == u.ProjectID {
		nd["status"] = "to_send"
		nd["sendReq"] = map[string]any{"by": u.ID, "byName": u.Name, "at": float64(time.Now().UnixMilli())}
	}
}

func stockApproval(u *User, ex, patch, nd map[string]any) (map[string]any, error) {
	want := str(patch, "status")
	for k := range patch {
		if k != "status" && k != "apprNote" {
			return nil, errors.New("Approve or reject the entry on its own.")
		}
	}
	if want != "approved" && want != "rejected" {
		return nil, errors.New("Unknown step.")
	}
	note := clip(strings.TrimSpace(str(patch, "apprNote")), 500)
	if want == "rejected" && note == "" {
		return nil, errors.New("Write why it is rejected.")
	}
	nd["appr"] = map[string]any{"by": u.ID, "byName": u.Name, "at": float64(time.Now().UnixMilli()), "note": note, "status": want}
	delete(nd, "apprNote")
	return nd, nil
}

// a new stock entry at site: the storekeeper's waits for the project manager
func stockEntryNew(u *User, nd map[string]any, keepRate bool) {
	if siteStore(u) {
		nd["status"] = "pending"
		delete(nd, "appr")
	} else if sitePM(u) && str(nd, "type") == "opening" {
		nd["status"] = "approved"
		nd["appr"] = map[string]any{"by": u.ID, "byName": u.Name, "at": float64(time.Now().UnixMilli()), "status": "approved", "self": true}
	} else {
		delete(nd, "status")
		delete(nd, "appr")
	}
	if keepRate {
		if r := fnum(nd["orate"]); r > 0 {
			nd["orate"] = r
			nd["value"] = r * fnum(nd["qty"])
			return
		}
	}
	delete(nd, "orate")
	delete(nd, "value")
}

// a site manager at HQ may keep the stores and heads of the sites assigned to him
func siteMgrLists(u *User, op, col, id string, patch map[string]any) bool {
	if col != "projects" || op != "update" || len(patch) == 0 || !can(u, "site_approve") || !inScope(u, id) {
		return false
	}
	for k := range patch {
		if k != "stores" && k != "heads" {
			return false
		}
	}
	return true
}

func storeName(p map[string]any, sid string) string {
	if s := listItem(p["stores"], sid); s != nil {
		return str(s, "name")
	}
	if sid == mainStore {
		return "Main store"
	}
	return sid
}

func fmtDate(ms float64) string {
	if ms <= 0 {
		return ""
	}
	return time.UnixMilli(int64(ms)).Format("2006-01-02")
}

// Excel sheets for gate passes, material with contractors / heads, and freight. Caller holds mu.
func storeSheetsLocked(projects map[string]map[string]any, pcode func(string) string) []xSheet {
	var sheets []xSheet
	dest := func(d map[string]any) string {
		switch str(d, "dest") {
		case "head":
			return firstNonEmpty(headTypes[str(d, "headType")], "Head") + ": " + str(d, "headName")
		case "site":
			return "Site: " + pcode(str(d, "toProjectId"))
		case "hq":
			return "Company warehouse (HQ store)"
		case "vendor":
			return "Return to vendor: " + str(d, "vendorName")
		case "repair":
			return "Out for repair / testing / hire: " + str(d, "vendorName")
		}
		return ""
	}
	label := func(d map[string]any) string {
		if str(d, "kind") == "return" {
			return "Back from " + strings.TrimPrefix(dest(d), "Out for repair / testing / hire: ")
		}
		s := dest(d)
		if d["returnable"] == true {
			s += " (returnable by " + str(d, "dueDate") + ")"
		}
		return s
	}
	rows := [][]any{{"Gate pass / return note", "Date", "Project", "Store", "Issued to / back from", "Item", "Specification", "Unit", "Qty", "Rate", "Value", "Remarks / narration", "Vehicle", "Freight (Rs)", "Prepared by", "Status", "Approved / rejected by", "Approval note"}}
	type hk struct{ p, h, k string }
	type hv struct {
		desc, spec, unit, name, typ string
		qty, val                    float64
	}
	heads := map[hk]*hv{}
	for _, x := range liveLocked("siteissues") {
		d := x.D
		a, _ := d["appr"].(map[string]any)
		f, _ := d["freight"].(map[string]any)
		for _, l := range subList(d, "lines") {
			rows = append(rows, []any{str(d, "no"), fmtDate(fnum(d["at"])), pcode(str(d, "projectId")), storeName(projects[str(d, "projectId")], storeOf(d, "storeId")), label(d), str(l, "desc"), str(l, "spec"), str(l, "unit"), fnum(l["qty"]), fnum(l["rate"]), fnum(l["value"]), str(d, "remarks"), str(d, "vehicle"), fnum(f["amt"]), str(d, "byName"), str(d, "status"), str(a, "byName"), str(a, "note")})
			if str(d, "status") == "approved" && str(d, "dest") == "head" && str(d, "headId") != "" {
				sign := 1.0
				if str(d, "kind") == "return" {
					sign = -1
				}
				key := hk{str(d, "projectId"), str(d, "headId"), itemKeyOf(l)}
				h := heads[key]
				if h == nil {
					h = &hv{desc: str(l, "desc"), spec: str(l, "spec"), unit: str(l, "unit"), name: str(d, "headName"), typ: headTypes[str(d, "headType")]}
					heads[key] = h
				}
				h.qty += sign * fnum(l["qty"])
				h.val += sign * fnum(l["value"])
			}
		}
	}
	sheets = append(sheets, xSheet{"Gate passes", rows})
	rows = [][]any{{"Project", "Head", "Type", "Item", "Specification", "Unit", "Qty with head (issued less returned)", "Value (Rs)"}}
	keys := make([]hk, 0, len(heads))
	for k := range heads {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		a, b := keys[i], keys[j]
		if a.p != b.p {
			return pcode(a.p) < pcode(b.p)
		}
		if heads[a].name != heads[b].name {
			return heads[a].name < heads[b].name
		}
		return heads[a].desc < heads[b].desc
	})
	for _, k := range keys {
		h := heads[k]
		rows = append(rows, []any{pcode(k.p), h.name, h.typ, h.desc, h.spec, h.unit, h.qty, round2(h.val)})
	}
	sheets = append(sheets, xSheet{"Material with heads", rows})
	// freight on receipts, transfers and gate passes
	byName := map[string]string{"us": "Paid by us", "vendor": "Paid by vendor", "inbill": "Included in the bill", "receiver": "Paid by receiving site", "sender": "Paid by sending site"}
	rows = [][]any{{"Document", "Date", "Movement", "From", "To", "Freight (Rs)", "Paid by", "Transporter", "LR / bilty", "Note"}}
	add := func(no, date, mv, from, to string, f map[string]any) {
		if f == nil {
			return
		}
		rows = append(rows, []any{no, date, mv, from, to, fnum(f["amt"]), byName[str(f, "by")], str(f, "transporter"), str(f, "lr"), str(f, "note")})
	}
	for _, x := range liveLocked("grns") {
		f, _ := x.D["freight"].(map[string]any)
		add(str(x.D, "no"), str(x.D, "date"), "Vendor to HQ store", firstNonEmpty(str(x.D, "vendorName"), str(x.D, "party")), "HQ store", f)
	}
	for _, x := range liveLocked("dispatches") {
		f, _ := x.D["freight"].(map[string]any)
		mv, from := "HQ store to site", "HQ store"
		switch str(x.D, "type") {
		case "direct":
			mv, from = "Vendor to site", str(x.D, "vendorName")
		case "transfer":
			mv, from = "Site to site", pcode(str(x.D, "fromProjectId"))
		}
		add(str(x.D, "no"), firstNonEmpty(str(x.D, "receivedOn"), str(x.D, "date")), mv, from, pcode(str(x.D, "projectId")), f)
	}
	for _, x := range liveLocked("siteissues") {
		if str(x.D, "status") != "approved" || str(x.D, "dest") == "site" { // site to site is listed with its transfer
			continue
		}
		f, _ := x.D["freight"].(map[string]any)
		add(str(x.D, "no"), fmtDate(fnum(x.D["at"])), "Gate pass", pcode(str(x.D, "projectId")), dest(x.D), f)
	}
	sheets = append(sheets, xSheet{"Freight", rows})
	return sheets
}

/* ---------------- material coming back to the store ---------------- */

func liveIssues() []map[string]any {
	var out []map[string]any
	for _, d := range st.Cols["siteissues"] {
		if d != nil && !d.Deleted && d.Data != nil {
			out = append(out, d.Data)
		}
	}
	return out
}

// outstanding on a returnable gate pass: issued less what came back or is on a return note waiting
func gpOutstanding(gid string) map[string]float64 {
	open := map[string]float64{}
	g := docData("siteissues", gid)
	for _, l := range subList(g, "lines") {
		open[str(l, "itemKey")] += fnum(l["qty"])
	}
	for _, r := range liveIssues() {
		if str(r, "kind") == "return" && str(r, "againstId") == gid && (str(r, "status") == "approved" || str(r, "status") == "pending") {
			for _, l := range subList(r, "lines") {
				open[str(l, "itemKey")] -= fnum(l["qty"])
			}
		}
	}
	return open
}

// material with a head: issued on approved gate passes less returns (approved or waiting)
func headNet(pid, hid string) (map[string]float64, map[string]float64) {
	qty, val := map[string]float64{}, map[string]float64{}
	for _, g := range liveIssues() {
		if str(g, "projectId") != pid || str(g, "headId") != hid {
			continue
		}
		ret := str(g, "kind") == "return"
		if !(ret && (str(g, "status") == "approved" || str(g, "status") == "pending")) && !(!ret && str(g, "status") == "approved" && str(g, "dest") == "head") {
			continue
		}
		for _, l := range subList(g, "lines") {
			k := str(l, "itemKey")
			if ret {
				qty[k] -= fnum(l["qty"])
			} else {
				qty[k] += fnum(l["qty"])
				val[k] += fnum(l["value"])
			}
		}
	}
	return qty, val
}

func returnCheckNew(u *User, nd map[string]any) error {
	pid := str(nd, "projectId")
	if projectDoc(pid) == nil {
		return errors.New("Choose the project.")
	}
	if u.Role == "site" && pid != u.ProjectID {
		return errors.New("You can only take material back into your own site's store.")
	}
	sid := storeOf(nd, "storeId")
	nd["storeId"] = sid
	if err := checkStore(u, pid, sid); err != nil {
		return err
	}
	var open map[string]float64
	from := ""
	if gid := str(nd, "againstId"); gid != "" {
		g := docData("siteissues", gid)
		if g == nil || str(g, "projectId") != pid || str(g, "status") != "approved" || g["returnable"] != true || str(g, "kind") == "return" {
			return errors.New("Choose the returnable gate pass the material comes back on.")
		}
		for _, k := range []string{"dest", "headId", "headName", "headType", "vendorName"} {
			if v, ok := g[k]; ok {
				nd[k] = v
			} else {
				delete(nd, k)
			}
		}
		nd["againstNo"] = str(g, "no")
		open = gpOutstanding(gid)
		from = "on " + str(g, "no")
	} else {
		h := listItem(projectDoc(pid)["heads"], str(nd, "headId"))
		if h == nil {
			return errors.New("Choose the contractor or head the material comes back from.")
		}
		nd["dest"], nd["headName"], nd["headType"] = "head", str(h, "name"), str(h, "type")
		delete(nd, "vendorName")
		delete(nd, "againstNo")
		open, _ = headNet(pid, str(nd, "headId"))
		from = "with " + str(h, "name")
	}
	rem := strings.TrimSpace(str(nd, "remarks"))
	if rem == "" {
		return errors.New("Write the remarks: condition of the material and why it comes back.")
	}
	nd["remarks"] = clip(rem, 2000)
	var out []any
	for _, li := range anyList(nd["lines"]) {
		m, ok := li.(map[string]any)
		if !ok || strings.TrimSpace(str(m, "desc")) == "" {
			return errors.New("Invalid item line.")
		}
		q, _ := m["qty"].(float64)
		if !(q > 0) {
			return errors.New("Enter the quantity of " + str(m, "desc") + ".")
		}
		k := str(m, "itemKey")
		if k == "" {
			k = keyOf(str(m, "desc"), str(m, "spec"), str(m, "unit"))
		}
		if q > open[k]+1e-9 {
			return fmt.Errorf("Only %s %s of %s is %s.", trimNum(open[k]), str(m, "unit"), str(m, "desc"), from)
		}
		c := map[string]any{"itemKey": k}
		for _, f := range []string{"desc", "spec", "unit", "cat", "qty", "cond"} {
			if v, has := m[f]; has {
				c[f] = v
			}
		}
		out = append(out, c)
	}
	if len(out) == 0 {
		return errors.New("Enter the quantity that comes back.")
	}
	nd["lines"] = out
	for _, k := range []string{"no", "appr", "dispatchId", "vreturnId", "value", "freight", "returnable", "dueDate", "toProjectId", "toStoreId", "toProjectName", "reason"} {
		delete(nd, k)
	}
	for _, k := range []string{"vehicle", "driver", "lrNo"} {
		nd[k] = clip(strings.TrimSpace(str(nd, k)), 60)
	}
	nd["kind"], nd["status"] = "return", "pending"
	nd["by"], nd["byName"], nd["at"] = u.ID, u.Name, float64(time.Now().UnixMilli())
	return nil
}

func returnApprove(u *User, id string, ex, patch, nd map[string]any, now float64) error {
	no := nextNo("MRN")
	nd["no"] = no
	nd["appr"] = map[string]any{"by": u.ID, "byName": u.Name, "at": now, "note": clip(strings.TrimSpace(str(patch, "apprNote")), 500), "status": "approved", "designation": u.Designation}
	delete(nd, "apprNote")
	// value back at the rate it was issued at
	_, val := headNet(str(ex, "projectId"), str(ex, "headId"))
	iq := map[string]float64{}
	for _, g := range liveIssues() {
		if str(g, "kind") != "return" && str(g, "status") == "approved" && str(g, "projectId") == str(ex, "projectId") && (str(g, "headId") == str(ex, "headId") && str(ex, "headId") != "" || g["no"] == ex["againstNo"]) {
			for _, l := range subList(g, "lines") {
				iq[str(l, "itemKey")] += fnum(l["qty"])
				if str(ex, "headId") == "" {
					val[str(l, "itemKey")] += fnum(l["value"])
				}
			}
		}
	}
	var ls []any
	total := 0.0
	for _, l := range subList(ex, "lines") {
		c := shallowCopy(l)
		k := str(c, "itemKey")
		r := rateOf(k)
		if iq[k] > 0 && val[k] > 0 {
			r = val[k] / iq[k]
		}
		c["rate"], c["value"] = r, r*fnum(c["qty"])
		total += r * fnum(c["qty"])
		ls = append(ls, c)
	}
	nd["lines"], nd["value"] = ls, total
	st.Audit = append(st.Audit, AuditEntry{At: time.Now().UnixMilli(), User: u.Username, Name: u.Name, Col: "siteissues", ID: id, Op: "update", Ref: no, Keys: "material return approved"})
	return nil
}

func trimNum(f float64) string {
	s := fmt.Sprintf("%.3f", f)
	s = strings.TrimRight(strings.TrimRight(s, "0"), ".")
	if s == "" || s == "-0" {
		return "0"
	}
	return s
}
