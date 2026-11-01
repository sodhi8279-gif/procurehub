package main

// GST details of material moving out of the HQ store.
//
// Material delivered to the HQ store is billed by vendors on the store's
// GSTIN. When it goes to a site the store issues either a delivery challan
// (site works under the same GSTIN) or a tax invoice (site has its own GSTIN).
// The server fills the values so every outward document carries the same
// numbers, whoever creates it and whether or not they may see rates.

import (
	"errors"
	"fmt"
	"math"
	"strings"
	"time"
)

var gstStateNames = map[string]string{"01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh", "97": "Other Territory"}

func normState(s string) string {
	return strings.Join(strings.Fields(strings.ToLower(strings.ReplaceAll(s, "&", "and"))), " ")
}

func stateCodeOf(gstin, state string) string {
	if len(gstin) >= 2 {
		return gstin[:2]
	}
	for c, n := range gstStateNames {
		if normState(n) == normState(state) {
			return c
		}
	}
	return ""
}

func docData(col, id string) map[string]any {
	if c := st.Cols[col]; c != nil {
		if d := c[id]; d != nil && !d.Deleted {
			return d.Data
		}
	}
	return nil
}

func joinLines(parts ...string) string {
	var out []string
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return strings.Join(out, "\n")
}

// storeParty is the HQ store as entered in Settings → HQ store.
func storeParty() map[string]any {
	cfg := docData("config", "main")
	sp, _ := cfg["store"].(map[string]any)
	gstin := strings.ToUpper(firstNonEmpty(str(sp, "gstin"), str(cfg, "gstin")))
	state := firstNonEmpty(str(sp, "state"), gstStateNames[stateCodeOf(gstin, "")])
	cityLine := strings.Trim(str(sp, "city")+", "+str(sp, "district"), ", ")
	stateLine := strings.Trim(str(sp, "state")+" - "+str(sp, "pin"), " -")
	addr := joinLines(str(sp, "address1"), str(sp, "address2"), cityLine, stateLine)
	if addr == "" {
		addr = firstNonEmpty(str(cfg, "storeAddress"), str(cfg, "hqAddress"))
	}
	return map[string]any{"name": firstNonEmpty(str(sp, "name"), "Central Store"), "legal": firstNonEmpty(str(sp, "legal"), str(cfg, "company"), "RGS Infra"),
		"gstin": gstin, "state": state, "code": stateCodeOf(gstin, state), "address": addr}
}

// siteParty is a project as the receiver of the store's bill.
func siteParty(pid string) map[string]any {
	p := docData("projects", pid)
	gstin := strings.ToUpper(str(p, "gstin"))
	state := firstNonEmpty(str(p, "state"), gstStateNames[stateCodeOf(gstin, "")])
	addr := firstNonEmpty(str(p, "address"), str(p, "city"))
	if pin := str(p, "pin"); pin != "" {
		addr = joinLines(addr, "PIN "+pin)
	}
	return map[string]any{"name": firstNonEmpty(str(p, "billName"), str(p, "name")), "project": str(p, "name"), "code": stateCodeOf(gstin, state),
		"gstin": gstin, "state": state, "address": addr}
}

type rateInfo struct {
	rate, gst float64
	hsn       string
	at        int64
	ok        bool
}

// lastRate is the latest purchase rate (excl. GST), GST % and HSN of an item.
func lastRate(itemKey, desc string) rateInfo {
	var best rateInfo
	consider := func(l map[string]any, at int64) {
		if _, has := l["rate"]; !has {
			return
		}
		if !best.ok || at > best.at {
			best = rateInfo{rate: fnum(l["rate"]), gst: fnum(l["gst"]), hsn: str(l, "hsn"), at: at, ok: true}
		}
	}
	for _, x := range liveLocked("pos") {
		if str(x.D, "status") == "cancelled" {
			continue
		}
		for _, l := range subList(x.D, "lines") {
			if str(l, "itemKey") == itemKey {
				consider(l, int64(fnum(x.D["at"])))
			}
		}
	}
	for _, x := range liveLocked("grns") {
		for _, l := range subList(x.D, "lines") {
			if str(l, "itemKey") == itemKey && l["rate"] != nil && l["rate"] != "" {
				consider(l, int64(fnum(x.D["at"])))
			}
		}
	}
	if !best.ok || best.hsn == "" {
		for _, x := range liveLocked("catalog") {
			if strings.EqualFold(strings.TrimSpace(str(x.D, "desc")), strings.TrimSpace(desc)) {
				if !best.ok && x.D["gst"] != nil && x.D["gst"] != "" {
					best.gst = fnum(x.D["gst"])
				}
				if best.hsn == "" {
					best.hsn = str(x.D, "hsn")
				}
			}
		}
	}
	return best
}

func round2(x float64) float64 { return math.Round(x*100) / 100 }

func finYear(t time.Time) string {
	y := t.Year() % 100
	if t.Month() >= time.April {
		return fmt.Sprintf("%d-%d", y, (y+1)%100)
	}
	return fmt.Sprintf("%d-%d", (y+99)%100, y)
}

// enrichStoreDispatch fills the GST values of a new challan from the HQ store.
func enrichStoreDispatch(nd map[string]any) {
	if str(nd, "type") != "store" {
		return
	}
	from, to := storeParty(), siteParty(str(nd, "projectId"))
	intra := str(from, "code") == "" || str(to, "code") == "" || str(from, "code") == str(to, "code")
	var taxable, cgst, sgst, igst float64
	lines, _ := nd["lines"].([]any)
	for i, li := range lines {
		l, ok := li.(map[string]any)
		if !ok {
			continue
		}
		l = shallowCopy(l)
		r := lastRate(str(l, "itemKey"), str(l, "desc"))
		if v, has := l["rate"]; !has || v == nil || v == "" {
			l["rate"] = round2(r.rate)
		}
		if v, has := l["gst"]; !has || v == nil || v == "" {
			if r.ok || r.gst > 0 {
				l["gst"] = r.gst
			} else {
				l["gst"] = 18.0
			}
		}
		if str(l, "hsn") == "" {
			l["hsn"] = r.hsn
		}
		t := round2(fnum(l["qty"]) * fnum(l["rate"]))
		g := t * fnum(l["gst"]) / 100
		l["taxable"], l["tax"] = t, round2(g)
		taxable += t
		if intra {
			cgst += g / 2
			sgst += g / 2
		} else {
			igst += g
		}
		lines[i] = l
	}
	nd["lines"] = lines
	nd["from"], nd["to"], nd["intra"] = from, to, intra
	nd["totals"] = map[string]any{"taxable": round2(taxable), "cgst": round2(cgst), "sgst": round2(sgst), "igst": round2(igst), "total": round2(taxable + cgst + sgst + igst)}
	kind := "challan"
	if g1, g2 := str(from, "gstin"), str(to, "gstin"); g1 != "" && g2 != "" && g1 != g2 {
		kind = "invoice"
		key := "INV-" + finYear(time.Now())
		st.Counters[key]++
		nd["invoiceNo"] = fmt.Sprintf("INV/%s/%04d", finYear(time.Now()), st.Counters[key])
	}
	nd["kind"] = kind
}

// enrichGrn records rate, GST and HSN of each inward line (from the PO, or as
// entered for inward without PO) and the parties, for the inward register.
func enrichGrn(nd map[string]any) {
	nd["billTo"] = storeParty()
	if pid := str(nd, "poId"); pid != "" {
		po := docData("pos", pid)
		byKey := map[string]map[string]any{}
		for _, l := range subList(po, "lines") {
			byKey[str(l, "key")] = l
		}
		lines, _ := nd["lines"].([]any)
		for i, li := range lines {
			l, ok := li.(map[string]any)
			if !ok {
				continue
			}
			l = shallowCopy(l)
			if pl := byKey[str(l, "key")]; pl != nil {
				l["rate"], l["gst"] = fnum(pl["rate"]), fnum(pl["gst"])
				if str(l, "hsn") == "" {
					l["hsn"] = str(pl, "hsn")
				}
			}
			lines[i] = l
		}
		nd["lines"] = lines
		if v := docData("vendors", str(po, "vendorId")); v != nil && str(nd, "partyGstin") == "" {
			nd["partyGstin"] = strings.ToUpper(str(v, "gstin"))
		}
	}
}

func anyList(v any) []any { a, _ := v.([]any); return a }

// checkSiteReceipt: material is received at site only by a person the site
// has authorised (Projects → Authorised to receive), who uploads the
// challan signed and stamped at site.
func checkSiteReceipt(u *User, d map[string]any) error {
	name := strings.TrimSpace(str(d, "receivedByName"))
	if name == "" {
		return errors.New("Choose the authorised person who received the material.")
	}
	p := docData("projects", u.ProjectID)
	if rs := subList(p, "receivers"); len(rs) > 0 {
		ok := false
		for _, r := range rs {
			if strings.EqualFold(strings.TrimSpace(str(r, "name")), name) {
				ok = true
				d["receiverDesignation"] = str(r, "designation")
			}
		}
		if !ok {
			return errors.New(name + " is not on this site's list of persons authorised to receive material. Ask HQ to add the name.")
		}
	}
	if len(anyList(d["signedDocs"])) == 0 {
		return errors.New("Upload the delivery challan signed and stamped at site (photo or PDF).")
	}
	if d["declared"] != true {
		return errors.New("Tick the confirmation that you are authorised to receive this material.")
	}
	return nil
}
