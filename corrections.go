package main

// Corrections to site records after they are final.
//
// A receipt at site, an approved gate pass (issue of material) or an
// authenticated consumption report cannot be changed by the site. If a
// quantity was entered wrongly, the site's project manager asks HQ for a
// correction with a reason. An administrator, or an HQ user with the
// permission "site_amend_approve" for that site, approves or rejects it.
// Once approved, the project manager may make one correction to the line
// quantities of that record. The record keeps a history of corrections and
// the request keeps the quantities before and after.
//
// From 9.3.2 the project manager can also make the correction straight away and
// send it for approval ("proposed"), or ask to cancel a challan / gate pass /
// report / stock entry made by mistake (action "cancel"). Nothing changes until an
// administrator or an approver OKs it; on approval the server applies it at once.
//
// Collection "corrections":
//   {no, projectId, refCol, refId, refNo, kind, reason, status, by, byName, at,
//    decision{by, byName, at, note}, done{at, by, byName, before, after, note}}
//   status: pending -> approved | rejected | cancelled; approved -> done | cancelled

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
)

var corrKinds = map[string]string{"dispatches": "receipt", "siteissues": "gate pass", "consumption": "consumption report", "sitelog": "stock entry"}

func corrQtyKey(col string) string {
	if col == "dispatches" {
		return "recvQty"
	}
	return "qty"
}

func canDecideCorr(u *User, projectID string) bool {
	return u != nil && u.Role == "hq" && (isAdmin(u) || (can(u, "site_amend_approve") && inScope(u, projectID)))
}

// corrRef checks that a correction (action "amend") or a cancellation (action "cancel")
// may be asked for this record by this site.
func corrRef(u *User, col, id, action string) (map[string]any, error) {
	if corrKinds[col] == "" {
		return nil, errors.New("Corrections can be asked only for receipts, transfer challans, gate passes, consumption reports and stock entries.")
	}
	ref := docData(col, id)
	if ref == nil {
		return nil, errors.New("The record to correct was not found.")
	}
	s := str(ref, "status")
	if action == "cancel" {
		switch col {
		case "dispatches":
			if str(ref, "type") != "transfer" || str(ref, "fromProjectId") != u.ProjectID {
				return nil, errors.New("Only a transfer challan sent by your site can be cancelled. A wrong receipt is corrected instead.")
			}
			if ref["siteIssue"] == true {
				return nil, errors.New("This challan was made from a gate pass: ask to cancel gate pass " + str(ref, "no") + " instead.")
			}
			if s != "in_transit" && s != "to_send" {
				return nil, errors.New("The material has already been received at the other site, so the challan cannot be cancelled. Ask that site to correct its receipt.")
			}
		case "siteissues":
			if str(ref, "projectId") != u.ProjectID {
				return nil, errDeny
			}
			if s != "approved" {
				return nil, errors.New("Only an approved gate pass is cancelled through HQ. A pending one can be cancelled or rejected at site.")
			}
			if str(ref, "dest") == "site" {
				if d := docData("dispatches", str(ref, "dispatchId")); d != nil && str(d, "status") != "in_transit" && str(d, "status") != "cancelled" {
					return nil, errors.New("The material on this gate pass has already been received at the other site. Ask that site to correct its receipt instead.")
				}
			}
			if ref["returnable"] == true && str(ref, "kind") != "return" {
				for _, r := range liveIssues() {
					if str(r, "kind") == "return" && str(r, "againstId") == id && (str(r, "status") == "approved" || str(r, "status") == "pending") {
						return nil, errors.New("Material has come back on return note " + str(r, "no") + " against this gate pass. Cancel that return note first.")
					}
				}
			}
		case "consumption":
			if str(ref, "projectId") != u.ProjectID {
				return nil, errDeny
			}
			if s != "authenticated" {
				return nil, errors.New("This report is not authenticated yet; it can still be rejected at site.")
			}
		case "sitelog":
			if err := corrLogOK(u, ref); err != nil {
				return nil, err
			}
		}
		return ref, nil
	}
	if col == "sitelog" {
		return ref, corrLogOK(u, ref)
	}
	if str(ref, "projectId") != u.ProjectID {
		return nil, errDeny
	}
	switch col {
	case "dispatches":
		if s != "delivered" && s != "short" {
			return nil, errors.New("Only material that has been received can be corrected.")
		}
	case "siteissues":
		if s != "approved" && s != "returned" {
			return nil, errors.New("Only an approved gate pass can be corrected. A pending one can be cancelled or rejected instead.")
		}
		if str(ref, "dest") == "site" && str(ref, "kind") != "return" {
			return nil, errors.New("A gate pass to another site became a transfer. Ask for a correction of the receipt at the receiving site instead.")
		}
	case "consumption":
		if s != "authenticated" {
			return nil, errors.New("This report is not authenticated yet; it can still be corrected directly.")
		}
	}
	return ref, nil
}

// a stock entry (opening stock, used, damaged, adjustment…) that counts in the site's stock
func corrLogOK(u *User, ref map[string]any) error {
	if str(ref, "projectId") != u.ProjectID {
		return errDeny
	}
	if str(ref, "issueId") != "" {
		return errors.New("This entry was made by a gate pass; correct or cancel the gate pass instead.")
	}
	if s := str(ref, "status"); s == "pending" || s == "rejected" || s == "cancelled" {
		return errors.New("Only a stock entry that counts in the stock (approved) can be corrected through HQ.")
	}
	return nil
}

func openCorrFor(refID string) (string, map[string]any) {
	for id, d := range st.Cols["corrections"] {
		if d == nil || d.Deleted || d.Data == nil || str(d.Data, "refId") != refID {
			continue
		}
		if s := str(d.Data, "status"); s == "pending" || s == "approved" {
			return id, d.Data
		}
	}
	return "", nil
}

// correctionWriteLocked handles writes to "corrections" and the correction of a record itself.
func correctionWriteLocked(u *User, op, col, id string, ex, patch map[string]any, now int64) (map[string]any, error) {
	if col == "corrections" {
		return corrRequestWrite(u, op, id, ex, patch, now)
	}
	return corrApply(u, op, col, id, ex, patch, now)
}

func corrRequestWrite(u *User, op, cid string, ex, patch map[string]any, now int64) (map[string]any, error) {
	if op == "delete" {
		return nil, errors.New("Correction requests are kept for the record. Cancel it instead.")
	}
	// a new request, by the project manager of the site
	if ex == nil {
		if u.Role != "site" {
			return nil, errors.New("A correction is asked by the site's project manager.")
		}
		if !sitePM(u) {
			return nil, errors.New("Only the project manager can ask HQ for a correction.")
		}
		if str(patch, "action") == "stock" {
			return corrStockNew(u, patch, now)
		}
		refCol, refID := str(patch, "refCol"), str(patch, "refId")
		action := str(patch, "action")
		if action != "cancel" {
			action = "amend"
		}
		ref, err := corrRef(u, refCol, refID, action)
		if err != nil {
			return nil, err
		}
		if _, o := openCorrFor(refID); o != nil {
			return nil, fmt.Errorf("Correction %s is already open for this record.", str(o, "no"))
		}
		reason := clip(strings.TrimSpace(str(patch, "reason")), 600)
		if reason == "" {
			return nil, errors.New("Write what is wrong and why it needs correcting.")
		}
		no := clip(strings.TrimSpace(str(patch, "no")), 40)
		if no == "" {
			return nil, errors.New("Invalid request.")
		}
		refNo := str(ref, "no")
		if refNo == "" {
			refNo = str(ref, "gpNo")
		}
		if refNo == "" && refCol == "sitelog" {
			refNo = clip(str(ref, "desc")+" "+str(ref, "spec"), 60)
		}
		out := map[string]any{"no": no, "projectId": u.ProjectID, "refCol": refCol, "refId": refID, "refNo": refNo, "kind": corrKinds[refCol],
			"reason": reason, "status": "pending", "by": u.ID, "byName": u.Name, "at": float64(now), "action": action}
		// the correction made by the project manager, applied when HQ approves it
		if prop, ok := patch["proposed"].(map[string]any); ok && action == "amend" {
			_, done, err := corrCompute(refCol, ref, prop)
			if err != nil {
				return nil, err
			}
			out["proposed"], out["preview"] = prop, done
		}
		return out, nil
	}
	want := str(patch, "status")
	for k := range patch {
		if k != "status" && k != "note" {
			return nil, errors.New("A correction request can only be approved, rejected or cancelled.")
		}
	}
	cur := str(ex, "status")
	out := shallowCopy(ex)
	switch {
	case u.Role == "site" && want == "cancelled":
		if str(ex, "projectId") != u.ProjectID || !sitePM(u) {
			return nil, errDeny
		}
		if cur != "pending" && cur != "approved" {
			return nil, errors.New("This request is already closed.")
		}
	case want == "approved" || want == "rejected":
		if !canDecideCorr(u, str(ex, "projectId")) {
			return nil, errors.New("You are not allowed to approve corrections for this site.")
		}
		if cur != "pending" {
			return nil, errors.New("This request has already been decided.")
		}
		note := clip(strings.TrimSpace(str(patch, "note")), 500)
		if want == "rejected" && note == "" {
			return nil, errors.New("Write why the correction is rejected.")
		}
		out["decision"] = map[string]any{"by": u.ID, "byName": u.Name, "at": float64(now), "note": note}
		if want == "approved" && (str(ex, "action") == "cancel" || str(ex, "action") == "stock" || ex["proposed"] != nil) {
			if err := corrApplyApproved(u, cid, ex, out, now); err != nil {
				return nil, err
			}
			return out, nil
		}
	default:
		return nil, errDeny
	}
	out["status"] = want
	return out, nil
}

// fields of each record the project manager may correct (besides line quantities)
var corrFields = map[string][]string{
	"dispatches":  {"receivedOn", "receivedByName", "receiverDesignation", "siteRemarks", "vehicle", "vendorChallan", "vendorInvoice", "billDocs", "signedDocs", "photos"},
	"siteissues":  {"remarks", "vehicle", "driver", "lrNo"},
	"consumption": {"date", "description", "location", "remarks", "photos"},
}

var corrDateRe = regexp.MustCompile(`^[0-9]{4}-[0-9]{2}-[0-9]{2}$`)

// corrField checks one corrected field and returns its clean value.
func corrField(col, k string, v any, ex map[string]any) (any, error) {
	switch k {
	case "receivedOn", "date":
		d := strings.TrimSpace(fmt.Sprint(v))
		if !corrDateRe.MatchString(d) {
			return nil, errors.New("Enter a valid date.")
		}
		if t, err := time.ParseInLocation("2006-01-02", d, time.Local); err != nil || t.After(time.Now()) {
			return nil, errors.New("The date cannot be in the future.")
		}
		return d, nil
	case "billDocs", "signedDocs", "photos":
		a, ok := v.([]any)
		if !ok || len(a) > 30 {
			return nil, errors.New("Invalid documents.")
		}
		for _, x := range a {
			switch x.(type) {
			case string, map[string]any:
			default:
				return nil, errors.New("Invalid documents.")
			}
		}
		if col == "dispatches" && k != "photos" && len(a) == 0 && len(anyList(ex[k])) > 0 {
			return nil, errors.New("The vendor's bill and the signed challan cannot be removed; upload the right one instead.")
		}
		return a, nil
	case "siteRemarks", "remarks", "description":
		t := clip(strings.TrimSpace(fmt.Sprint(v)), 500)
		if k == "description" && t == "" {
			return nil, errors.New("The description cannot be empty.")
		}
		return t, nil
	case "receivedByName":
		t := clip(strings.TrimSpace(fmt.Sprint(v)), 80)
		if t == "" {
			return nil, errors.New("Write who received the material.")
		}
		return t, nil
	}
	return clip(strings.TrimSpace(fmt.Sprint(v)), 80), nil
}

// corrShow is how a changed field is recorded in the history.
func corrShow(v any) any {
	if a, ok := v.([]any); ok {
		return fmt.Sprintf("%d file(s)", len(a))
	}
	if v == nil {
		return ""
	}
	return v
}

// corrApply: the project manager corrects a record under an approved request.
func corrApply(u *User, op, col, id string, ex, patch map[string]any, now int64) (map[string]any, error) {
	cid := str(patch, "_correction")
	c := docData("corrections", cid)
	if op != "update" || ex == nil || c == nil || u.Role != "site" {
		return nil, errDeny
	}
	if str(c, "status") != "approved" || str(c, "refCol") != col || str(c, "refId") != id || str(c, "projectId") != u.ProjectID {
		return nil, errors.New("There is no approved correction for this record.")
	}
	if !sitePM(u) {
		return nil, errors.New("Only the project manager can make an approved correction.")
	}
	out, done, err := corrCompute(col, ex, patch)
	if err != nil {
		return nil, err
	}
	dec, _ := c["decision"].(map[string]any)
	done["at"], done["by"], done["byName"] = float64(now), u.ID, u.Name
	h := shallowCopy(done)
	h["id"], h["no"], h["reason"], h["approvedBy"] = cid, str(c, "no"), str(c, "reason"), str(dec, "byName")
	hist, _ := ex["corrections"].([]any)
	out["corrections"] = append(append([]any{}, hist...), h)
	nc := shallowCopy(c)
	nc["status"] = "done"
	nc["done"] = done
	putDocLocked("corrections", cid, nc)
	return out, nil
}

// corrCompute works out the corrected record and what changed, without saving anything.
func corrCompute(col string, ex, patch map[string]any) (map[string]any, map[string]any, error) {
	allowed := map[string]bool{"_correction": true, "lines": true, "corrNote": true}
	if col == "sitelog" {
		allowed["qty"] = true
	}
	for _, k := range corrFields[col] {
		allowed[k] = true
	}
	for k := range patch {
		if !allowed[k] {
			return nil, nil, errors.New("This detail cannot be corrected.")
		}
	}
	out := shallowCopy(ex)
	changed := false
	// line quantities (and, for a delivery direct from the vendor, the vendor's quantity)
	key := corrQtyKey(col)
	direct := col == "dispatches" && str(ex, "type") == "direct"
	exl := subList(ex, "lines")
	var before, after, supBefore, supAfter []any
	if v, has := patch["qty"].(float64); has && col == "sitelog" {
		if v < 0 || v > 1e9 || (v == 0 && str(ex, "type") != "adjust") {
			return nil, nil, errors.New("Enter a valid quantity.")
		}
		v = round3(v)
		if v != fnum(ex["qty"]) {
			changed = true
		}
		before, after = []any{fnum(ex["qty"])}, []any{v}
		out["qty"] = v
	}
	if nl, has := patch["lines"].([]any); has {
		if len(nl) != len(exl) {
			return nil, nil, errors.New("Invalid request.")
		}
		var lines []any
		for i, l := range exl {
			m := shallowCopy(l)
			nm, _ := nl[i].(map[string]any)
			v, ok := nm[key].(float64)
			if !ok || v < 0 || v > 1e9 {
				return nil, nil, errors.New("Enter a valid quantity on every line.")
			}
			v = round3(v)
			old := fnum(l[key])
			if v != old {
				changed = true
			}
			before, after = append(before, old), append(after, v)
			m[key] = v
			if direct {
				if sv, ok := nm["supQty"].(float64); ok && sv >= 0 {
					sv = round3(sv)
					os := fnum(l["qty"])
					if sv != os {
						changed = true
						if m["ordQty"] == nil {
							m["ordQty"] = os
						}
						m["qty"], m["supQty"] = sv, sv
					}
					supBefore, supAfter = append(supBefore, os), append(supAfter, sv)
				}
			}
			lines = append(lines, m)
		}
		out["lines"] = lines
	}
	// other details
	fields := map[string]any{}
	for _, k := range corrFields[col] {
		v, has := patch[k]
		if !has {
			continue
		}
		nv, err := corrField(col, k, v, ex)
		if err != nil {
			return nil, nil, err
		}
		if fmt.Sprint(nv) == fmt.Sprint(ex[k]) {
			continue
		}
		fields[k] = map[string]any{"from": corrShow(ex[k]), "to": corrShow(nv)}
		out[k] = nv
		changed = true
		if k == "receivedOn" {
			// screens and stock movements use receivedAt: move it to the corrected date, same time of day
			t := time.Now()
			if ra := fnum(ex["receivedAt"]); ra > 0 {
				t = time.UnixMilli(int64(ra))
				if ex["origReceivedAt"] == nil {
					out["origReceivedAt"] = ex["receivedAt"]
				}
			}
			if d, err := time.ParseInLocation("2006-01-02", nv.(string), time.Local); err == nil {
				nt := time.Date(d.Year(), d.Month(), d.Day(), t.Hour(), t.Minute(), t.Second(), 0, time.Local)
				if nt.After(time.Now()) {
					nt = time.Now()
				}
				out["receivedAt"] = float64(nt.UnixMilli())
			}
		}
	}
	if !changed {
		return nil, nil, errors.New("Nothing was changed.")
	}
	if col == "dispatches" {
		short, excess := false, false
		for _, m := range subList(out, "lines") {
			if fnum(m["recvQty"])+1e-9 < fnum(m["qty"]) {
				short = true
			}
			if fnum(m["recvQty"]) > fnum(m["qty"])+1e-9 {
				excess = true
			}
		}
		if short {
			out["status"] = "short"
			delete(out, "excess")
		} else {
			out["status"] = "delivered"
			if excess {
				out["excess"] = true
			} else {
				delete(out, "excess")
			}
		}
	}
	note := clip(strings.TrimSpace(str(patch, "corrNote")), 500)
	done := map[string]any{"before": before, "after": after, "note": note}
	if len(fields) > 0 {
		done["fields"] = fields
	}
	if supBefore != nil {
		done["supBefore"], done["supAfter"] = supBefore, supAfter
	}
	return out, done, nil
}

// corrApplyApproved applies a correction made by the project manager, or a
// cancellation, when HQ approves it. out is the request being approved.
func corrApplyApproved(u *User, cid string, c, out map[string]any, now int64) error {
	if str(c, "action") == "stock" {
		return corrStockApply(u, cid, c, out, now)
	}
	col, id := str(c, "refCol"), str(c, "refId")
	ref := docData(col, id)
	if ref == nil {
		return errors.New("The record was not found any more.")
	}
	if str(c, "action") == "cancel" {
		pu := &User{ID: str(c, "by"), Name: str(c, "byName"), Role: "site", ProjectID: str(c, "projectId")}
		if _, err := corrRef(pu, col, id, "cancel"); err != nil {
			return errors.New("It can no longer be cancelled: " + err.Error())
		}
		nr := shallowCopy(ref)
		nr["status"] = "cancelled"
		nr["cancelled"] = map[string]any{"at": float64(now), "by": str(c, "by"), "byName": str(c, "byName"), "reason": str(c, "reason"), "approvedBy": u.Name, "corrNo": str(c, "no"), "was": str(ref, "status")}
		switch col {
		case "siteissues":
			// what the gate pass made elsewhere goes too
			gid := id
			if did := str(ref, "dispatchId"); did != "" {
				if d := docData("dispatches", did); d != nil && str(d, "status") == "in_transit" {
					nd := shallowCopy(d)
					nd["status"] = "cancelled"
					nd["cancelNote"] = "Gate pass " + str(ref, "no") + " cancelled: " + str(c, "reason")
					putDocLocked("dispatches", did, nd)
				}
			}
			if vid := str(ref, "vreturnId"); vid != "" {
				if v := docData("vreturns", vid); v != nil {
					nv := shallowCopy(v)
					nv["status"], nv["cancelNote"] = "cancelled", "Gate pass "+str(ref, "no")+" cancelled: "+str(c, "reason")
					putDocLocked("vreturns", vid, nv)
				}
			}
			for lid, d := range st.Cols["sitelog"] {
				if d != nil && !d.Deleted && d.Data != nil && str(d.Data, "issueId") == gid {
					nl := shallowCopy(d.Data)
					nl["status"] = "cancelled"
					putDocLocked("sitelog", lid, nl)
				}
			}
		case "dispatches":
			nr["cancelNote"] = "Cancelled (" + str(c, "no") + "): " + str(c, "reason")
		}
		putDocLocked(col, id, nr)
		out["status"] = "done"
		out["done"] = map[string]any{"at": float64(now), "by": u.ID, "byName": u.Name, "cancelled": true}
		st.Audit = append(st.Audit, AuditEntry{At: now, User: u.Username, Name: u.Name, Col: col, ID: id, Op: "update", Ref: str(c, "refNo"), Keys: "cancelled on " + str(c, "no")})
		return nil
	}
	prop, _ := c["proposed"].(map[string]any)
	nr, done, err := corrCompute(col, ref, prop)
	if err != nil {
		return errors.New("The correction can no longer be applied (" + err.Error() + "). Reject it and ask the site to send it again.")
	}
	done["at"], done["by"], done["byName"], done["approvedBy"] = float64(now), str(c, "by"), str(c, "byName"), u.Name
	h := shallowCopy(done)
	h["id"], h["no"], h["reason"] = cid, str(c, "no"), str(c, "reason")
	hist, _ := ref["corrections"].([]any)
	nr["corrections"] = append(append([]any{}, hist...), h)
	putDocLocked(col, id, nr)
	out["status"] = "done"
	out["done"] = done
	st.Audit = append(st.Audit, AuditEntry{At: now, User: u.Username, Name: u.Name, Col: col, ID: id, Op: "update", Ref: str(c, "refNo"), Keys: "corrected on " + str(c, "no")})
	return nil
}

/* ---------- amendment of site stock: the project manager gives the actual quantity,
   the administrator approves, and a stock correction entry is made ---------- */

func corrStockNew(u *User, patch map[string]any, now int64) (map[string]any, error) {
	pid := u.ProjectID
	sid := storeOf(patch, "storeId")
	if err := checkStore(u, pid, sid); err != nil {
		return nil, err
	}
	reason := clip(strings.TrimSpace(str(patch, "reason")), 600)
	if reason == "" {
		return nil, errors.New("Write why the stock is to be amended.")
	}
	no := clip(strings.TrimSpace(str(patch, "no")), 40)
	if no == "" {
		return nil, errors.New("Invalid request.")
	}
	// items already waiting in another stock amendment of this store
	waiting := map[string]string{}
	for _, d := range st.Cols["corrections"] {
		if d == nil || d.Deleted || d.Data == nil || str(d.Data, "action") != "stock" || str(d.Data, "status") != "pending" || str(d.Data, "projectId") != pid || storeOf(d.Data, "storeId") != sid {
			continue
		}
		for _, l := range subList(d.Data, "lines") {
			waiting[str(l, "itemKey")] = str(d.Data, "no")
			if t, ok := l["to"].(map[string]any); ok {
				waiting[str(t, "itemKey")] = str(d.Data, "no")
			}
		}
	}
	var lines []any
	for _, l := range subList(patch, "lines") {
		k := str(l, "itemKey")
		if k == "" || str(l, "desc") == "" {
			return nil, errors.New("Invalid item.")
		}
		if n := waiting[k]; n != "" {
			return nil, fmt.Errorf("%s is already waiting for HQ in stock amendment %s.", str(l, "desc"), n)
		}
		// 9.10.0: the entry was made under the wrong item, size or unit: move the
		// quantity to the right item (in its own unit and quantity)
		if str(l, "kind") == "change" {
			ln, err := corrStockChange(l, k)
			if err != nil {
				return nil, err
			}
			if n := waiting[str(ln["to"].(map[string]any), "itemKey")]; n != "" {
				return nil, fmt.Errorf("%s is already waiting for HQ in stock amendment %s.", str(ln["to"].(map[string]any), "desc"), n)
			}
			lines = append(lines, ln)
			continue
		}
		book, actual := round3(fnum(l["book"])), round3(fnum(l["actual"]))
		if actual < 0 || actual > 1e9 || book < -1e9 || book > 1e9 {
			return nil, errors.New("Enter a valid quantity for " + str(l, "desc") + ".")
		}
		if actual == book {
			continue
		}
		lines = append(lines, map[string]any{"itemKey": k, "desc": clip(str(l, "desc"), 200), "spec": clip(str(l, "spec"), 200), "unit": clip(str(l, "unit"), 20), "cat": clip(str(l, "cat"), 40),
			"book": book, "actual": actual, "diff": round3(actual - book)})
	}
	if len(lines) == 0 {
		return nil, errors.New("The quantities match the stock register; nothing to amend.")
	}
	if len(lines) > 300 {
		return nil, errors.New("Too many items in one amendment.")
	}
	refNo := str(subList(patch, "lines")[0], "desc")
	if len(lines) > 1 {
		refNo = fmt.Sprintf("%d items", len(lines))
	}
	return map[string]any{"no": no, "projectId": pid, "storeId": sid, "refCol": "sitestock", "refId": pid + "|" + sid + "|" + no, "refNo": refNo, "kind": "site stock",
		"reason": reason, "status": "pending", "by": u.ID, "byName": u.Name, "at": float64(now), "action": "stock", "lines": lines,
		"countedBy": clip(strings.TrimSpace(str(patch, "countedBy")), 80)}, nil
}

// corrStockChange checks a line that moves stock from a wrongly entered item to the right one.
func corrStockChange(l map[string]any, k string) (map[string]any, error) {
	book, qty := round3(fnum(l["book"])), round3(fnum(l["qty"]))
	if !(qty > 0) || qty > 1e9 {
		return nil, errors.New("Enter the quantity of " + str(l, "desc") + " that was entered wrongly.")
	}
	if qty > book+1e-9 {
		return nil, fmt.Errorf("Only %v %s of %s is in the stock register.", book, str(l, "unit"), str(l, "desc"))
	}
	t, _ := l["to"].(map[string]any)
	if t == nil {
		return nil, errors.New("Choose the correct item.")
	}
	desc, spec, unit := clip(strings.TrimSpace(str(t, "desc")), 200), clip(strings.TrimSpace(str(t, "spec")), 200), clip(strings.TrimSpace(str(t, "unit")), 20)
	if desc == "" {
		return nil, errors.New("Enter the correct item.")
	}
	if unit == "" {
		return nil, errors.New("Choose the correct unit.")
	}
	tq := round3(fnum(t["qty"]))
	if !(tq > 0) || tq > 1e9 {
		return nil, errors.New("Enter the correct quantity of " + desc + ".")
	}
	tk := normS(desc) + "|" + normS(spec) + "|" + strings.ToLower(unit)
	if tk == k {
		return nil, errors.New("The correct item, size and unit are the same as in the register. To change only the quantity, choose \"Quantity is wrong\".")
	}
	return map[string]any{"kind": "change", "itemKey": k, "desc": clip(str(l, "desc"), 200), "spec": clip(str(l, "spec"), 200), "unit": clip(str(l, "unit"), 20), "cat": clip(str(l, "cat"), 40),
		"book": book, "qty": qty, "actual": round3(book - qty), "diff": -qty,
		"to": map[string]any{"itemKey": tk, "desc": desc, "spec": spec, "unit": unit, "cat": clip(str(t, "cat"), 40), "qty": tq}}, nil
}

func corrStockApply(u *User, cid string, c, out map[string]any, now int64) error {
	pid, sid := str(c, "projectId"), storeOf(c, "storeId")
	date := time.Now().Format("2006-01-02")
	var ids []any
	entry := func(id string, l map[string]any, qty any, rem string) {
		putDocLocked("sitelog", id, map[string]any{"type": "adjust", "projectId": pid, "storeId": sid, "itemKey": l["itemKey"], "desc": l["desc"], "spec": l["spec"], "unit": l["unit"], "cat": l["cat"],
			"qty": qty, "date": date, "reason": "Stock amendment " + str(c, "no") + ": " + str(c, "reason"), "remarks": rem, "corrId": cid, "corrNo": str(c, "no"),
			"status": "approved", "appr": map[string]any{"by": u.ID, "byName": u.Name, "at": float64(now), "status": "approved", "hq": true},
			"at": float64(now), "createdBy": u.ID, "createdByName": u.Name, "requestedBy": str(c, "by"), "requestedByName": str(c, "byName")})
	}
	for i, l := range subList(c, "lines") {
		id := fmt.Sprintf("sa-%s-%d", cid, i)
		if str(l, "kind") == "change" {
			t, _ := l["to"].(map[string]any)
			if t == nil {
				continue
			}
			rem := fmt.Sprintf("Entered wrongly as %v %s %s %s; correct: %v %s %s %s", fnum(l["qty"]), str(l, "unit"), str(l, "desc"), str(l, "spec"), fnum(t["qty"]), str(t, "unit"), str(t, "desc"), str(t, "spec"))
			entry(id, l, -fnum(l["qty"]), rem)
			entry(id+"-to", t, fnum(t["qty"]), rem)
			ids = append(ids, id, id+"-to")
			continue
		}
		rem := fmt.Sprintf("Register %v, actual %v %s", fnum(l["book"]), fnum(l["actual"]), str(l, "unit"))
		if cb := str(c, "countedBy"); cb != "" {
			rem += " (counted by " + cb + ")"
		}
		putDocLocked("sitelog", id, map[string]any{"type": "adjust", "projectId": pid, "storeId": sid, "itemKey": l["itemKey"], "desc": l["desc"], "spec": l["spec"], "unit": l["unit"], "cat": l["cat"],
			"qty": fnum(l["diff"]), "date": date, "reason": "Stock amendment " + str(c, "no") + ": " + str(c, "reason"), "remarks": rem, "corrId": cid, "corrNo": str(c, "no"),
			"status": "approved", "appr": map[string]any{"by": u.ID, "byName": u.Name, "at": float64(now), "status": "approved", "hq": true},
			"at": float64(now), "createdBy": u.ID, "createdByName": u.Name, "requestedBy": str(c, "by"), "requestedByName": str(c, "byName")})
		ids = append(ids, id)
	}
	out["status"] = "done"
	out["done"] = map[string]any{"at": float64(now), "by": u.ID, "byName": u.Name, "approvedBy": u.Name, "entries": ids}
	st.Audit = append(st.Audit, AuditEntry{At: now, User: u.Username, Name: u.Name, Col: "sitelog", ID: cid, Op: "update", Ref: str(c, "no"), Keys: "site stock amended"})
	return nil
}
