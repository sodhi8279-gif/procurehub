package main

// Quotation form in the body of the RFQ email.
//
// The vendor needs no attachment: they press the "Reply with rates" button
// (a new mail opens with the form already in it) or simply Reply, write the
// rate after "Rate" on each item line and send. The mailbox reader
// (mailin.go) finds the form in the reply — also when the mail program has
// put "> " in front of every quoted line or wrapped long lines — and reads
// the rates exactly by item, with GST %, freight, delivery, payment,
// validity and remarks. The quotation then waits in the vendor's inbox to be
// checked and accepted into the comparative.
//
//   ===== QUOTATION FORM · RFQ/26-27/0055 · V:v1 =====
//   [1:k3f9] TMT · 10 mm · 14.4 MT | Rate per MT (excl. GST): 53100 | GST %: 18
//   Freight (included / amount): included
//   Delivery (days from order): 7
//   Payment terms: 30 days
//   Quote valid for (days): 15
//   Remarks:
//   ===== END OF FORM =====

import (
	"fmt"
	"html"
	"net/url"
	"regexp"
	"strings"
)

const formHead = "===== QUOTATION FORM"
const formEnd = "===== END OF FORM ====="
const formBlank = "______"

func rfqFormText(rfq map[string]any, vendorID string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "%s · %s · V:%s =====\n", formHead, str(rfq, "no"), vendorID)
	for i, l := range subList(rfq, "lines") {
		desc := strings.ReplaceAll(str(l, "desc"), "|", "/")
		if s := str(l, "spec"); s != "" {
			desc += " · " + strings.ReplaceAll(s, "|", "/")
		}
		unit := str(l, "unit")
		fmt.Fprintf(&b, "[%d:%s] %s · %s %s | Rate per %s (excl. GST): %s | GST %%: %s\n",
			i+1, str(l, "key"), desc, fmtQty(fnum(l["qty"])), unit, unit, formBlank, formBlank)
	}
	b.WriteString("Freight (included / amount): " + formBlank + "\nDelivery (days from order): " + formBlank +
		"\nPayment terms: " + formBlank + "\nQuote valid for (days): " + formBlank + "\nRemarks: \n")
	b.WriteString(formEnd + "\n")
	return b.String()
}

// mailtoEsc: mailto fields need %20 for spaces and & = escaped (RFC 6068).
func mailtoEsc(s string) string { return strings.ReplaceAll(url.QueryEscape(s), "+", "%20") }

func fmtQty(x float64) string {
	s := fmt.Sprintf("%.3f", x)
	return strings.TrimRight(strings.TrimRight(s, "0"), ".")
}

const formHowText = "QUICK REPLY - NO ATTACHMENT NEEDED\nReply to this email, write your rate in place of ______ after \"Rate\" for each item (rate per the unit shown, excluding GST), and the GST %. Keep the lines as they are and send - our system reads your rates automatically. Leave the rate blank for an item you do not quote.\n\n"

// rfqFormHTML: the form for the HTML part of the email, in a box, with a
// button that opens a new mail to us with the form already filled in.
func rfqFormHTML(form, replyTo, subject string) string {
	btn := ""
	if replyTo != "" {
		link := "mailto:" + replyTo + "?subject=" + mailtoEsc("Re: "+subject) + "&body=" + mailtoEsc("Rates as below.\n\n"+form)
		if len(link) < 1900 { // Outlook cuts mailto links near 2,000 characters
			btn = `<p style="margin:0 0 10px"><a href="` + html.EscapeString(link) + `" style="display:inline-block;background:#1172C4;color:#fff;text-decoration:none;font-weight:bold;padding:9px 16px;border-radius:6px;font-size:14px">Reply with rates &rarr;</a>` +
				`<span style="font-size:12px;color:#465A6D;margin-left:8px">opens a new mail with this form in it</span></p>`
		}
	}
	return `<div style="border:2px solid #1172C4;border-radius:10px;padding:14px 16px;margin:0 0 18px;font-family:Arial,sans-serif;color:#0B1F33">` +
		`<div style="font-size:15px;font-weight:bold;color:#1172C4;margin-bottom:4px">Quick reply — no attachment needed</div>` +
		`<div style="font-size:13px;margin-bottom:10px">Press <b>Reply</b>, write your rate in place of <b>______</b> after each <b>Rate</b> (per the unit shown, excluding GST) and the <b>GST %</b>, and send. ` +
		`Keep the lines as they are — our system reads your rates automatically. Leave the rate blank for an item you do not quote.</div>` + btn +
		`<pre style="font-family:Consolas,Menlo,monospace;font-size:13px;line-height:1.55;white-space:pre-wrap;background:#F4F8FC;border-radius:8px;padding:12px;margin:0">` +
		html.EscapeString(form) + `</pre>` +
		`<div style="font-size:12px;color:#465A6D;margin-top:8px">You may also fill the attached Excel sheet instead, or send your own quotation.</div></div>`
}

// addRFQForm puts the form into an RFQ email: at the marker the web app
// leaves in the message, or at the top.
func addRFQForm(htm, text, subject, rfqID, vendorID string) (string, string) {
	mu.Lock()
	rfq := docData("rfqs", rfqID)
	replyTo := ""
	if c := st.MailIn; c.Enabled && strings.Contains(c.User, "@") {
		replyTo = strings.TrimSpace(c.User)
	} else if strings.Contains(st.SMTP.From, "@") {
		replyTo = strings.TrimSpace(st.SMTP.From)
	}
	var form string
	if rfq != nil {
		form = rfqFormText(rfq, vendorID)
	}
	mu.Unlock()
	if form == "" {
		return htm, text
	}
	box := rfqFormHTML(form, replyTo, subject)
	if strings.Contains(htm, "<!--RFQFORM-->") {
		htm = strings.Replace(htm, "<!--RFQFORM-->", box, 1)
	} else {
		htm = box + htm
	}
	tf := formHowText + form
	if strings.Contains(text, "{{RFQFORM}}") {
		text = strings.Replace(text, "{{RFQFORM}}", tf, 1)
	} else {
		text = tf + "\n" + text
	}
	return htm, text
}

type formQuote struct {
	Found      bool
	RFQNo      string
	VendorCode string
	Rates      map[string]float64
	GST        map[string]float64
	Terms      map[string]string
	Warnings   []string
}

var (
	formTagRe   = regexp.MustCompile(`^\[(\d{1,3})(?::([A-Za-z0-9_\-]+))?\]`)
	formSegRe   = regexp.MustCompile(`(?i)^(rate|gst)\b[^:]*:\s*(.*)$`)
	formTermRe  = regexp.MustCompile(`(?i)^(freight|delivery|payment|quote valid|validity|remarks)\b[^:]*:\s*(.*)$`)
	formNumRe   = regexp.MustCompile(`\d[\d,]*(?:\.\d+)?`)
	formQuoteRe = regexp.MustCompile(`^(?:[ \t]*>)+[ \t]?`)
	formVendRe  = regexp.MustCompile(`V:([A-Za-z0-9_\-]+)`)
)

// formValue: the number the vendor wrote, or false when left blank.
func formValue(s string) (float64, bool) {
	s = strings.TrimSpace(s)
	if strings.Trim(s, "_-. ") == "" {
		return 0, false
	}
	n := formNumRe.FindString(s)
	if n == "" {
		return 0, false
	}
	return parseNum(strings.ReplaceAll(n, ",", ""))
}

// readBodyForm finds the filled quotation form(s) in a mail and reads the one
// with the most rates (a reply can also quote our original, empty form).
func readBodyForm(text string, lines []map[string]any) formQuote {
	keys := map[string]bool{}
	byIdx := map[string]string{}
	for i, l := range lines {
		keys[str(l, "key")] = true
		byIdx[fmt.Sprint(i+1)] = str(l, "key")
	}
	var best formQuote
	var cur *formQuote
	lastKey := ""
	finish := func() {
		if cur != nil && (!best.Found || len(cur.Rates) > len(best.Rates)) {
			best = *cur
		}
		cur = nil
	}
	for _, raw := range strings.Split(strings.ReplaceAll(text, "\r", ""), "\n") {
		ln := strings.TrimSpace(formQuoteRe.ReplaceAllString(raw, ""))
		ln = strings.TrimSpace(strings.Trim(ln, "*")) // bold marks some mail programs add
		up := strings.ToUpper(ln)
		if strings.HasPrefix(up, "=====") && strings.Contains(up, "QUOTATION FORM") {
			finish()
			cur = &formQuote{Found: true, Rates: map[string]float64{}, GST: map[string]float64{}, Terms: map[string]string{}}
			cur.RFQNo = rfqNoRe.FindString(ln)
			if m := formVendRe.FindStringSubmatch(ln); m != nil {
				cur.VendorCode = m[1]
			}
			lastKey = ""
			continue
		}
		if cur == nil {
			continue
		}
		if strings.HasPrefix(up, "=====") && strings.Contains(up, "END OF FORM") {
			finish()
			continue
		}
		if ln == "" {
			continue
		}
		segs := strings.Split(ln, "|")
		if m := formTagRe.FindStringSubmatch(ln); m != nil {
			lastKey = ""
			if m[2] != "" && keys[m[2]] {
				lastKey = m[2]
			} else if byIdx[m[1]] != "" {
				lastKey = byIdx[m[1]]
			} else if len(lines) == 0 { // reading without the RFQ at hand
				lastKey = m[1] + ":" + m[2]
			}
			segs = segs[1:] // the item description
		} else if t := formTermRe.FindStringSubmatch(ln); t != nil {
			lastKey = ""
			v := strings.TrimSpace(t[2])
			if strings.Trim(v, "_-. ") == "" {
				continue
			}
			switch strings.ToLower(t[1]) {
			case "freight":
				cur.Terms["freight"] = v
			case "delivery":
				cur.Terms["deliveryDays"] = v
			case "payment":
				cur.Terms["payment"] = v
			case "quote valid", "validity":
				cur.Terms["validity"] = v
			case "remarks":
				cur.Terms["remarks"] = v
			}
			continue
		}
		if lastKey == "" {
			continue
		}
		// item fields; a line the mail program wrapped carries on the last item
		for _, s := range segs {
			sm := formSegRe.FindStringSubmatch(strings.TrimSpace(s))
			if sm == nil {
				continue
			}
			x, ok := formValue(sm[2])
			if !ok || x < 0 {
				continue
			}
			if strings.EqualFold(sm[1], "rate") {
				if x > 0 {
					cur.Rates[lastKey] = x
				}
			} else if x <= 100 {
				cur.GST[lastKey] = x
			}
		}
	}
	finish()
	return best
}

// formToQuote turns a read form into the quotation the comparative takes.
func formToQuote(fq formQuote) map[string]any {
	rates, gst := map[string]any{}, map[string]any{}
	for k, v := range fq.Rates {
		rates[k] = v
		if g, ok := fq.GST[k]; ok {
			gst[k] = g
		}
	}
	q := map[string]any{"rates": rates, "gstRates": gst, "hsn": map[string]any{}, "payment": fq.Terms["payment"], "validity": fq.Terms["validity"], "remarks": fq.Terms["remarks"]}
	if f := fq.Terms["freight"]; f != "" {
		t := strings.ToLower(f)
		if strings.Contains(t, "incl") || strings.Contains(t, "free") || strings.Contains(t, "nil") || strings.Contains(t, "fob") {
			q["freight"] = 0.0
		} else if v, ok := formValue(f); ok {
			q["freight"] = v
		}
	}
	if v, ok := formValue(fq.Terms["deliveryDays"]); ok {
		q["deliveryDays"] = v
	}
	return q
}

// formHasRates: the mail carries our quotation form with at least one rate.
func formHasRates(text string) bool {
	fq := readBodyForm(text, nil)
	return fq.Found && len(fq.Rates) > 0
}
