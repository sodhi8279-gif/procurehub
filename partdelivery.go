package main

// Part deliveries and closing a PO short.
//
// A PO for cement, TMT and the like is often delivered in several vehicles.
// For direct-to-site POs each delivery (DD) is received one vehicle at a
// time: when the site receives part of it and says more is coming, this
// receipt keeps only what came on this vehicle (with its own bill and
// challan) and a new pending delivery is made for the balance. The PO's
// received quantity and balance come from all its receipts.
//
// When the rest will not come, HQ closes the PO short: pending deliveries
// are cancelled and the PO and its demand lines show as closed.

import (
	"fmt"
	"math"
	"strings"
)

func round3(x float64) float64 { return math.Round(x*1000) / 1000 }

// directReceiptLocked finalises the receipt of a direct-from-vendor delivery
// (site or HQ user). Lines carry recvQty and, optionally, supQty (quantity as
// per the vendor's challan/invoice for this vehicle). With moreToCome, the
// balance becomes a new pending delivery.
func directReceiptLocked(id string, x, ex map[string]any, now int64) {
	if ex == nil || str(x, "type") != "direct" {
		return
	}
	if s := str(x, "status"); s != "delivered" && s != "short" {
		return
	}
	if es := str(ex, "status"); es != "ordered" && es != "in_transit" {
		return
	}
	more := x["moreToCome"] == true
	delete(x, "moreToCome")
	type ln struct {
		m              map[string]any
		exp, sup, recv float64
	}
	var ls []ln
	for _, l := range subList(x, "lines") {
		m := shallowCopy(l)
		exp := fnum(m["qty"])
		recv := fnum(m["recvQty"])
		sup := recv
		if v, ok := m["supQty"]; ok && v != nil && fmt.Sprint(v) != "" {
			sup = fnum(v)
		}
		ls = append(ls, ln{m, exp, round3(sup), round3(recv)})
	}
	if len(ls) == 0 {
		return
	}
	var balLines []any
	if more {
		for _, l := range ls {
			if b := round3(l.exp - l.sup); b > 1e-9 {
				nl := shallowCopy(l.m)
				for _, k := range []string{"supQty", "ordQty", "recvQty"} {
					delete(nl, k)
				}
				nl["qty"], nl["recvQty"] = b, nil
				balLines = append(balLines, nl)
			}
		}
	}
	short, excess := false, false
	var out []any
	for _, l := range ls {
		m := l.m
		if len(balLines) > 0 {
			// this receipt keeps only what came on this vehicle
			if l.sup == 0 && l.recv == 0 && len(ls) > 1 {
				continue
			}
			delete(m, "ordQty")
			m["qty"], m["supQty"] = l.sup, l.sup
		} else if l.sup != l.exp {
			// nothing more coming: the vendor's quantity replaces the expected one, which is kept as ordQty
			if m["ordQty"] == nil {
				m["ordQty"] = l.exp
			}
			m["qty"], m["supQty"] = l.sup, l.sup
		}
		m["recvQty"] = l.recv
		if l.recv+1e-9 < fnum(m["qty"]) {
			short = true
		}
		if l.recv > fnum(m["qty"])+1e-9 {
			excess = true
		}
		out = append(out, m)
	}
	if len(out) == 0 { // nothing at all came on this vehicle
		return
	}
	x["lines"] = out
	if short {
		x["status"] = "short"
		delete(x, "excess")
	} else {
		x["status"] = "delivered"
		if excess {
			x["excess"] = true
		} else {
			delete(x, "excess")
		}
	}
	if len(balLines) == 0 {
		return
	}
	root := str(x, "rootId")
	base := str(x, "baseNo")
	if root == "" {
		root = id
		x["rootId"] = id
	}
	if base == "" {
		base = str(x, "no")
	}
	n := 1
	for _, d := range st.Cols["dispatches"] {
		if d != nil && !d.Deleted && d.Data != nil && str(d.Data, "baseNo") == base {
			n++
		}
	}
	if x["partNo"] == nil {
		x["partNo"] = float64(n)
		n++
	}
	x["baseNo"] = base
	bal := map[string]any{"status": "ordered", "at": now, "date": str(x, "date"), "lines": balLines, "baseNo": base, "partNo": float64(n),
		"no": fmt.Sprintf("%s-%d", base, n), "partFrom": str(x, "no")}
	for _, k := range []string{"type", "projectId", "poId", "poNo", "vendorId", "vendorName", "expectedDate", "emergency", "storeId"} {
		if v, ok := x[k]; ok && v != nil {
			bal[k] = v
		}
	}
	bal["rootId"] = root
	bid := newDocID()
	putDocLocked("dispatches", bid, bal)
	x["balanceNo"] = bal["no"]
}

// receipt keys a site may send when receiving a direct delivery
var siteRecvExtra = map[string]bool{"excess": true, "moreToCome": true, "vehicle": true, "vendorChallan": true, "vendorInvoice": true, "entered": true}

// poClosedLocked: when HQ closes a PO short, pending deliveries of it are cancelled.
func poClosedLocked(poID string, po, ex map[string]any, byName string, now int64) int {
	if po == nil || po["closed"] == nil || (ex != nil && ex["closed"] != nil) {
		return 0
	}
	n := 0
	for id, d := range st.Cols["dispatches"] {
		if d == nil || d.Deleted || d.Data == nil || str(d.Data, "poId") != poID || str(d.Data, "type") != "direct" {
			continue
		}
		if s := str(d.Data, "status"); s == "ordered" || s == "in_transit" {
			nd := shallowCopy(d.Data)
			nd["status"], nd["cancelledAt"], nd["note"] = "cancelled", now, "PO "+str(po, "no")+" closed short by "+strings.TrimSpace(byName)
			putDocLocked("dispatches", id, nd)
			n++
		}
	}
	return n
}
