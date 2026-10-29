package main

// Site consumption reports.
//
// The site project manager reports material consumed at site with a
// description of the work and remarks. The report reduces site stock only
// after the site head / project manager (a site login marked "site head") or
// an HQ person with the right "consume_auth" authenticates it. Nobody
// authenticates a report they made themselves.

import (
	"errors"
	"strings"
	"time"
)

var consEditable = map[string]bool{"description": true, "remarks": true, "lines": true, "date": true, "location": true, "photos": true, "at": true}

func consumptionGuard(u *User, ex, patch, nd map[string]any) error {
	now := time.Now().UnixMilli()
	if ex == nil { // new report
		desc := strings.TrimSpace(str(nd, "description"))
		if desc == "" {
			return errors.New("Describe the consumption (work done / where the material was used).")
		}
		nd["description"] = clip(desc, 2000)
		nd["remarks"] = clip(str(nd, "remarks"), 2000)
		if str(nd, "projectId") == "" {
			return errors.New("Choose the project.")
		}
		lines := anyList(nd["lines"])
		if len(lines) == 0 {
			return errors.New("Add at least one item consumed.")
		}
		for _, li := range lines {
			m, ok := li.(map[string]any)
			if !ok || strings.TrimSpace(str(m, "desc")) == "" {
				return errors.New("Invalid item line.")
			}
			if q, _ := m["qty"].(float64); !(q > 0) {
				return errors.New("Enter the quantity consumed for " + str(m, "desc") + ".")
			}
		}
		nd["status"] = "pending"
		nd["reportedBy"], nd["reportedByName"], nd["reportedAt"] = u.ID, u.Name, now
		delete(nd, "auth")
		return nil
	}
	cur := str(ex, "status")
	if _, ok := patch["status"]; ok {
		want := str(patch, "status")
		for k := range patch {
			if k != "status" && k != "authRemark" {
				return errors.New("Authenticate or reject the report on its own.")
			}
		}
		if cur != "pending" {
			return errors.New("This consumption report has already been " + cur + ".")
		}
		if want != "authenticated" && want != "rejected" {
			return errors.New("Unknown step.")
		}
		allowed := false
		desig := u.Designation
		if u.Role == "site" {
			allowed = u.SiteHead && u.ProjectID == str(ex, "projectId")
			if desig == "" {
				desig = "Site head / Project manager"
			}
		} else {
			allowed = can(u, "consume_auth") && inScope(u, str(ex, "projectId"))
			if desig == "" {
				desig = "HQ"
			}
		}
		if !allowed {
			return errors.New("Only the site head / project manager of this site can authenticate consumption.")
		}
		if str(ex, "reportedBy") == u.ID {
			return errors.New("You reported this consumption, so another person (the site head / project manager) must authenticate it.")
		}
		remark := clip(str(patch, "authRemark"), 500)
		if want == "rejected" && remark == "" {
			return errors.New("Write why the report is rejected.")
		}
		delete(nd, "authRemark")
		nd["status"] = want
		nd["auth"] = map[string]any{"by": u.ID, "byName": u.Name, "designation": desig, "at": now, "remark": remark}
		return nil
	}
	// corrections by the reporter (or HQ) while still pending
	if cur != "pending" {
		return errors.New("This consumption report is " + cur + " and can no longer be changed.")
	}
	if u.Role == "site" && str(ex, "reportedBy") != u.ID {
		return errors.New("Only the person who reported it can correct this report.")
	}
	for k := range patch {
		if !consEditable[k] {
			return errors.New("This part of the report cannot be changed.")
		}
	}
	for _, k := range []string{"status", "reportedBy", "reportedByName", "reportedAt", "auth", "no", "projectId"} {
		if v, ok := ex[k]; ok {
			nd[k] = v
		} else {
			delete(nd, k)
		}
	}
	if strings.TrimSpace(str(nd, "description")) == "" {
		return errors.New("Describe the consumption.")
	}
	if len(anyList(nd["lines"])) == 0 {
		return errors.New("Add at least one item consumed.")
	}
	return nil
}
