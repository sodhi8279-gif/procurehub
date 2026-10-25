package main

// Pre-check of site demands.
//
// When "Demand pre-check" is switched on in Settings, every new demand waits
// for a person with the "Pre-check demands" permission. That person may edit
// items and quantities, remove items, delete the demand with a reason, or
// pre-approve it. Only then can the approver approve its lines. Demands raised
// before the switch was turned on are not affected.

import (
	"errors"
	"time"
)

func precheckOn() bool {
	cfg := docData("config", "main")
	return cfg != nil && cfg["precheck"] == true
}

func pcStatus(d map[string]any) string {
	pc, _ := d["precheck"].(map[string]any)
	return str(pc, "status")
}

// precheckNew marks a newly raised demand as waiting for pre-check.
func precheckNew(u *User, d map[string]any) {
	delete(d, "precheck")
	delete(d, "pcLog")
	if !precheckOn() {
		return
	}
	// Every new demand is pre-checked, whoever raised it.
	d["precheck"] = map[string]any{"status": "pending", "since": time.Now().UnixMilli()}
}

// precheckGuard applies to every HQ change of a demand, administrators included.
func precheckGuard(u *User, op string, ex, patch, merged map[string]any) error {
	if op == "set" && ex == nil {
		precheckNew(u, merged)
		return nil
	}
	if ex == nil || merged == nil {
		return nil
	}
	// When pre-check is switched on, demands still waiting for approval may be
	// sent to pre-check too (all lines undecided).
	if pcStatus(ex) == "" && pcStatus(merged) == "pending" {
		if !isAdmin(u) && !can(u, "settings") && !can(u, "demands_precheck") {
			return errors.New("You don't have permission to send demands to pre-check.")
		}
		for _, l := range subList(ex, "lines") {
			if s := str(l, "status"); s != "" && s != "pending" {
				return errors.New("This demand has already been partly approved, so it can't go to pre-check.")
			}
		}
		for k := range patch {
			if k != "precheck" {
				return errors.New("Send the demand to pre-check without other changes.")
			}
		}
		merged["precheck"] = map[string]any{"status": "pending", "since": time.Now().UnixMilli(), "movedBy": u.Name, "moved": true}
		return nil
	}
	if pcStatus(ex) != "pending" {
		if _, touched := patch["precheck"]; touched && pcStatus(merged) != pcStatus(ex) {
			return errors.New("This demand has already been pre-checked.")
		}
		// The person who pre-approved a demand cannot also approve it.
		if pc, _ := ex["precheck"].(map[string]any); pc != nil && str(pc, "by") == u.ID {
			old := map[string]string{}
			for _, l := range subList(ex, "lines") {
				old[str(l, "id")] = str(l, "status")
			}
			for _, l := range subList(merged, "lines") {
				if s := str(l, "status"); s != old[str(l, "id")] && (s == "approved" || s == "hold" || (s == "rejected" && l["pcRemoved"] != true)) {
					return errors.New("You pre-approved this demand, so another person must approve it.")
				}
			}
		}
		// A pre-checker's rights end once the demand is pre-checked.
		if !isAdmin(u) && !canAny(u, "demands_approve", "rfq_create", "po_issue", "store", "raise_demand") {
			return errors.New("This demand is no longer waiting for pre-check. Further changes are made by the approver.")
		}
		return nil
	}
	// The demand is waiting for pre-check.
	for k := range patch {
		switch k {
		case "precheck", "lines", "pcLog", "cancelled", "cancelledAt", "cancelReason", "cancelledByName", "pcDeleted", "at":
		default:
			return errors.New("This demand is waiting for pre-check. Pre-check it first.")
		}
	}
	for _, l := range subList(merged, "lines") {
		s := str(l, "status")
		if s != "" && s != "pending" && !(s == "rejected" && l["pcRemoved"] == true) {
			return errors.New("This demand is waiting for pre-check. It can be approved only after a pre-checker pre-approves it.")
		}
	}
	if !can(u, "demands_precheck") {
		return errors.New("This demand is waiting for pre-check. Only a person with the \"Demand pre-checker\" role can change or pre-approve it.")
	}
	if _, touched := patch["precheck"]; touched {
		st := pcStatus(merged)
		if st != "passed" && st != "pending" {
			return errors.New("Invalid pre-check status.")
		}
		if st == "passed" {
			pc, _ := merged["precheck"].(map[string]any)
			pc = shallowCopy(pc)
			pc["at"], pc["by"], pc["byName"] = time.Now().UnixMilli(), u.ID, u.Name
			merged["precheck"] = pc
		}
	}
	if merged["cancelled"] == true && ex["cancelled"] != true {
		merged["cancelledByName"] = u.Name
	}
	return nil
}

// precheckConfigGuard: pre-check can be switched on only when at least one
// active person (not an administrator) has the "Pre-check demands" permission,
// otherwise new demands would wait with nobody to check them.
func precheckConfigGuard(ex, merged map[string]any) error {
	if merged == nil || merged["precheck"] != true || (ex != nil && ex["precheck"] == true) {
		return nil
	}
	for _, x := range st.Users {
		if x.Active && x.Role == "hq" && can(x, "demands_precheck") {
			return nil
		}
	}
	return errors.New("First give someone the \"Demand pre-checker\" role (Settings → HQ team & permissions), then switch pre-check on.")
}
