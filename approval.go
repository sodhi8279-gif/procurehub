package main

// Approval by the Director (Procurement).
//
// Purchase orders and site transfer indents (a transfer of material from one
// site to another, raised by HQ instead of a purchase) are made as drafts.
// A person with the right "po_approve" approves them with his own signature
// and stamp image, or sends them back. Until approved, a purchase order cannot
// be emailed to the vendor or received against, and a site transfer indent
// cannot be dispatched by the sending site. Changing the substance of an
// approved document sends it for approval again.

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// poApprovalOn: Settings → Purchase order approval (on unless switched off).
func poApprovalOn() bool {
	cfg := docData("config", "main")
	if v, ok := cfg["poApproval"].(bool); ok {
		return v
	}
	return true
}

// poApproved: documents made before approval existed have no approval record
// and stay valid.
func poApproved(d map[string]any) bool {
	a, ok := d["approval"].(map[string]any)
	if !ok || a == nil {
		return true
	}
	return str(a, "status") == "approved"
}

func isTransfer(col string, d map[string]any) bool {
	return col == "dispatches" && str(d, "type") == "transfer"
}

// what makes up the substance of a document; changing it after approval
// needs a fresh approval.
var approvalKeys = map[string][]string{
	"pos":        {"lines", "freight", "deliveryMode", "deliveryDays", "payment", "terms", "vendorId", "shipToVendorId", "jwBillTo"},
	"dispatches": {"lines", "fromProjectId", "projectId"},
}

func sameJSON(a, b any) bool {
	return jsonEq(a, b)
}

// approvalGuard runs for every write by anyone on pos and transfer dispatches.
func approvalGuard(u *User, op, col string, ex, patch, nd map[string]any) error {
	if col != "pos" && col != "dispatches" {
		return nil
	}
	if op == "delete" || nd == nil {
		return nil
	}
	if col == "dispatches" && !isTransfer(col, nd) && !(ex != nil && isTransfer(col, ex)) {
		return nil
	}
	now := time.Now().UnixMilli()
	label := "purchase order"
	if col == "dispatches" {
		label = "site transfer indent"
	}
	if op == "set" && ex == nil {
		delete(nd, "approval")
		if u.Role == "hq" {
			nd["createdBy"], nd["createdByName"] = u.ID, u.Name
		}
		if poApprovalOn() {
			nd["approval"] = map[string]any{"status": "pending", "since": now}
		}
		return nil
	}
	if ex == nil {
		return nil
	}
	exA, _ := ex["approval"].(map[string]any)
	if ap, touched := patch["approval"]; touched {
		req, _ := ap.(map[string]any)
		want := str(req, "status")
		remark := strings.TrimSpace(str(req, "remark"))
		if len(remark) > 500 {
			remark = remark[:500]
		}
		cur := str(exA, "status")
		switch want {
		case "approved":
			if err := need(u, "po_approve"); err != nil {
				return errors.New("Only the Director (Procurement) can approve a " + label + ".")
			}
			if cur != "pending" {
				return errors.New("This " + label + " is not waiting for approval.")
			}
			if by := str(ex, "createdBy"); by != "" && by == u.ID {
				return errors.New("You made this " + label + ", so another person must approve it.")
			}
			if u.Sign == "" {
				return errors.New("Upload your signature with stamp first (My account → Signature & stamp).")
			}
			nd["approval"] = map[string]any{"status": "approved", "by": u.ID, "byName": u.Name, "designation": firstNonEmpty(u.Designation, "Director (Procurement)"),
				"sign": u.Sign, "at": now, "remark": remark, "since": exA["since"]}
		case "returned":
			if err := need(u, "po_approve"); err != nil {
				return errors.New("Only the Director (Procurement) can send a " + label + " back.")
			}
			if cur != "pending" {
				return errors.New("This " + label + " is not waiting for approval.")
			}
			if remark == "" {
				return errors.New("Write why it is sent back.")
			}
			nd["approval"] = map[string]any{"status": "returned", "by": u.ID, "byName": u.Name, "at": now, "remark": remark}
		case "pending":
			if err := need(u, "po_issue", "po_approve", "store"); err != nil {
				return err
			}
			if cur != "returned" {
				return errors.New("Only a " + label + " that was sent back can be sent for approval again.")
			}
			nd["approval"] = map[string]any{"status": "pending", "since": now, "remark": remark, "resubmittedBy": u.Name}
		default:
			return errors.New("Unknown approval step.")
		}
		return nil
	}
	// substance changed after approval → approve again
	if exA != nil && str(exA, "status") == "approved" && poApprovalOn() {
		var changed []string
		for _, k := range approvalKeys[col] {
			if v, ok := patch[k]; ok && !sameJSON(v, ex[k]) {
				changed = append(changed, k)
			}
		}
		if len(changed) > 0 {
			sort.Strings(changed)
			nd["approval"] = map[string]any{"status": "pending", "since": now, "remark": "Changed after approval (" + strings.Join(changed, ", ") + ") by " + u.Name}
		}
	} else if exA != nil {
		nd["approval"] = exA // only the approval steps above may change it
	}
	// a transfer may leave the sending site only once approved
	if col == "dispatches" && str(ex, "status") == "to_send" && str(nd, "status") == "in_transit" && !poApproved(ex) {
		return errors.New("This site transfer indent is waiting for approval by the Director (Procurement). It cannot be dispatched yet.")
	}
	return nil
}

// receiptGuard: nothing may be received against an unapproved purchase order.
func receiptGuard(col string, ex, nd map[string]any) error {
	if nd == nil {
		return nil
	}
	poID := ""
	switch col {
	case "grns":
		if ex == nil {
			poID = str(nd, "poId")
		}
	case "jobwork":
		if ex == nil && str(nd, "type") == "in" && str(nd, "source") == "po" {
			poID = str(nd, "poId")
		}
	case "dispatches": // vendor delivering direct to a site against a PO
		if ex != nil && str(ex, "type") == "direct" && str(ex, "status") != str(nd, "status") {
			if s := str(nd, "status"); s == "in_transit" || s == "delivered" || s == "short" {
				poID = str(ex, "poId")
			}
		}
	}
	if poID == "" {
		return nil
	}
	if po := docData("pos", poID); po != nil && !poApproved(po) {
		return errors.New("This purchase order is waiting for approval by the Director (Procurement). Nothing can be received against it yet.")
	}
	return nil
}

// signature with stamp, uploaded by the approver in My account
func hMySign(w http.ResponseWriter, r *http.Request, u *User) {
	var req struct{ Sign, Designation string }
	if !readJSON(w, r, &req, 1<<12) {
		return
	}
	if !can(u, "po_approve") {
		fail(w, 403, "Only the Director (Procurement) uploads a signature for approvals.")
		return
	}
	if !fileIDRe.MatchString(req.Sign) || !strings.HasSuffix(req.Sign, ".png") && !strings.HasSuffix(req.Sign, ".jpg") && !strings.HasSuffix(req.Sign, ".webp") {
		fail(w, 400, "Upload a photo or scan (PNG or JPG) of the signature with stamp.")
		return
	}
	if _, err := os.Stat(filepath.Join(filesDir, req.Sign)); err != nil {
		fail(w, 400, "The image was not uploaded. Try again.")
		return
	}
	mu.Lock()
	x := st.Users[u.ID]
	if x == nil {
		mu.Unlock()
		fail(w, 404, "User not found.")
		return
	}
	x.Sign = req.Sign
	x.Designation = clip(strings.TrimSpace(req.Designation), 80)
	st.Audit = append(st.Audit, AuditEntry{At: time.Now().UnixMilli(), User: u.Username, Name: u.Name, Col: "users", ID: u.ID, Op: "update", Ref: u.Username, Keys: "signature & stamp"})
	saveLocked()
	out := publicUser(x)
	mu.Unlock()
	writeJSON(w, 200, map[string]any{"ok": true, "user": out})
}

var fileRefRe = regexp.MustCompile(`src="(?:https?://[^"/]+)?/files/([a-f0-9]{24}\.(?:png|jpg|webp))"`)

// inlineFiles puts the images an HTML mail refers to (logo, signature and
// stamp) inside the mail, so the vendor sees them without reaching our server.
func inlineFiles(html string) (string, []mailAttachment) {
	var atts []mailAttachment
	seen := map[string]string{}
	out := fileRefRe.ReplaceAllStringFunc(html, func(m string) string {
		id := fileRefRe.FindStringSubmatch(m)[1]
		if cid, ok := seen[id]; ok {
			return `src="cid:` + cid + `"`
		}
		b, err := os.ReadFile(filepath.Join(filesDir, id))
		if err != nil || len(b) > 4<<20 {
			return m
		}
		cid := strings.TrimSuffix(id, filepath.Ext(id)) + "@procurehub"
		seen[id] = cid
		atts = append(atts, mailAttachment{Name: id, Type: fileTypes[filepath.Ext(id)], Data: b, CID: cid})
		return `src="cid:` + cid + `"`
	})
	return out, atts
}
