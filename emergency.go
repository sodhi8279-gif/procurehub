package main

// Emergency purchase (7.0).
//
// When a site needs material at once, HQ settles the rate with a registered
// vendor offline (phone or a quotation in hand), buys the material and enters
// it here. One entry creates, together:
//   - a demand (MR) for the site, marked Emergency and already approved,
//   - a purchase order to the vendor, delivered direct to the site,
//   - the consignment the site receives under "Receive material".
// From the PO onwards everything works as for any other purchase: approval by
// the Director (Procurement), emailing the PO, receipt at site with the bill
// and signed challan, returns and reports.
//
// Only the administrator, the Purchase manager, the Director (Procurement) or
// an HQ user given the right "emergency_purchase" may enter one.

import (
	"errors"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"strings"
	"time"
)

func canEmergency(u *User) bool {
	if u == nil || u.Role != "hq" {
		return false
	}
	if isAdmin(u) || can(u, "emergency_purchase") || can(u, "po_approve") {
		return true
	}
	return u.Access != nil && strings.EqualFold(strings.TrimSpace(u.Access.Role), "Purchase manager")
}

type emgLine struct {
	Desc     string  `json:"desc"`
	Spec     string  `json:"spec"`
	Unit     string  `json:"unit"`
	Category string  `json:"category"`
	ItemKey  string  `json:"itemKey"`
	Qty      float64 `json:"qty"`
	Rate     float64 `json:"rate"`
	GST      float64 `json:"gst"`
	HSN      string  `json:"hsn"`
	Note     string  `json:"note"`
}

type emgReq struct {
	ProjectID    string           `json:"projectId"`
	VendorID     string           `json:"vendorId"`
	Date         string           `json:"date"`
	RequestedBy  string           `json:"requestedBy"`
	Reason       string           `json:"reason"`
	QuoteRef     string           `json:"quoteRef"`
	QuoteDate    string           `json:"quoteDate"`
	Files        []string         `json:"files"`
	DeliveryDays float64          `json:"deliveryDays"`
	ExpectedDate string           `json:"expectedDate"`
	Payment      string           `json:"payment"`
	Freight      float64          `json:"freight"`
	Charges      []map[string]any `json:"charges"`
	RoundOff     float64          `json:"roundOff"`
	RoundAuto    bool             `json:"roundAuto"`
	Terms        string           `json:"terms"`
	Lines        []emgLine        `json:"lines"`
	Shipped      bool             `json:"shipped"`
	Vehicle      string           `json:"vehicle"`
	Driver       string           `json:"driver"`
	LrNo         string           `json:"lrNo"`
}

var emgDateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func r2(x float64) float64 { return math.Round(x*100) / 100 }

// cleanCharges keeps valid "other charges" (loading, unloading, packing…) of a quotation or PO.
func cleanCharges(in []map[string]any) ([]any, error) {
	out := []any{}
	for _, c := range in {
		amt := fnum(c["amt"])
		label := clip(strings.TrimSpace(str(c, "label")), 80)
		if amt == 0 {
			continue
		}
		if label == "" {
			return nil, errors.New("Write what each extra charge is for (e.g. Loading & unloading).")
		}
		when := "before"
		if str(c, "when") == "after" {
			when = "after"
		}
		g := fnum(c["gst"])
		if when == "after" {
			g = 0
		}
		if g < 0 || g > 100 || math.IsNaN(amt) || math.Abs(amt) > 1e9 {
			return nil, errors.New("Check the amount and GST % of " + label + ".")
		}
		out = append(out, map[string]any{"label": label, "amt": r2(amt), "when": when, "gst": g})
	}
	return out, nil
}

func hEmergency(w http.ResponseWriter, r *http.Request, u *User) {
	if r.Method != http.MethodPost {
		fail(w, 405, "Use POST.")
		return
	}
	if !canEmergency(u) {
		fail(w, 403, "Only the Purchase manager, the Director (Procurement) or the administrator can enter an emergency purchase.")
		return
	}
	var q emgReq
	if !readJSON(w, r, &q, 1<<20) {
		return
	}
	q.Reason = clip(strings.TrimSpace(q.Reason), 500)
	q.RequestedBy = clip(strings.TrimSpace(q.RequestedBy), 120)
	q.QuoteRef = clip(strings.TrimSpace(q.QuoteRef), 120)
	q.Payment = clip(strings.TrimSpace(q.Payment), 200)
	q.Terms = clip(q.Terms, 6000)
	if !emgDateRe.MatchString(q.Date) {
		q.Date = time.Now().Format("2006-01-02")
	}
	if q.QuoteDate != "" && !emgDateRe.MatchString(q.QuoteDate) {
		q.QuoteDate = ""
	}
	if q.ExpectedDate != "" && !emgDateRe.MatchString(q.ExpectedDate) {
		q.ExpectedDate = ""
	}
	if q.Reason == "" {
		fail(w, 400, "Write why this is an emergency purchase.")
		return
	}
	if len(q.Lines) == 0 {
		fail(w, 400, "Add at least one item.")
		return
	}
	if q.Freight < 0 || q.DeliveryDays < 0 || math.Abs(q.RoundOff) > 1000 {
		fail(w, 400, "Check the freight, delivery days and round off.")
		return
	}
	charges, err := cleanCharges(q.Charges)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	for i := range q.Lines {
		l := &q.Lines[i]
		l.Desc, l.Spec, l.Unit = clip(strings.TrimSpace(l.Desc), 200), clip(strings.TrimSpace(l.Spec), 200), clip(strings.TrimSpace(l.Unit), 20)
		l.HSN, l.Note = clip(strings.TrimSpace(l.HSN), 12), clip(strings.TrimSpace(l.Note), 300)
		if l.Desc == "" {
			fail(w, 400, fmt.Sprintf("Enter the item on line %d.", i+1))
			return
		}
		if l.Unit == "" {
			l.Unit = "Nos"
		}
		if !(l.Qty > 0) || !(l.Rate > 0) || l.GST < 0 || l.GST > 100 {
			fail(w, 400, "Check the quantity, rate and GST % of "+l.Desc+".")
			return
		}
		if l.Category == "" {
			l.Category = "others"
		}
		if l.ItemKey == "" {
			l.ItemKey = keyOf(l.Desc, l.Spec, l.Unit)
		}
	}
	files := []any{}
	for _, f := range q.Files {
		if f = strings.TrimSpace(f); f != "" && len(files) < 10 {
			files = append(files, clip(f, 120))
		}
	}

	mu.Lock()
	defer mu.Unlock()
	p := docData("projects", q.ProjectID)
	if p == nil || p["active"] == false {
		fail(w, 400, "Choose the site.")
		return
	}
	if !inScope(u, q.ProjectID) {
		fail(w, 403, "This site is not one of the sites given to you.")
		return
	}
	v := docData("vendors", q.VendorID)
	if v == nil {
		fail(w, 400, "Choose a registered vendor.")
		return
	}
	now := time.Now().UnixMilli()
	indID, poID, ddID := "em"+randHex(6), "em"+randHex(6), "em"+randHex(6)
	mrNo, poNo, ddNo := nextNo("MR"), nextNo("PO"), nextNo("DD")
	vName := str(v, "name")
	payment := firstNonEmpty(q.Payment, str(v, "payment"))

	var indLines, poLines, ddLines []any
	for i, l := range q.Lines {
		lid, key := "em"+randHex(5), fmt.Sprintf("e%d", i+1)
		indLines = append(indLines, map[string]any{"id": lid, "desc": l.Desc, "spec": l.Spec, "qty": l.Qty, "unit": l.Unit, "category": l.Category, "catSrc": "manual",
			"siteNote": l.Note, "photo": "", "status": "approved", "approvedQty": l.Qty, "approvedAt": now, "approvalNote": "Emergency purchase by HQ",
			"decidedBy": u.ID, "decidedByName": u.Name, "poId": poID, "poNo": poNo, "poAt": now, "vendorName": vName, "expectedDate": q.ExpectedDate, "orderedQty": l.Qty})
		src := map[string]any{"indentId": indID, "lineId": lid, "projectId": q.ProjectID, "qty": l.Qty, "mrNo": mrNo}
		poLines = append(poLines, map[string]any{"key": key, "desc": l.Desc, "spec": l.Spec, "unit": l.Unit, "cat": l.Category, "qty": l.Qty, "rate": l.Rate, "gst": l.GST,
			"hsn": l.HSN, "itemKey": l.ItemKey, "srcs": []any{src}})
		ddLines = append(ddLines, map[string]any{"poKey": key, "itemKey": l.ItemKey, "desc": l.Desc, "spec": l.Spec, "unit": l.Unit, "cat": l.Category, "qty": l.Qty,
			"indentId": indID, "lineId": lid, "mrNo": mrNo, "recvQty": nil})
	}
	emg := map[string]any{"poId": poID, "poNo": poNo, "vendorId": q.VendorID, "vendorName": vName, "quoteRef": q.QuoteRef, "quoteDate": q.QuoteDate,
		"reason": q.Reason, "by": u.ID, "byName": u.Name, "at": now}

	putDocLocked("indents", indID, map[string]any{"no": mrNo, "projectId": q.ProjectID, "date": q.Date, "requiredBy": q.Date, "priority": "Emergency", "emergency": emg,
		"requestedBy": q.RequestedBy, "remarks": q.Reason, "createdBy": u.ID, "createdByName": u.Name, "raisedByHQ": true, "at": now, "lines": indLines})

	po := map[string]any{"no": poNo, "rfqId": "", "rfqNo": "", "emergency": true, "indentId": indID, "mrNo": mrNo, "quoteRef": q.QuoteRef, "quoteDate": q.QuoteDate,
		"quoteFiles": files, "emergencyReason": q.Reason, "vendorId": q.VendorID, "vendorName": vName, "date": q.Date, "deliveryMode": "site",
		"deliveryDays": "", "payment": payment, "freight": r2(q.Freight), "charges": charges, "roundOff": r2(q.RoundOff), "roundAuto": q.RoundAuto,
		"terms": q.Terms, "lines": poLines, "received": map[string]any{}, "status": "issued", "at": now, "createdBy": u.ID, "createdByName": u.Name}
	if q.DeliveryDays > 0 {
		po["deliveryDays"] = q.DeliveryDays
	}
	if poApprovalOn() {
		if can(u, "po_approve") && u.Sign != "" {
			// entered by the Director (Procurement) himself: his entry is his approval
			po["approval"] = map[string]any{"status": "approved", "by": u.ID, "byName": u.Name, "designation": firstNonEmpty(u.Designation, "Director (Procurement)"),
				"sign": u.Sign, "at": now, "remark": "Emergency purchase entered and approved by the approver", "since": now}
		} else {
			po["approval"] = map[string]any{"status": "pending", "since": now}
		}
	}
	putDocLocked("pos", poID, po)

	dd := map[string]any{"no": ddNo, "type": "direct", "emergency": true, "projectId": q.ProjectID, "poId": poID, "poNo": poNo, "vendorName": vName, "date": q.Date,
		"expectedDate": q.ExpectedDate, "status": "ordered", "at": now, "lines": ddLines}
	if q.Shipped {
		dd["status"], dd["shippedAt"] = "in_transit", now
		dd["vehicle"], dd["driver"], dd["lrNo"] = clip(q.Vehicle, 40), clip(q.Driver, 80), clip(q.LrNo, 60)
	}
	putDocLocked("dispatches", ddID, dd)

	st.Audit = append(st.Audit, AuditEntry{At: now, User: u.Username, Name: u.Name, Col: "pos", ID: poID, Op: "set", Ref: poNo,
		Keys: "emergency purchase · " + mrNo + " · " + ddNo + " · " + str(p, "code")})
	if err := saveLocked(); err != nil {
		fail(w, 500, "The server could not save to disk: "+err.Error())
		return
	}
	notifyLocked()
	writeJSON(w, 200, map[string]any{"ok": true, "indentId": indID, "mrNo": mrNo, "poId": poID, "poNo": poNo, "dispatchId": ddID, "ddNo": ddNo,
		"approval": str(func() map[string]any { a, _ := po["approval"].(map[string]any); return a }(), "status")})
}
