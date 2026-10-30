package main

// Sending a demand back to the person who raised it.
//
// The pre-checker or the approver may send a demand back with a remark, so the
// site adds items it forgot, removes items or changes quantities. While it is
// back with the site nothing in it can be approved. The site (or the HQ person
// who raised it) amends it and sends it again. It returns to whoever sent it
// back: to pre-check if the pre-checker sent it back, otherwise straight to the
// approver. Every round is kept in amendLog.

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

func amendOpen(d map[string]any) bool {
	a, _ := d["amend"].(map[string]any)
	return str(a, "status") == "open"
}

// may this person amend (and resend) the demand?
func amendRaiser(u *User, ind map[string]any) bool {
	if u.Role == "site" {
		return u.ProjectID == str(ind, "projectId")
	}
	return str(ind, "createdBy") == u.ID || (ind["raisedByHQ"] == true && can(u, "raise_demand") && inScope(u, str(ind, "projectId")))
}

// amendGuard runs for every write to an existing demand (HQ and site).
func amendGuard(u *User, ex, patch, nd map[string]any) error {
	if ex == nil || nd == nil {
		return nil
	}
	now := time.Now().UnixMilli()
	req, touched := patch["amend"].(map[string]any)
	if _, has := patch["amend"]; has && !touched {
		return errors.New("Invalid request.")
	}
	if _, has := patch["amendLog"]; has {
		nd["amendLog"] = ex["amendLog"] // kept by the server only
	}
	log := func(e map[string]any) {
		l := anyList(ex["amendLog"])
		nd["amendLog"] = append(append([]any{}, l...), e)
	}
	if touched {
		want := str(req, "status")
		note := clip(str(req, "note"), 1000)
		switch want {
		case "open": // send back
			if u.Role != "hq" || !canAny(u, "demands_approve", "demands_precheck") {
				return errors.New("Only the pre-checker or the approver can send a demand back.")
			}
			if amendOpen(ex) {
				return errors.New("This demand is already with the site for amendment.")
			}
			if ex["cancelled"] == true {
				return errors.New("This demand is cancelled.")
			}
			if note == "" {
				return errors.New("Write what the site should change.")
			}
			for _, l := range subList(ex, "lines") {
				if s := str(l, "status"); s == "approved" || str(l, "rfqId") != "" || str(l, "poId") != "" || str(l, "transferId") != "" || l["fromStock"] == true {
					return errors.New("Some items of this demand are already approved. Reopen them first, or reject the items that are not needed.")
				}
			}
			for k := range patch {
				if k != "amend" && k != "at" {
					return errors.New("Send the demand back on its own.")
				}
			}
			// lines on hold go back to undecided
			var ls []any
			for _, l := range subList(ex, "lines") {
				c := shallowCopy(l)
				if str(c, "status") == "hold" {
					c["status"] = "pending"
				}
				ls = append(ls, c)
			}
			if ls != nil {
				nd["lines"] = ls
			}
			stage := "approval"
			if pcStatus(ex) == "pending" {
				stage = "pre-check"
			}
			nd["amend"] = map[string]any{"status": "open", "by": u.ID, "byName": u.Name, "at": now, "note": note, "stage": stage}
			log(map[string]any{"type": "sent back", "by": u.Name, "at": now, "note": note, "stage": stage})
			return nil
		case "resubmitted": // amended and sent again
			if !amendOpen(ex) {
				return errors.New("This demand is not waiting for amendment.")
			}
			if !amendRaiser(u, ex) {
				return errors.New("Only the person who raised the demand can amend it.")
			}
			for k := range patch {
				switch k {
				case "amend", "lines", "remarks", "requiredBy", "priority", "at":
				default:
					return errors.New("This part of the demand cannot be changed.")
				}
			}
			old := map[string]map[string]any{}
			for _, l := range subList(ex, "lines") {
				old[str(l, "id")] = l
			}
			var out []any
			var added, removed, changed []string
			seen := map[string]bool{}
			for _, li := range anyList(nd["lines"]) {
				m, ok := li.(map[string]any)
				if !ok {
					return errors.New("Invalid item line.")
				}
				desc := strings.TrimSpace(str(m, "desc"))
				q, _ := m["qty"].(float64)
				if desc == "" || !(q > 0) {
					return errors.New("Enter the item and quantity on every line.")
				}
				id := str(m, "id")
				if o := old[id]; o != nil && !seen[id] { // existing line: site may change the quantity, size, unit and note
					seen[id] = true
					c := shallowCopy(o)
					for _, k := range []string{"qty", "spec", "unit", "siteNote"} {
						if v, has := m[k]; has {
							c[k] = v
						}
					}
					if c["status"] == "rejected" {
						// a rejected line stays rejected
					} else {
						c["status"] = "pending"
						delete(c, "approvedQty")
					}
					if fmt.Sprint(o["qty"]) != fmt.Sprint(c["qty"]) || str(o, "spec") != str(c, "spec") || str(o, "unit") != str(c, "unit") {
						changed = append(changed, fmt.Sprintf("%s %v→%v %s", desc, o["qty"], c["qty"], str(c, "unit")))
					}
					out = append(out, c)
					continue
				}
				// new line
				c := map[string]any{}
				for _, k := range []string{"desc", "spec", "unit", "qty", "category", "catSrc", "siteNote", "photo"} {
					if v, has := m[k]; has {
						c[k] = v
					}
				}
				c["desc"] = desc
				c["id"] = "a" + randHex(6)
				c["status"] = "pending"
				c["amendAdded"] = true
				added = append(added, fmt.Sprintf("%s %v %s", desc, q, str(c, "unit")))
				out = append(out, c)
			}
			for id, o := range old {
				if !seen[id] {
					removed = append(removed, str(o, "desc"))
				}
			}
			if len(out) == 0 {
				return errors.New("Keep at least one item, or ask HQ to cancel the demand.")
			}
			nd["lines"] = out
			nd["amend"] = map[string]any{"status": "resubmitted", "by": u.ID, "byName": u.Name, "at": now, "note": clip(str(req, "note"), 1000),
				"sentBackBy": str(ex["amend"].(map[string]any), "byName"), "sentBackNote": str(ex["amend"].(map[string]any), "note")}
			log(map[string]any{"type": "amended", "by": u.Name, "at": now, "note": clip(str(req, "note"), 1000),
				"added": strings.Join(added, "; "), "removed": strings.Join(removed, "; "), "changed": strings.Join(changed, "; ")})
			// it goes back to whoever sent it back: the pre-checker or the approver
			stage := str(ex["amend"].(map[string]any), "stage")
			nd["amend"].(map[string]any)["sentBackStage"] = stage
			if stage == "pre-check" && precheckOn() {
				nd["precheck"] = map[string]any{"status": "pending", "since": now, "again": true}
			}
			return nil
		default:
			return errors.New("Unknown step.")
		}
	}
	// while the demand is with the site, nothing in it is decided
	if amendOpen(ex) {
		if pcStatus(nd) != pcStatus(ex) {
			return errors.New("This demand was sent back to the site for amendment. Wait until it is sent again.")
		}
		old := map[string]string{}
		for _, l := range subList(ex, "lines") {
			old[str(l, "id")] = str(l, "status")
		}
		for _, l := range subList(nd, "lines") {
			if s := str(l, "status"); s != old[str(l, "id")] && s != "pending" && !(s == "rejected" && nd["cancelled"] == true) {
				return errors.New("This demand was sent back to the site for amendment. It can be approved after the site sends it again.")
			}
		}
		if _, has := patch["amend"]; !has {
			nd["amend"] = ex["amend"]
		}
	} else if _, has := patch["amend"]; !has {
		if v, ok := ex["amend"]; ok {
			nd["amend"] = v
		}
	}
	return nil
}
