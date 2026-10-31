package main

// Cash (counter) purchases.
//
// Small items bought for cash at a site, or at HQ for a project, are entered
// by people given the right to spend (HQ right "cash_spend", or a site login
// marked "May make cash purchases"), within their limit per bill. Each entry is
// approved by the approver (right "cash_approve") and then finally by the
// person who grants purchase orders (right "po_approve"). Material consumed
// from it — at once, or later — goes through the same two approvals. Stock
// counts the purchase and its consumption once they are finally approved.

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

var cashEditable = map[string]bool{"date": true, "shop": true, "shopGstin": true, "billNo": true, "billDate": true, "payMode": true, "purpose": true, "lines": true, "photos": true, "useRemarks": true, "at": true}

func cashMaySpend(u *User, d map[string]any) bool {
	if u.Role == "site" {
		return u.CashSpend && str(d, "location") == "site" && str(d, "projectId") == u.ProjectID
	}
	return can(u, "cash_spend") && (str(d, "projectId") == "" || inScope(u, str(d, "projectId")))
}

// cashCheckLines validates the lines and returns the bill total incl. GST.
func cashCheckLines(nd map[string]any) (float64, error) {
	ls := anyList(nd["lines"])
	if len(ls) == 0 {
		return 0, errors.New("Add at least one item.")
	}
	total := 0.0
	for _, li := range ls {
		m, ok := li.(map[string]any)
		if !ok || strings.TrimSpace(str(m, "desc")) == "" {
			return 0, errors.New("Enter the item on every line.")
		}
		q, _ := m["qty"].(float64)
		r, _ := m["rate"].(float64)
		g, _ := m["gst"].(float64)
		un, _ := m["usedNow"].(float64)
		if !(q > 0) || r < 0 || g < 0 || un < 0 || un > q+1e-9 {
			return 0, errors.New("Check the quantity, rate and GST of " + str(m, "desc") + ".")
		}
		amt := q * r * (1 + g/100)
		m["amount"] = float64(int64(amt*100+0.5)) / 100
		total += amt
	}
	total = float64(int64(total*100+0.5)) / 100
	nd["total"] = total
	return total, nil
}

func cashLog(ex, nd map[string]any, e map[string]any) {
	nd["log"] = append(append([]any{}, anyList(ex["log"])...), e)
}

func cashGuard(u *User, ex, patch, nd map[string]any) error {
	now := time.Now().UnixMilli()
	if ex == nil { // new entry
		if !cashMaySpend(u, nd) {
			return errors.New("You have not been given the right to make cash purchases. Ask your administrator.")
		}
		if l := str(nd, "location"); l != "site" && l != "hq" {
			return errors.New("Choose where the material was bought for.")
		}
		if str(nd, "location") == "site" && str(nd, "projectId") == "" {
			return errors.New("Choose the site.")
		}
		if strings.TrimSpace(str(nd, "shop")) == "" || strings.TrimSpace(str(nd, "purpose")) == "" {
			return errors.New("Enter the shop and the purpose of the purchase.")
		}
		total, err := cashCheckLines(nd)
		if err != nil {
			return err
		}
		if u.CashLimit > 0 && total > u.CashLimit+0.005 {
			return fmt.Errorf("This bill (₹%.2f) is above your cash purchase limit of ₹%.2f per bill. Ask HQ.", total, u.CashLimit)
		}
		for _, k := range []string{"appr", "fin", "uses", "log", "returnNote"} {
			delete(nd, k)
		}
		nd["status"], nd["by"], nd["byName"], nd["enteredAt"] = "pending", u.ID, u.Name, now
		nd["log"] = []any{map[string]any{"type": "entered", "by": u.Name, "at": now}}
		return nil
	}
	status := str(ex, "status")
	// approval steps on the purchase or on one of its consumption entries
	if st, ok := patch["step"].(map[string]any); ok {
		for k := range patch {
			if k != "step" {
				return errors.New("Approve or return on its own.")
			}
		}
		delete(nd, "step")
		action, remark, useID := str(st, "action"), clip(str(st, "remark"), 500), str(st, "useId")
		target, uses := ex, anyList(ex["uses"])
		idx := -1
		if useID != "" {
			for i, x := range uses {
				if m, _ := x.(map[string]any); str(m, "id") == useID {
					idx, target = i, m
				}
			}
			if idx < 0 {
				return errors.New("This consumption entry no longer exists.")
			}
		}
		cur := str(target, "status")
		res := shallowCopy(target)
		appr, _ := target["appr"].(map[string]any)
		switch action {
		case "approve":
			if cur != "pending" {
				return errors.New("This is not waiting for the approver.")
			}
			if !can(u, "cash_approve") {
				return errors.New("Only the approver of cash purchases can approve this.")
			}
			if str(target, "by") == u.ID {
				return errors.New("You entered this, so another person must approve it.")
			}
			res["status"], res["appr"] = "approved", map[string]any{"by": u.ID, "byName": u.Name, "at": now, "remark": remark}
		case "final":
			if cur != "approved" {
				return errors.New("This is not waiting for final approval.")
			}
			if !can(u, "po_approve") {
				return errors.New("Only the person who grants purchase orders gives the final approval.")
			}
			if str(target, "by") == u.ID || str(appr, "by") == u.ID {
				return errors.New("You entered or approved this, so another person must give the final approval.")
			}
			res["status"], res["fin"] = "final", map[string]any{"by": u.ID, "byName": u.Name, "designation": firstNonEmpty(u.Designation, "Director (Procurement)"), "sign": u.Sign, "at": now, "remark": remark}
		case "return", "reject":
			if cur != "pending" && cur != "approved" {
				return errors.New("This can no longer be returned or rejected.")
			}
			if (cur == "pending" && !can(u, "cash_approve")) || (cur == "approved" && !can(u, "po_approve")) {
				return errors.New("Only the approver or the final approver can do this.")
			}
			if remark == "" {
				return errors.New("Write the reason.")
			}
			res["status"] = map[string]string{"return": "returned", "reject": "rejected"}[action]
			res["returnNote"] = map[string]any{"by": u.ID, "byName": u.Name, "at": now, "remark": remark}
			if useID != "" && action == "return" {
				res["status"] = "rejected" // a consumption entry is simply made again
			}
		default:
			return errors.New("Unknown step.")
		}
		what := "purchase"
		if useID != "" {
			nu := append([]any{}, uses...)
			nu[idx] = res
			nd["uses"] = nu
			what = "consumption " + str(target, "no")
		} else {
			for k, v := range res {
				nd[k] = v
			}
			if action == "approve" || action == "final" || action == "return" {
				delete(nd, "returnNote")
				if action == "return" || action == "reject" {
					nd["returnNote"] = res["returnNote"]
				}
			}
		}
		cashLog(ex, nd, map[string]any{"type": action, "what": what, "by": u.Name, "at": now, "remark": remark})
		return nil
	}
	// material consumed from it
	if add, ok := patch["addUse"].(map[string]any); ok {
		for k := range patch {
			if k != "addUse" {
				return errors.New("Record the consumption on its own.")
			}
		}
		delete(nd, "addUse")
		if status == "rejected" {
			return errors.New("This cash purchase was rejected.")
		}
		if !(u.Role == "site" && u.ProjectID == str(ex, "projectId")) && !cashMaySpend(u, ex) && str(ex, "by") != u.ID {
			return errors.New("You cannot record consumption for this purchase.")
		}
		remarks := clip(str(add, "remarks"), 1000)
		if remarks == "" {
			return errors.New("Write the remarks about the consumption.")
		}
		qtys, _ := add["qty"].(map[string]any)
		ls := anyList(ex["lines"])
		used := map[int]float64{}
		for i, li := range ls {
			m, _ := li.(map[string]any)
			v, _ := m["usedNow"].(float64)
			used[i] = v
		}
		for _, x := range anyList(ex["uses"]) {
			m, _ := x.(map[string]any)
			if str(m, "status") == "rejected" {
				continue
			}
			q, _ := m["qty"].(map[string]any)
			for k, v := range q {
				var i int
				fmt.Sscan(k, &i)
				f, _ := v.(float64)
				used[i] += f
			}
		}
		clean := map[string]any{}
		for k, v := range qtys {
			var i int
			if _, err := fmt.Sscan(k, &i); err != nil || i < 0 || i >= len(ls) {
				return errors.New("Invalid item.")
			}
			f, _ := v.(float64)
			if f <= 0 {
				continue
			}
			m, _ := ls[i].(map[string]any)
			bought, _ := m["qty"].(float64)
			if used[i]+f > bought+1e-9 {
				return fmt.Errorf("Only %v %s of %s is left from this purchase.", bought-used[i], str(m, "unit"), str(m, "desc"))
			}
			clean[k] = f
		}
		if len(clean) == 0 {
			return errors.New("Enter the quantity consumed.")
		}
		n := len(anyList(ex["uses"])) + 1
		e := map[string]any{"id": "u" + randHex(5), "no": fmt.Sprintf("%s-C%d", str(ex, "no"), n), "date": firstNonEmpty(str(add, "date"), time.Now().Format("2006-01-02")),
			"qty": clean, "remarks": remarks, "status": "pending", "by": u.ID, "byName": u.Name, "at": now}
		nd["uses"] = append(append([]any{}, anyList(ex["uses"])...), e)
		cashLog(ex, nd, map[string]any{"type": "consumption", "what": str(e, "no"), "by": u.Name, "at": now, "remark": remarks})
		return nil
	}
	// correction by the person who entered it, while it is still with the approver or was returned
	if str(ex, "by") != u.ID {
		return errors.New("Only the person who entered this cash purchase can change it.")
	}
	if status != "pending" && status != "returned" {
		return errors.New("This cash purchase is already approved and can no longer be changed.")
	}
	for k := range patch {
		if !cashEditable[k] && k != "resubmit" {
			return errors.New("This part of the cash purchase cannot be changed.")
		}
	}
	for _, k := range []string{"no", "location", "projectId", "by", "byName", "enteredAt", "appr", "fin", "uses", "log", "status", "returnNote"} {
		if v, has := ex[k]; has {
			nd[k] = v
		} else {
			delete(nd, k)
		}
	}
	delete(nd, "resubmit")
	total, err := cashCheckLines(nd)
	if err != nil {
		return err
	}
	if u.CashLimit > 0 && total > u.CashLimit+0.005 {
		return fmt.Errorf("This bill (₹%.2f) is above your cash purchase limit of ₹%.2f per bill.", total, u.CashLimit)
	}
	if status == "returned" && patch["resubmit"] == true {
		nd["status"] = "pending"
		delete(nd, "returnNote")
		cashLog(ex, nd, map[string]any{"type": "resubmitted", "by": u.Name, "at": now})
	}
	return nil
}

// cashUsedFinal: quantity consumed per line, counting only finally approved consumption.
func cashUsedFinal(d map[string]any) map[int]float64 {
	u := map[int]float64{}
	if str(d, "status") != "final" {
		return u
	}
	for i, l := range subList(d, "lines") {
		u[i] = fnum(l["usedNow"])
	}
	for _, x := range subList(d, "uses") {
		if str(x, "status") != "final" {
			continue
		}
		q, _ := x["qty"].(map[string]any)
		for k, v := range q {
			var i int
			if _, err := fmt.Sscan(k, &i); err == nil {
				u[i] += fnum(v)
			}
		}
	}
	return u
}
