package main

// Job work: material placed with a job worker vendor (for example switchgear
// sent to a panel builder). Entries in the "jobwork" collection:
//
//	in      material received by the job worker (from a supplier's PO routed
//	        to him, from the HQ store, or from another supplier)
//	bill    the job worker's bill for the finished product, with the raw
//	        material from his balance that went into it (consumed)
//	return  unused material sent back to the HQ store
//	scrap   wastage / scrap accepted and written off
//
// Balance with the job worker = in - bill - return - scrap, per item.

import (
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
)

func jwKey(l map[string]any) string {
	if k := str(l, "itemKey"); k != "" {
		return k
	}
	return strings.ToLower(strings.TrimSpace(str(l, "desc"))) + "|" + strings.ToLower(strings.TrimSpace(str(l, "spec"))) + "|" + strings.ToLower(str(l, "unit"))
}

// jwBalances returns the unconsumed quantity per item with one job worker,
// leaving out the entry being written (skipID).
func jwBalances(vendorID, skipID string) map[string]float64 {
	bal := map[string]float64{}
	for _, x := range liveLocked("jobwork") {
		if x.ID == skipID || str(x.D, "vendorId") != vendorID || str(x.D, "status") == "cancelled" {
			continue
		}
		sign := 0.0
		switch str(x.D, "type") {
		case "in":
			sign = 1
		case "bill", "return", "scrap":
			sign = -1
		}
		for _, l := range subList(x.D, "lines") {
			bal[jwKey(l)] += sign * fnum(l["qty"])
		}
	}
	return bal
}

// checkJobwork keeps the job worker's balance from going below zero, so the
// same material can never be consumed (or returned) twice.
func checkJobwork(id string, nd map[string]any) error {
	if nd == nil {
		return nil
	}
	vid := str(nd, "vendorId")
	if vid == "" || docData("vendors", vid) == nil {
		return errors.New("Choose the job worker.")
	}
	typ := str(nd, "type")
	switch typ {
	case "in", "bill", "return", "scrap":
	default:
		return errors.New("Unknown job-work entry.")
	}
	lines := subList(nd, "lines")
	for _, l := range lines {
		if q := fnum(l["qty"]); q < 0 || math.IsNaN(q) {
			return errors.New("Quantities cannot be negative.")
		}
	}
	if typ != "bill" && len(lines) == 0 {
		return errors.New("Enter at least one item.")
	}
	bal := jwBalances(vid, id)
	if str(nd, "status") == "cancelled" {
		if typ == "in" { // cancelling a receipt must not leave consumed material uncovered
			for _, l := range lines {
				k := jwKey(l)
				if bal[k] < -1e-6 {
					return fmt.Errorf("%s from this receipt is already used or returned. Cancel those entries first.", str(l, "desc"))
				}
			}
		}
		return nil
	}
	if typ == "in" {
		return nil
	}
	need := map[string]float64{}
	names := map[string]string{}
	for _, l := range lines {
		k := jwKey(l)
		need[k] += fnum(l["qty"])
		names[k] = str(l, "desc")
	}
	keys := make([]string, 0, len(need))
	for k := range need {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if need[k] > bal[k]+1e-6 {
			return fmt.Errorf("%s: only %g is with this job worker, %g entered.", names[k], math.Max(0, math.Round(bal[k]*1000)/1000), need[k])
		}
	}
	return nil
}

// jobworkSheets are the "Vendor material account" sheets of the Excel backup.
func jobworkSheets() []xSheet {
	vname := func(id string) string {
		if v := docData("vendors", id); v != nil {
			return str(v, "name")
		}
		return id
	}
	typeName := map[string]string{"in": "Received by job worker", "bill": "Used in job worker's bill", "return": "Returned to HQ store", "scrap": "Wastage / scrap"}
	srcName := map[string]string{"po": "Supplier PO", "store": "HQ store", "other": "Other supplier"}
	rows := [][]any{{"Entry no", "Date", "Job worker", "Entry", "Source", "Supplier", "PO", "Supplier billed to", "Job worker bill no", "Bill date", "Finished product", "Product qty", "Item", "Specification", "Unit", "Qty", "Rate", "Status", "Challan / invoice", "Remarks"}}
	type acc struct {
		vendor, desc, spec, unit string
		in, used, ret, scrap     float64
	}
	bal := map[string]*acc{}
	list := liveLocked("jobwork")
	sort.Slice(list, func(i, j int) bool {
		return str(list[i].D, "date") < str(list[j].D, "date") || (str(list[i].D, "date") == str(list[j].D, "date") && fnum(list[i].D["at"]) < fnum(list[j].D["at"]))
	})
	for _, x := range list {
		e := x.D
		cancelled := str(e, "status") == "cancelled"
		billTo := ""
		switch str(e, "billTo") {
		case "fab":
			billTo = "Job worker"
		case "us":
			billTo = "Us (free issue)"
		}
		prod, _ := e["product"].(map[string]any)
		st := "Active"
		if cancelled {
			st = "Cancelled"
		}
		for _, l := range subList(e, "lines") {
			var rate any
			if v, ok := l["rate"]; ok && v != nil && v != "" {
				rate = fnum(v)
			}
			rows = append(rows, []any{str(e, "no"), str(e, "date"), vname(str(e, "vendorId")), typeName[str(e, "type")], srcName[str(e, "source")], str(e, "supplierName"), str(e, "poNo"), billTo, str(e, "billNo"), str(e, "billDate"), str(prod, "desc"), fnum(prod["qty"]), str(l, "desc"), str(l, "spec"), str(l, "unit"), fnum(l["qty"]), rate, st, strings.Trim(str(e, "challan")+" / "+str(e, "invoice"), " /"), str(e, "remarks")})
			if cancelled {
				continue
			}
			k := str(e, "vendorId") + "#" + jwKey(l)
			a := bal[k]
			if a == nil {
				a = &acc{vendor: vname(str(e, "vendorId")), desc: str(l, "desc"), spec: str(l, "spec"), unit: str(l, "unit")}
				bal[k] = a
			}
			q := fnum(l["qty"])
			switch str(e, "type") {
			case "in":
				a.in += q
			case "bill":
				a.used += q
			case "return":
				a.ret += q
			case "scrap":
				a.scrap += q
			}
		}
	}
	brows := [][]any{{"Job worker", "Item", "Specification", "Unit", "Received", "Used in bills", "Returned", "Wastage / scrap", "Unconsumed balance"}}
	keys := make([]string, 0, len(bal))
	for k := range bal {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		a, b := bal[keys[i]], bal[keys[j]]
		return a.vendor < b.vendor || (a.vendor == b.vendor && a.desc < b.desc)
	})
	for _, k := range keys {
		a := bal[k]
		brows = append(brows, []any{a.vendor, a.desc, a.spec, a.unit, a.in, a.used, a.ret, a.scrap, math.Round((a.in-a.used-a.ret-a.scrap)*1000) / 1000})
	}
	return []xSheet{{"Material with job workers", brows}, {"Job worker movements", rows}}
}
