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
// Collection "corrections":
//   {no, projectId, refCol, refId, refNo, kind, reason, status, by, byName, at,
//    decision{by, byName, at, note}, done{at, by, byName, before, after, note}}
//   status: pending -> approved | rejected | cancelled; approved -> done | cancelled

import (
	"errors"
	"fmt"
	"strings"
)

var corrKinds = map[string]string{"dispatches": "receipt", "siteissues": "gate pass", "consumption": "consumption report"}

func corrQtyKey(col string) string {
	if col == "dispatches" {
		return "recvQty"
	}
	return "qty"
}

func canDecideCorr(u *User, projectID string) bool {
	return u != nil && u.Role == "hq" && (isAdmin(u) || (can(u, "site_amend_approve") && inScope(u, projectID)))
}

// corrRef checks that a correction may be asked for this record by this site.
func corrRef(u *User, col, id string) (map[string]any, error) {
	if corrKinds[col] == "" {
		return nil, errors.New("Corrections can be asked only for receipts, gate passes and consumption reports.")
	}
	ref := docData(col, id)
	if ref == nil {
		return nil, errors.New("The record to correct was not found.")
	}
	if str(ref, "projectId") != u.ProjectID {
		return nil, errDeny
	}
	s := str(ref, "status")
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
		return corrRequestWrite(u, op, ex, patch, now)
	}
	return corrApply(u, op, col, id, ex, patch, now)
}

func corrRequestWrite(u *User, op string, ex, patch map[string]any, now int64) (map[string]any, error) {
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
		refCol, refID := str(patch, "refCol"), str(patch, "refId")
		ref, err := corrRef(u, refCol, refID)
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
		return map[string]any{"no": no, "projectId": u.ProjectID, "refCol": refCol, "refId": refID, "refNo": refNo, "kind": corrKinds[refCol],
			"reason": reason, "status": "pending", "by": u.ID, "byName": u.Name, "at": float64(now)}, nil
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
	default:
		return nil, errDeny
	}
	out["status"] = want
	return out, nil
}

// corrApply: the project manager corrects the quantities of a record under an approved request.
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
	for k := range patch {
		if k != "_correction" && k != "lines" && k != "corrNote" {
			return nil, errors.New("Only the quantities can be corrected.")
		}
	}
	key := corrQtyKey(col)
	exl := subList(ex, "lines")
	nl, _ := patch["lines"].([]any)
	if len(nl) != len(exl) {
		return nil, errors.New("Invalid request.")
	}
	var lines, before, after []any
	changed := false
	for i, l := range exl {
		m := shallowCopy(l)
		nm, _ := nl[i].(map[string]any)
		v, ok := nm[key].(float64)
		if !ok || v < 0 || v > 1e9 {
			return nil, errors.New("Enter a valid quantity on every line.")
		}
		v = round3(v)
		old := fnum(l[key])
		if v != old {
			changed = true
		}
		before, after = append(before, old), append(after, v)
		m[key] = v
		lines = append(lines, m)
	}
	if !changed {
		return nil, errors.New("Nothing was changed.")
	}
	out := shallowCopy(ex)
	out["lines"] = lines
	if col == "dispatches" {
		short, excess := false, false
		for _, l := range lines {
			m := l.(map[string]any)
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
	dec, _ := c["decision"].(map[string]any)
	note := clip(strings.TrimSpace(str(patch, "corrNote")), 500)
	hist, _ := ex["corrections"].([]any)
	out["corrections"] = append(append([]any{}, hist...), map[string]any{"id": cid, "no": str(c, "no"), "at": float64(now), "byName": u.Name,
		"reason": str(c, "reason"), "approvedBy": str(dec, "byName"), "before": before, "after": after, "note": note})
	nc := shallowCopy(c)
	nc["status"] = "done"
	nc["done"] = map[string]any{"at": float64(now), "by": u.ID, "byName": u.Name, "before": before, "after": after, "note": note}
	putDocLocked("corrections", cid, nc)
	return out, nil
}
