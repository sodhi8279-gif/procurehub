package main

// Backups: daily Excel workbook of every record, daily JSON export, hourly copy
// of the live database, weekly full zip with photos, optional copy to a second
// folder (USB / network / OneDrive / Google Drive) and optional daily email.

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type BackupConf struct {
	Dir          string `json:"dir"`
	Email        string `json:"email"`
	EmailHour    int    `json:"emailHour"`
	LastExcel    int64  `json:"lastExcel"`
	LastExcelRev int64  `json:"lastExcelRev"`
	LastJSON     int64  `json:"lastJson"`
	LastBak      int64  `json:"lastBak"`
	LastBakRev   int64  `json:"lastBakRev"`
	LastFull     int64  `json:"lastFull"`
	LastMirror   int64  `json:"lastMirror"`
	MirrorErr    string `json:"mirrorErr"`
	LastEmail    int64  `json:"lastEmail"`
	LastEmailDay string `json:"lastEmailDay"`
	EmailErr     string `json:"emailErr"`
	LastErr      string `json:"lastErr"`
}

var catNames = map[string]string{"pipes": "Pipes", "fittings": "Fittings", "valves": "Valves", "paints": "Paints & Coatings", "hardware": "Hardware & Fasteners", "safety": "Safety & PPE", "tools": "Tools & Tackles", "electrical": "Electrical", "civil": "Civil Materials", "sewer": "Manholes & Sewer", "pumps": "Pumps & Motors", "meters": "Meters & Instruments", "chemicals": "Chemicals & Consumables", "others": "Others"}

func catName(id string) string {
	if n, ok := catNames[id]; ok {
		return n
	}
	// categories added by the user (Item catalogue → Categories); caller holds mu
	if cfg := docData("config", "main"); cfg != nil {
		for _, c := range subList(cfg, "cats") {
			if str(c, "id") == id {
				return str(c, "name")
			}
		}
	}
	return "Others"
}

func fnum(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case int:
		return float64(x)
	case int64:
		return float64(x)
	case string:
		f, _ := strconv.ParseFloat(strings.ReplaceAll(strings.TrimSpace(x), ",", ""), 64)
		return f
	}
	return 0
}

var nonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

func normS(s string) string {
	return strings.TrimSpace(nonAlnum.ReplaceAllString(strings.ToLower(s), " "))
}

func itemKeyOf(m map[string]any) string {
	if k := str(m, "itemKey"); k != "" {
		return k
	}
	return normS(str(m, "desc")) + "|" + normS(str(m, "spec")) + "|" + strings.ToLower(str(m, "unit"))
}

func msDate(v any) string {
	ms := fnum(v)
	if ms <= 0 {
		return ""
	}
	return time.UnixMilli(int64(ms)).Format("2006-01-02")
}

type rec struct {
	ID string
	D  map[string]any
}

func liveLocked(col string) []rec {
	out := []rec{}
	for id, d := range st.Cols[col] {
		if !d.Deleted && d.Data != nil {
			out = append(out, rec{id, d.Data})
		}
	}
	sort.Slice(out, func(i, j int) bool {
		a, b := fnum(out[i].D["at"]), fnum(out[j].D["at"])
		if a != b {
			return a < b
		}
		return out[i].ID < out[j].ID
	})
	return out
}

func subList(m map[string]any, k string) []map[string]any {
	arr, _ := m[k].([]any)
	out := make([]map[string]any, 0, len(arr))
	for _, x := range arr {
		if mm, ok := x.(map[string]any); ok {
			out = append(out, mm)
		}
	}
	return out
}

type stockRow struct {
	Desc, Spec, Unit, Cat                     string
	Open, Recv, Out, Used, Dmg, Ret, Adj, Min float64
	Cons                                      float64 // authenticated consumption reports
	VRet                                      float64 // returned to vendors
}

func (r *stockRow) bal() float64 {
	return r.Open + r.Recv - r.Out - r.Used - r.Cons - r.VRet - r.Dmg - r.Ret + r.Adj
}

// siteStockLocked mirrors the client's derive(): balance per project and item.
func siteStockLocked() map[string]map[string]*stockRow {
	site := map[string]map[string]*stockRow{}
	row := func(p, k string, l map[string]any) *stockRow {
		m := site[p]
		if m == nil {
			m = map[string]*stockRow{}
			site[p] = m
		}
		r := m[k]
		if r == nil {
			cat := firstNonEmpty(str(l, "cat"), str(l, "category"), "others")
			r = &stockRow{Desc: str(l, "desc"), Spec: str(l, "spec"), Unit: str(l, "unit"), Cat: cat}
			m[k] = r
		}
		return r
	}
	for _, x := range liveLocked("dispatches") {
		d := x.D
		status := str(d, "status")
		if status == "cancelled" {
			continue
		}
		for _, l := range subList(d, "lines") {
			k := itemKeyOf(l)
			if status == "delivered" || status == "short" {
				row(str(d, "projectId"), k, l).Recv += fnum(l["recvQty"])
			}
			if str(d, "type") == "transfer" && str(d, "fromProjectId") != "" && status != "to_send" {
				row(str(d, "fromProjectId"), k, l).Out += fnum(l["qty"])
			}
		}
	}
	for _, x := range liveLocked("sitelog") {
		e := x.D
		r := row(str(e, "projectId"), itemKeyOf(e), e)
		q := fnum(e["qty"])
		switch str(e, "type") {
		case "opening":
			r.Open += q
		case "use":
			r.Used += q
		case "damage":
			r.Dmg += q
		case "return":
			r.Ret += q
		case "adjust":
			r.Adj += q
		}
	}
	for _, x := range liveLocked("cashbuys") {
		if str(x.D, "status") != "final" || str(x.D, "location") != "site" {
			continue
		}
		used := cashUsedFinal(x.D)
		for i, l := range subList(x.D, "lines") {
			r := row(str(x.D, "projectId"), itemKeyOf(l), l)
			r.Recv += fnum(l["qty"])
			r.Cons += used[i]
		}
	}
	for _, x := range liveLocked("vreturns") {
		if str(x.D, "status") == "cancelled" || str(x.D, "from") != "site" {
			continue
		}
		for _, l := range subList(x.D, "lines") {
			row(str(x.D, "projectId"), itemKeyOf(l), l).VRet += fnum(l["qty"])
		}
	}
	for _, x := range liveLocked("consumption") {
		if str(x.D, "status") != "authenticated" {
			continue
		}
		for _, l := range subList(x.D, "lines") {
			row(str(x.D, "projectId"), itemKeyOf(l), l).Cons += fnum(l["qty"])
		}
	}
	for _, x := range liveLocked("stocklvl") {
		e := x.D
		if m := site[str(e, "projectId")]; m != nil {
			if r := m[str(e, "itemKey")]; r != nil {
				r.Min = fnum(e["min"])
			}
		}
	}
	return site
}

// buildWorkbookLocked flattens every collection into spreadsheet sheets. Caller holds mu.
func buildWorkbookLocked() []xSheet {
	projects := map[string]map[string]any{}
	for _, p := range liveLocked("projects") {
		projects[p.ID] = p.D
	}
	pcode := func(id string) string {
		if p := projects[id]; p != nil {
			return firstNonEmpty(str(p, "code"), str(p, "name"))
		}
		return id
	}
	pname := func(id string) string {
		if p := projects[id]; p != nil {
			return str(p, "name")
		}
		return ""
	}
	delivered := map[string]float64{}
	directRecv := map[string]float64{}
	for _, x := range liveLocked("dispatches") {
		st_ := str(x.D, "status")
		if st_ != "delivered" && st_ != "short" {
			continue
		}
		for _, l := range subList(x.D, "lines") {
			if id := str(l, "indentId"); id != "" {
				delivered[id+"|"+str(l, "lineId")] += fnum(l["recvQty"])
			}
			if str(x.D, "type") == "direct" && str(x.D, "poId") != "" {
				directRecv[str(x.D, "poId")+"|"+str(l, "poKey")] += fnum(l["recvQty"])
			}
		}
	}
	company := firstNonEmpty(configLocked("company"), "RGS Infra")
	now := time.Now()
	var sheets []xSheet
	count := func(c string) int { return len(liveLocked(c)) }
	sheets = append(sheets, xSheet{Name: "Summary", Rows: [][]any{
		{"ProcureHub data backup", ""},
		{"Company", company},
		{"Created", now.Format("02 Jan 2006, 15:04")},
		{"Program version", appVersion},
		{"Projects", count("projects")}, {"Vendors", count("vendors")}, {"Demands (requisitions)", count("indents")},
		{"Requests for quotation", count("rfqs")}, {"Purchase orders", count("pos")}, {"Goods receipts", count("grns")},
		{"Dispatches & transfers", count("dispatches")}, {"Site stock entries", count("sitelog")},
		{"", ""},
		{"Note", "This workbook is a readable copy of all records. To restore the program itself, use Settings > Backup > Restore with the .json or full .zip backup from the same folder."},
	}})
	// Projects
	rows := [][]any{{"Code", "Project name", "Scheme", "Client / department", "City", "State", "Site in-charge", "Phone", "Delivery address", "Active"}}
	for _, p := range liveLocked("projects") {
		d := p.D
		rows = append(rows, []any{str(d, "code"), str(d, "name"), str(d, "scheme"), str(d, "client"), str(d, "city"), str(d, "state"), str(d, "siteContact"), str(d, "phone"), str(d, "address"), d["active"] != false})
	}
	sheets = append(sheets, xSheet{"Projects", rows})
	// Vendors
	rows = [][]any{{"Vendor", "Supplies", "Contact", "Phone", "Email", "City", "GSTIN", "Payment terms", "Rating", "Address"}}
	for _, v := range liveLocked("vendors") {
		d := v.D
		var cats []string
		cl, _ := d["categories"].([]any)
		for _, c := range cl {
			if s, ok := c.(string); ok {
				cats = append(cats, catName(s))
			}
		}
		rows = append(rows, []any{str(d, "name"), strings.Join(cats, ", "), str(d, "contact"), str(d, "phone"), str(d, "email"), str(d, "city"), str(d, "gstin"), str(d, "payment"), d["rating"], str(d, "address")})
	}
	sheets = append(sheets, xSheet{"Vendors", rows})
	// Demands
	rows = [][]any{{"MR no", "Raised", "Project code", "Project", "Required by", "Priority", "Requested by", "Item", "Specification", "Category", "Asked qty", "Approved qty", "Unit", "Status", "RFQ", "PO", "Vendor", "Transfer", "Received qty", "Site note", "Approval remark", "Decided by", "HQ remarks"}}
	for _, x := range liveLocked("indents") {
		i := x.D
		for _, l := range subList(i, "lines") {
			need := fnum(l["qty"])
			if v, ok := l["approvedQty"]; ok && v != nil {
				need = fnum(v)
			}
			del := delivered[x.ID+"|"+str(l, "id")]
			status := "Approved"
			switch {
			case i["cancelled"] == true:
				status = "Cancelled"
			case str(l, "status") == "rejected":
				status = "Rejected"
			case str(l, "status") == "hold":
				status = "On hold"
			case str(l, "status") != "approved":
				status = "Awaiting HQ review"
			case need > 0 && del >= need-1e-9:
				status = "Delivered"
			case del > 0:
				status = "Part received"
			case str(l, "poNo") != "":
				status = "Ordered"
			case str(l, "transferNo") != "":
				status = "Transfer"
			case l["fromStock"] == true:
				status = "Issue from store"
			case str(l, "rfqNo") != "":
				status = "Getting quotations"
			}
			appr := any(nil)
			if str(l, "status") == "approved" {
				appr = need
			}
			rows = append(rows, []any{str(i, "no"), str(i, "date"), pcode(str(i, "projectId")), pname(str(i, "projectId")), str(i, "requiredBy"), firstNonEmpty(str(i, "priority"), "Normal"), str(i, "requestedBy"), str(l, "desc"), str(l, "spec"), catName(str(l, "category")), fnum(l["qty"]), appr, str(l, "unit"), status, str(l, "rfqNo"), str(l, "poNo"), str(l, "vendorName"), str(l, "transferNo"), del, str(l, "siteNote"), str(l, "approvalNote"), str(l, "decidedByName"), hqRemarksText(i)})
		}
	}
	sheets = append(sheets, xSheet{"Demands", rows})
	// RFQs & quotes
	vend := map[string]string{}
	for _, v := range liveLocked("vendors") {
		vend[v.ID] = str(v.D, "name")
	}
	rows = [][]any{{"RFQ no", "Date", "Status", "Item", "Specification", "Qty", "Unit", "Vendor", "Rate (excl GST)", "GST %", "Amount (excl GST)", "Freight (total)", "Delivery days", "Payment", "Awarded"}}
	for _, x := range liveLocked("rfqs") {
		r := x.D
		quotes, _ := r["quotes"].(map[string]any)
		award, _ := r["award"].(map[string]any)
		for _, l := range subList(r, "lines") {
			key := str(l, "key")
			if len(quotes) == 0 {
				rows = append(rows, []any{str(r, "no"), str(r, "date"), str(r, "status"), str(l, "desc"), str(l, "spec"), fnum(l["qty"]), str(l, "unit"), "", nil, nil, nil, nil, nil, "", ""})
			}
			vids := make([]string, 0, len(quotes))
			for vid := range quotes {
				vids = append(vids, vid)
			}
			sort.Strings(vids)
			for _, vid := range vids {
				q, _ := quotes[vid].(map[string]any)
				rates, _ := q["rates"].(map[string]any)
				rt := fnum(rates[key])
				aw := ""
				if a, _ := award[key].(string); a == vid {
					aw = "Yes"
				}
				var rate, amt any
				if rt > 0 {
					rate, amt = rt, rt*fnum(l["qty"])
				}
				rows = append(rows, []any{str(r, "no"), str(r, "date"), str(r, "status"), str(l, "desc"), str(l, "spec"), fnum(l["qty"]), str(l, "unit"), firstNonEmpty(vend[vid], vid), rate, quoteGst(q, key), amt, fnum(q["freight"]), q["deliveryDays"], str(q, "payment"), aw})
			}
		}
	}
	sheets = append(sheets, xSheet{"Quotations", rows})
	// POs
	rows = [][]any{{"PO no", "Date", "Vendor", "RFQ", "Delivery", "Item", "Specification", "HSN", "Category", "Qty", "Unit", "Rate", "GST %", "GST amount", "Amount excl GST", "Amount incl GST", "Received", "Balance", "PO status"}}
	for _, x := range liveLocked("pos") {
		p := x.D
		recvd, _ := p["received"].(map[string]any)
		for _, l := range subList(p, "lines") {
			q, rate, gst := fnum(l["qty"]), fnum(l["rate"]), fnum(l["gst"])
			rc := fnum(recvd[str(l, "key")])
			if str(p, "deliveryMode") == "site" {
				rc = directRecv[x.ID+"|"+str(l, "key")]
			}
			mode := "Central store"
			if str(p, "deliveryMode") == "site" {
				mode = "Direct to sites"
			} else if str(p, "deliveryMode") == "vendor" {
				mode = "To job worker " + str(p, "shipToVendorName")
			}
			ps := "Open"
			if str(p, "status") == "cancelled" {
				ps = "Cancelled"
			}
			rows = append(rows, []any{str(p, "no"), str(p, "date"), str(p, "vendorName"), str(p, "rfqNo"), mode, str(l, "desc"), str(l, "spec"), str(l, "hsn"), catName(str(l, "cat")), q, str(l, "unit"), rate, gst, q * rate * gst / 100, q * rate, q * rate * (1 + gst/100), rc, q - rc, ps})
		}
	}
	sheets = append(sheets, xSheet{"Purchase orders", rows})
	// GRNs
	rows = [][]any{{"GRN no", "Date", "Against PO", "Vendor", "Challan", "Invoice", "Vehicle", "Item", "Specification", "Unit", "Received", "Rejected", "Accepted", "Remarks", "Documents attached"}}
	for _, x := range liveLocked("grns") {
		g := x.D
		for _, l := range subList(g, "lines") {
			po := str(g, "poNo")
			if po == "" {
				po = map[string]string{"nopo": "Purchased without PO", "other": "Other inward", "jobwork": "Finished product from job worker"}[str(g, "type")]
				if po == "" {
					po = "Opening stock"
				}
			}
			rows = append(rows, []any{str(g, "no"), str(g, "date"), po, firstNonEmpty(str(g, "vendorName"), str(g, "party")), str(g, "challan"), str(g, "invoice"), str(g, "vehicle"), str(l, "desc"), str(l, "spec"), str(l, "unit"), fnum(l["recv"]), fnum(l["rej"]), fnum(l["acc"]), str(g, "remarks"), len(subAny(g, "photos"))})
		}
	}
	sheets = append(sheets, xSheet{"HQ store inward (GRN)", rows})
	sheets = append(sheets, jobworkSheets()...)
	// Dispatches
	rows = [][]any{{"Challan no", "Type", "From", "To project", "Date", "PO", "Vendor", "Vehicle", "LR / e-way", "Item", "Specification", "Unit", "Qty sent", "Qty received", "MR no", "Status", "Received on", "Received by", "Site remarks"}}
	statusName := map[string]string{"ordered": "Ordered from vendor", "to_send": "Waiting to be sent", "in_transit": "On the way", "delivered": "Received", "short": "Received short", "cancelled": "Cancelled"}
	for _, x := range liveLocked("dispatches") {
		d := x.D
		typ, from := "From store", "Central store"
		switch str(d, "type") {
		case "direct":
			typ, from = "Direct from vendor", str(d, "vendorName")
		case "transfer":
			typ, from = "Site transfer", pcode(str(d, "fromProjectId"))
		}
		for _, l := range subList(d, "lines") {
			var rq any
			if v, ok := l["recvQty"]; ok && v != nil {
				rq = fnum(v)
			}
			rows = append(rows, []any{str(d, "no"), typ, from, pcode(str(d, "projectId")), str(d, "date"), str(d, "poNo"), str(d, "vendorName"), str(d, "vehicle"), str(d, "lrNo"), str(l, "desc"), str(l, "spec"), str(l, "unit"), fnum(l["qty"]), rq, str(l, "mrNo"), firstNonEmpty(statusName[str(d, "status")], str(d, "status")), msDate(d["receivedAt"]), str(d, "receivedByName"), str(d, "siteRemarks")})
		}
	}
	sheets = append(sheets, xSheet{"Dispatches", rows})
	// Outward register: HQ store to sites, with GST values (version 5.4+ challans)
	rows = [][]any{{"Document no", "Kind", "Invoice no", "Date", "Site", "Bill to", "Site GSTIN", "Place of supply", "HQ store GSTIN", "Item", "HSN", "Qty", "Unit", "Rate", "Taxable value", "GST %", "CGST", "SGST", "IGST", "Total", "Received on", "Received by", "Designation", "Signed copy"}}
	for _, x := range liveLocked("dispatches") {
		d := x.D
		if str(d, "type") != "store" || str(d, "status") == "cancelled" || d["totals"] == nil {
			continue
		}
		to, _ := d["to"].(map[string]any)
		from, _ := d["from"].(map[string]any)
		intra := d["intra"] == true
		kind := "Delivery challan"
		if str(d, "kind") == "invoice" {
			kind = "Tax invoice"
		}
		signed := "No"
		if len(subAny(d, "signedDocs")) > 0 {
			signed = "Yes"
		}
		for _, l := range subList(d, "lines") {
			tax := fnum(l["tax"])
			var c, s2, i float64
			if intra {
				c, s2 = round2(tax/2), round2(tax/2)
			} else {
				i = round2(tax)
			}
			rows = append(rows, []any{str(d, "no"), kind, str(d, "invoiceNo"), str(d, "date"), pname(str(d, "projectId")), str(to, "name"), str(to, "gstin"), str(to, "code"), str(from, "gstin"), str(l, "desc"), str(l, "hsn"), fnum(l["qty"]), str(l, "unit"), fnum(l["rate"]), fnum(l["taxable"]), fnum(l["gst"]), c, s2, i, round2(fnum(l["taxable"]) + tax), str(d, "receivedOn"), str(d, "receivedByName"), str(d, "receiverDesignation"), signed})
		}
	}
	sheets = append(sheets, xSheet{"Outward register (GST)", rows})
	// Site stock
	rows = [][]any{{"Project code", "Project", "Item", "Specification", "Category", "Unit", "Opening", "Received", "Sent to other sites", "Issued / used", "Consumed (authenticated)", "Returned to vendors", "Damaged / lost", "Returned to store", "Count adjustment", "Balance", "Minimum level", "Below minimum"}}
	site := siteStockLocked()
	pids := make([]string, 0, len(site))
	for p := range site {
		pids = append(pids, p)
	}
	sort.Slice(pids, func(i, j int) bool { return pcode(pids[i]) < pcode(pids[j]) })
	for _, p := range pids {
		keys := make([]string, 0, len(site[p]))
		for k := range site[p] {
			keys = append(keys, k)
		}
		sort.Slice(keys, func(i, j int) bool { return site[p][keys[i]].Desc < site[p][keys[j]].Desc })
		for _, k := range keys {
			r := site[p][k]
			low := ""
			if r.Min > 0 && r.bal() < r.Min {
				low = "Yes"
			}
			rows = append(rows, []any{pcode(p), pname(p), r.Desc, r.Spec, catName(r.Cat), r.Unit, r.Open, r.Recv, r.Out, r.Used, r.Cons, r.VRet, r.Dmg, r.Ret, r.Adj, r.bal(), r.Min, low})
		}
	}
	sheets = append(sheets, xSheet{"Site stock", rows})
	// Site stock register
	rows = [][]any{{"Date", "Project", "Entry", "Item", "Specification", "Unit", "Qty", "Issued to", "Location / chainage", "Reason / remarks", "Entered by", "Rate (existing stock)", "Value (existing stock)", "Value basis"}}
	typeName := map[string]string{"opening": "Opening stock", "use": "Issued / used", "damage": "Damaged / lost", "return": "Returned to central store", "adjust": "Physical count adjustment"}
	for _, x := range liveLocked("sitelog") {
		e := x.D
		rows = append(rows, []any{str(e, "date"), pcode(str(e, "projectId")), firstNonEmpty(typeName[str(e, "type")], str(e, "type")), str(e, "desc"), str(e, "spec"), str(e, "unit"), fnum(e["qty"]), str(e, "issuedTo"), str(e, "location"), firstNonEmpty(str(e, "reason"), str(e, "remarks")), str(e, "createdByName"), e["orate"], e["value"], str(e, "basis")})
	}
	sheets = append(sheets, xSheet{"Site stock register", rows})
	// Consumption reports
	rows = [][]any{{"Report", "Date", "Project", "Description of consumption", "Remarks", "Item", "Specification", "Unit", "Qty", "Reported by", "Status", "Authenticated / rejected by", "On", "Remark"}}
	for _, x := range liveLocked("consumption") {
		d := x.D
		a, _ := d["auth"].(map[string]any)
		for _, l := range subList(d, "lines") {
			rows = append(rows, []any{str(d, "no"), str(d, "date"), pcode(str(d, "projectId")), str(d, "description"), str(d, "remarks"), str(l, "desc"), str(l, "spec"), str(l, "unit"), fnum(l["qty"]), str(d, "reportedByName"), str(d, "status"), str(a, "byName"), msDate(a["at"]), str(a, "remark")})
		}
	}
	sheets = append(sheets, xSheet{"Consumption", rows})
	// Returns to vendors
	rows = [][]any{{"Return note", "Date", "From", "Vendor", "PO", "Reason", "Details", "Item", "Specification", "Unit", "Qty", "Rate", "GST %", "Replacement / debit note", "Status", "Made by"}}
	for _, x := range liveLocked("vreturns") {
		d := x.D
		from := "HQ store"
		if str(d, "from") == "site" {
			from = pcode(str(d, "projectId"))
		}
		next := "Debit note"
		if d["replace"] == true {
			next = "Vendor to replace"
		}
		for _, l := range subList(d, "lines") {
			rows = append(rows, []any{str(d, "no"), str(d, "date"), from, str(d, "vendorName"), str(d, "poNo"), str(d, "reason"), str(d, "remarks"), str(l, "desc"), str(l, "spec"), str(l, "unit"), fnum(l["qty"]), l["rate"], l["gst"], next, str(d, "status"), str(d, "createdByName")})
		}
	}
	sheets = append(sheets, xSheet{"Returns to vendors", rows})
	// Cash purchases
	rows = [][]any{{"Voucher", "Date", "Bought for", "Shop", "Shop GSTIN", "Bill no.", "Paid by", "Purpose", "Item", "Specification", "Unit", "Qty", "Rate", "GST %", "Amount", "Used at once", "Entered by", "Status", "Approved by", "Final approval by"}}
	for _, x := range liveLocked("cashbuys") {
		d := x.D
		where := "HQ store"
		if str(d, "location") == "site" {
			where = pcode(str(d, "projectId"))
		}
		a, _ := d["appr"].(map[string]any)
		f, _ := d["fin"].(map[string]any)
		for _, l := range subList(d, "lines") {
			rows = append(rows, []any{str(d, "no"), str(d, "date"), where, str(d, "shop"), str(d, "shopGstin"), str(d, "billNo"), str(d, "payMode"), str(d, "purpose"), str(l, "desc"), str(l, "spec"), str(l, "unit"), fnum(l["qty"]), fnum(l["rate"]), fnum(l["gst"]), fnum(l["amount"]), fnum(l["usedNow"]), str(d, "byName"), str(d, "status"), str(a, "byName"), str(f, "byName")})
		}
	}
	sheets = append(sheets, xSheet{"Cash purchases", rows})
	// Central store
	type cs struct {
		desc, spec, unit, cat string
		in, out               float64
	}
	store := map[string]*cs{}
	get := func(k string, l map[string]any) *cs {
		s := store[k]
		if s == nil {
			s = &cs{desc: str(l, "desc"), spec: str(l, "spec"), unit: str(l, "unit"), cat: firstNonEmpty(str(l, "cat"), "others")}
			store[k] = s
		}
		return s
	}
	for _, x := range liveLocked("grns") {
		for _, l := range subList(x.D, "lines") {
			get(itemKeyOf(l), l).in += fnum(l["acc"])
		}
	}
	for _, x := range liveLocked("sitelog") {
		if str(x.D, "type") == "return" {
			get(itemKeyOf(x.D), x.D).in += fnum(x.D["qty"])
		}
	}
	for _, x := range liveLocked("dispatches") {
		if str(x.D, "type") != "store" || str(x.D, "status") == "cancelled" {
			continue
		}
		for _, l := range subList(x.D, "lines") {
			get(itemKeyOf(l), l).out += fnum(l["qty"])
		}
	}
	for _, x := range liveLocked("vreturns") {
		if str(x.D, "from") == "site" || str(x.D, "status") == "cancelled" {
			continue
		}
		for _, l := range subList(x.D, "lines") {
			get(itemKeyOf(l), l).out += fnum(l["qty"])
		}
	}
	for _, x := range liveLocked("cashbuys") {
		if str(x.D, "status") != "final" || str(x.D, "location") != "hq" {
			continue
		}
		used := cashUsedFinal(x.D)
		for i, l := range subList(x.D, "lines") {
			s := get(itemKeyOf(l), l)
			s.in += fnum(l["qty"])
			s.out += used[i]
		}
	}
	rows = [][]any{{"Item", "Specification", "Category", "Unit", "Received", "Issued", "Balance"}}
	sk := make([]string, 0, len(store))
	for k := range store {
		sk = append(sk, k)
	}
	sort.Slice(sk, func(i, j int) bool { return store[sk[i]].desc < store[sk[j]].desc })
	for _, k := range sk {
		s := store[k]
		rows = append(rows, []any{s.desc, s.spec, catName(s.cat), s.unit, s.in, s.out, s.in - s.out})
	}
	sheets = append(sheets, xSheet{"Central store", rows})
	// Catalogue changes
	rows = [][]any{{"Item", "Category", "Unit", "Default specification", "Sizes", "Hidden from sites", "GST %", "HSN"}}
	for _, x := range liveLocked("catalog") {
		d := x.D
		var sizes []string
		if arr, ok := d["sizes"].([]any); ok {
			for _, s := range arr {
				sizes = append(sizes, fmt.Sprint(s))
			}
		}
		rows = append(rows, []any{str(d, "desc"), catName(str(d, "category")), str(d, "unit"), str(d, "spec"), strings.Join(sizes, ", "), d["hidden"] == true, d["gst"], str(d, "hsn")})
	}
	sheets = append(sheets, xSheet{"Catalogue changes", rows})
	// Users (no passwords)
	rows = [][]any{{"Username", "Name", "Access", "Project", "Active", "Last sign-in", "Mobile"}}
	us := make([]*User, 0, len(st.Users))
	for _, u := range st.Users {
		us = append(us, u)
	}
	sort.Slice(us, func(i, j int) bool { return us[i].Username < us[j].Username })
	for _, u := range us {
		role := "HQ"
		if u.Role == "site" {
			role = "Site"
		}
		ll := ""
		if u.LastLogin > 0 {
			ll = time.UnixMilli(u.LastLogin).Format("2006-01-02 15:04")
		}
		rows = append(rows, []any{u.Username, u.Name, role, pcode(u.ProjectID), u.Active, ll, u.Phone})
	}
	sheets = append(sheets, xSheet{"Users", rows})
	return sheets
}

/* ------------------------------ scheduler ------------------------------ */

var bkMu sync.Mutex // one backup run at a time

func bkDir(sub string) string { return filepath.Join(dataDir, "backups", sub) }

func writeAtomic(path string, data []byte) error {
	tmp := path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	if _, err = f.Write(data); err == nil {
		err = f.Sync()
	}
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, path)
}

func prune(glob string, keep int) {
	files, _ := filepath.Glob(glob)
	sort.Strings(files)
	for len(files) > keep {
		os.Remove(files[0])
		files = files[1:]
	}
}

func copyFile(src, dst string) error {
	b, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return writeAtomic(dst, b)
}

// runBackup writes the backups that are due. force writes Excel/JSON even if nothing changed.
func runBackup(force bool) error {
	bkMu.Lock()
	defer bkMu.Unlock()
	now := time.Now()
	day := now.Format("2006-01-02")
	xlsxPath := filepath.Join(bkDir("excel"), "ProcureHub-"+day+".xlsx")
	jsonPath := filepath.Join(bkDir(""), "procurehub-"+day+".json")
	for _, d := range []string{bkDir("excel"), bkDir("full")} {
		os.MkdirAll(d, 0700)
	}
	mu.Lock()
	rev := st.Rev
	conf := st.Backup
	_, statErr := os.Stat(xlsxPath)
	needExcel := force || rev != conf.LastExcelRev || statErr != nil
	var sheets []xSheet
	var export []byte
	if needExcel {
		sheets = buildWorkbookLocked()
		export, _ = json.Marshal(exportLocked())
	}
	needBak := rev != conf.LastBakRev && now.Sub(time.UnixMilli(conf.LastBak)) > 14*time.Minute
	mu.Unlock()

	var errs []string
	if needExcel {
		var buf bytes.Buffer
		if err := writeXLSX(&buf, sheets); err != nil {
			errs = append(errs, "Excel: "+err.Error())
		} else if err := writeAtomic(xlsxPath, buf.Bytes()); err != nil {
			errs = append(errs, "Excel: "+err.Error())
		}
		if err := writeAtomic(jsonPath, export); err != nil {
			errs = append(errs, "JSON: "+err.Error())
		}
		prune(filepath.Join(bkDir("excel"), "ProcureHub-*.xlsx"), 120)
		prune(filepath.Join(bkDir(""), "procurehub-2*.json"), 90)
	}
	if needBak || force {
		if err := copyFile(dbPath, dbPath+".bak"); err != nil {
			errs = append(errs, "database copy: "+err.Error())
		}
	}
	fullPath, madeFull := "", false
	if now.Sub(time.UnixMilli(conf.LastFull)) > 7*24*time.Hour {
		fullPath = filepath.Join(bkDir("full"), "procurehub-full-"+day+".zip")
		var buf bytes.Buffer
		if err := writeFullZip(&buf); err != nil {
			errs = append(errs, "full backup: "+err.Error())
			fullPath = ""
		} else if err := writeAtomic(fullPath, buf.Bytes()); err != nil {
			errs = append(errs, "full backup: "+err.Error())
			fullPath = ""
		} else {
			madeFull = true
		}
		prune(filepath.Join(bkDir("full"), "procurehub-full-*.zip"), 6)
	}
	mirrorErr, mirrored := "", false
	if conf.Dir != "" && (needExcel || fullPath != "" || now.Sub(time.UnixMilli(conf.LastMirror)) > 6*time.Hour) {
		target := filepath.Join(conf.Dir, "ProcureHub-Backup")
		if err := os.MkdirAll(filepath.Join(target, "excel"), 0700); err != nil {
			mirrorErr = err.Error()
		} else {
			for src, dst := range map[string]string{xlsxPath: filepath.Join(target, "excel", filepath.Base(xlsxPath)), jsonPath: filepath.Join(target, filepath.Base(jsonPath))} {
				if err := copyFile(src, dst); err != nil && !errors.Is(err, os.ErrNotExist) {
					mirrorErr = err.Error()
				}
			}
			if fullPath == "" {
				if fs, _ := filepath.Glob(filepath.Join(bkDir("full"), "procurehub-full-*.zip")); len(fs) > 0 {
					sort.Strings(fs)
					if _, err := os.Stat(filepath.Join(target, filepath.Base(fs[len(fs)-1]))); err != nil {
						fullPath = fs[len(fs)-1]
					}
				}
			}
			if fullPath != "" {
				if err := copyFile(fullPath, filepath.Join(target, filepath.Base(fullPath))); err != nil {
					mirrorErr = err.Error()
				}
				prune(filepath.Join(target, "procurehub-full-*.zip"), 6)
			}
			prune(filepath.Join(target, "excel", "ProcureHub-*.xlsx"), 120)
			prune(filepath.Join(target, "procurehub-2*.json"), 90)
			mirrored = mirrorErr == ""
		}
	}
	emailErr, emailed := "", false
	mu.Lock()
	smtpConf := st.SMTP
	mu.Unlock()
	if conf.Email != "" && conf.LastEmailDay != day && now.Hour() >= conf.EmailHour {
		if smtpConf.Host == "" {
			emailErr = "Email is not set up in Settings, so the daily backup could not be emailed."
		} else if b, err := os.ReadFile(xlsxPath); err != nil {
			emailErr = err.Error()
		} else if len(b) > 18<<20 {
			emailErr = "The Excel file is larger than 18 MB, too big to email. Use the backup folder copy instead."
		} else {
			company := ""
			mu.Lock()
			company = firstNonEmpty(configLocked("company"), "RGS Infra")
			mu.Unlock()
			err := sendMail(smtpConf, strings.Split(conf.Email, ","), "ProcureHub daily backup – "+company+" – "+now.Format("02 Jan 2006"),
				"<p>Attached is today's Excel backup of all ProcureHub records ("+company+").</p><p>Keep these emails: each one is a complete, readable copy of projects, vendors, demands, quotations, purchase orders, receipts, dispatches and site stock.</p>",
				"Attached is today's Excel backup of all ProcureHub records.",
				mailAttachment{Name: filepath.Base(xlsxPath), Type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Data: b})
			if err != nil {
				emailErr = err.Error()
			} else {
				emailed = true
			}
		}
	}
	mu.Lock()
	b := &st.Backup
	if needExcel && len(errs) == 0 {
		b.LastExcel, b.LastExcelRev, b.LastJSON = now.UnixMilli(), rev, now.UnixMilli()
	}
	if needBak || force {
		b.LastBak, b.LastBakRev = now.UnixMilli(), rev
	}
	if madeFull {
		b.LastFull = now.UnixMilli()
	}
	if conf.Dir != "" && (mirrored || mirrorErr != "") {
		b.MirrorErr = mirrorErr
		if mirrored {
			b.LastMirror = now.UnixMilli()
		}
	}
	if conf.Email != "" && (emailed || emailErr != "") {
		b.EmailErr = emailErr
		if emailed {
			b.LastEmail, b.LastEmailDay = now.UnixMilli(), day
		}
	}
	b.LastErr = strings.Join(errs, "; ")
	saveLocked()
	mu.Unlock()
	if len(errs) > 0 {
		log.Printf("BACKUP PROBLEM: %s", strings.Join(errs, "; "))
		return errors.New(strings.Join(errs, "; "))
	}
	return nil
}

func backupLoop() {
	time.Sleep(8 * time.Second)
	for {
		if err := runBackup(false); err != nil {
			log.Printf("backup: %v", err)
		}
		time.Sleep(15 * time.Minute)
	}
}

/* ------------------------------ endpoints ------------------------------ */

type bkFile struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
	Size int64  `json:"size"`
	Time int64  `json:"time"`
}

func listBackups() []bkFile {
	var out []bkFile
	for kind, glob := range map[string]string{"excel": filepath.Join(bkDir("excel"), "*.xlsx"), "json": filepath.Join(bkDir(""), "*.json"), "full": filepath.Join(bkDir("full"), "*.zip")} {
		files, _ := filepath.Glob(glob)
		for _, f := range files {
			if fi, err := os.Stat(f); err == nil {
				out = append(out, bkFile{kind, filepath.Base(f), fi.Size(), fi.ModTime().UnixMilli()})
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Time > out[j].Time })
	if len(out) > 60 {
		out = out[:60]
	}
	return out
}

func backupStatus() map[string]any {
	mu.Lock()
	b := st.Backup
	smtpOK := st.SMTP.Host != "" && st.SMTP.From != ""
	mu.Unlock()
	return map[string]any{"conf": b, "files": listBackups(), "dataDir": dataDir, "backupDir": bkDir(""), "smtpOK": smtpOK, "now": time.Now().UnixMilli()}
}

func hBackupStatus(w http.ResponseWriter, r *http.Request, u *User) {
	writeJSON(w, 200, backupStatus())
}

func hBackupNow(w http.ResponseWriter, r *http.Request, u *User) {
	if r.Method != http.MethodPost {
		fail(w, 405, "Method not allowed.")
		return
	}
	if err := runBackup(true); err != nil {
		writeJSON(w, 200, map[string]any{"ok": false, "error": err.Error(), "status": backupStatus()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "status": backupStatus()})
}

func hBackupConfig(w http.ResponseWriter, r *http.Request, u *User) {
	var req struct {
		Dir, Email string
		EmailHour  int
	}
	if !readJSON(w, r, &req, 1<<14) {
		return
	}
	req.Dir = strings.TrimSpace(req.Dir)
	req.Email = strings.TrimSpace(req.Email)
	if req.Dir != "" {
		if !filepath.IsAbs(req.Dir) {
			fail(w, 400, `Give the full folder path, for example D:\ProcureHub-Backup or E:\ (USB drive).`)
			return
		}
		test := filepath.Join(req.Dir, "ProcureHub-Backup")
		if err := os.MkdirAll(test, 0700); err != nil {
			fail(w, 400, "That folder can't be used: "+err.Error())
			return
		}
		if err := os.WriteFile(filepath.Join(test, ".write-test"), []byte("ok"), 0600); err != nil {
			fail(w, 400, "ProcureHub can't write to that folder: "+err.Error())
			return
		}
		os.Remove(filepath.Join(test, ".write-test"))
	}
	if req.Email != "" {
		for _, e := range strings.Split(req.Email, ",") {
			e = strings.TrimSpace(e)
			if !strings.Contains(e, "@") || strings.ContainsAny(e, " \r\n<>") {
				fail(w, 400, "Check the email address: "+e)
				return
			}
		}
	}
	if req.EmailHour < 0 || req.EmailHour > 23 {
		req.EmailHour = 19
	}
	mu.Lock()
	st.Backup.Dir, st.Backup.Email, st.Backup.EmailHour = req.Dir, req.Email, req.EmailHour
	if req.Email != "" {
		st.Backup.LastEmailDay = ""
	}
	st.Backup.LastMirror = 0
	saveLocked()
	mu.Unlock()
	go runBackup(false)
	writeJSON(w, 200, map[string]any{"ok": true, "status": backupStatus()})
}

var bkNameRe = regexp.MustCompile(`^[A-Za-z0-9._-]{1,120}$`)

func hBackupFile(w http.ResponseWriter, r *http.Request, u *User) {
	kind, name := r.URL.Query().Get("kind"), r.URL.Query().Get("name")
	dir := map[string]string{"excel": bkDir("excel"), "json": bkDir(""), "full": bkDir("full")}[kind]
	if dir == "" || !bkNameRe.MatchString(name) {
		fail(w, 400, "Unknown backup file.")
		return
	}
	f, err := os.Open(filepath.Join(dir, name))
	if err != nil {
		fail(w, 404, "That backup file no longer exists.")
		return
	}
	defer f.Close()
	ct := map[string]string{"excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "json": "application/json", "full": "application/zip"}[kind]
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	io.Copy(w, f)
}

func hExportXLSX(w http.ResponseWriter, r *http.Request, u *User) {
	mu.Lock()
	sheets := buildWorkbookLocked()
	company := firstNonEmpty(configLocked("company"), "RGS Infra")
	mu.Unlock()
	var buf bytes.Buffer
	if err := writeXLSX(&buf, sheets); err != nil {
		fail(w, 500, err.Error())
		return
	}
	name := strings.ReplaceAll(normS(company), " ", "-") + "-procurehub-" + time.Now().Format("2006-01-02") + ".xlsx"
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	w.Write(buf.Bytes())
}

// hXLSX turns rows prepared by the browser (registers, site stock) into a real Excel file.
func hXLSX(w http.ResponseWriter, r *http.Request, u *User) {
	var req struct {
		Filename string
		Sheets   []struct {
			Name string
			Rows [][]any
		}
	}
	if !readJSON(w, r, &req, 40<<20) {
		return
	}
	var sheets []xSheet
	for _, s := range req.Sheets {
		sheets = append(sheets, xSheet{s.Name, s.Rows})
	}
	var buf bytes.Buffer
	if err := writeXLSX(&buf, sheets); err != nil {
		fail(w, 500, err.Error())
		return
	}
	fn := regexp.MustCompile(`[^A-Za-z0-9._-]+`).ReplaceAllString(req.Filename, "-")
	if !strings.HasSuffix(fn, ".xlsx") {
		fn += ".xlsx"
	}
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", `attachment; filename="`+fn+`"`)
	w.Write(buf.Bytes())
}

func hqRemarksText(i map[string]any) string {
	var out []string
	for _, r := range subList(i, "hqRemarks") {
		t := str(r, "text")
		if n := str(r, "name"); n != "" {
			t = n + ": " + t
		}
		out = append(out, t)
	}
	return strings.Join(out, " | ")
}

// quoteGst is the GST % of one quoted line: the line's own rate when the
// quote has per-line GST (version 5.2+), otherwise the quote's single rate.
func quoteGst(q map[string]any, key string) float64 {
	if g, ok := q["gstRates"].(map[string]any); ok {
		if v, ok := g[key]; ok && v != nil && v != "" {
			return fnum(v)
		}
	}
	return fnum(q["gst"])
}

func subAny(m map[string]any, k string) []any { a, _ := m[k].([]any); return a }
