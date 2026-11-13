package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func formRFQ() map[string]any {
	return map[string]any{"no": "RFQ/26-27/0055", "status": "sent", "vendorIds": []any{"v1", "v2"},
		"lines": []any{
			map[string]any{"key": "k3f9", "desc": "TMT", "spec": "10 mm Fe 500D", "unit": "MT", "qty": 14.4},
			map[string]any{"key": "c7a2", "desc": "Cement OPC 43", "unit": "Bag", "qty": 600},
			map[string]any{"key": "b1x0", "desc": "Binding wire", "unit": "Kg", "qty": 120},
		}}
}

func fill(form string, rates ...string) string {
	out := form
	for _, r := range rates {
		out = strings.Replace(out, formBlank, r, 1)
	}
	return out
}

func TestBodyForm(t *testing.T) {
	rfq := formRFQ()
	lines := subList(rfq, "lines")
	form := rfqFormText(rfq, "v1")
	t.Log("\n" + form)

	quote := func(s string) string { // a mail program quoting the original
		var b strings.Builder
		for _, l := range strings.Split(s, "\n") {
			b.WriteString("> " + l + "\n")
		}
		return b.String()
	}

	filled := fill(form, "53,100", "18", "385/-", "28", "", "", "Included", "7 days", "30 days credit", "15")
	cases := map[string]struct {
		text  string
		rates map[string]float64
		gst   map[string]float64
	}{
		"new mail from the button": {"Rates as below.\n\n" + filled, map[string]float64{"k3f9": 53100, "c7a2": 385}, map[string]float64{"k3f9": 18, "c7a2": 28}},
		"quoted reply":             {"Please find our rates.\n\nOn Fri, RGS wrote:\n" + quote(filled), map[string]float64{"k3f9": 53100, "c7a2": 385}, map[string]float64{"k3f9": 18, "c7a2": 28}},
		"wrapped lines": {strings.Replace(strings.Replace(filled, " | GST %: 18", "\n| GST %: 18", 1), " | Rate per Bag", "\n| Rate per Bag", 1),
			map[string]float64{"k3f9": 53100, "c7a2": 385}, map[string]float64{"k3f9": 18, "c7a2": 28}},
		"typed after the blanks": {strings.Replace(form, "Rate per MT (excl. GST): ______", "Rate per MT (excl. GST): ______ 52800 per MT", 1),
			map[string]float64{"k3f9": 52800}, map[string]float64{}},
		"filled above, empty original quoted below": {"Rates as below.\n\n" + filled + "\n\n-----Original Message-----\n" + quote(form),
			map[string]float64{"k3f9": 53100, "c7a2": 385}, map[string]float64{"k3f9": 18, "c7a2": 28}},
		"bold marks (Outlook)": {strings.Replace(filled, "[1:k3f9]", "*[1:k3f9]", 1), map[string]float64{"k3f9": 53100, "c7a2": 385}, nil},
		"unfilled":             {quote(form), map[string]float64{}, nil},
	}
	for name, c := range cases {
		fq := readBodyForm(c.text, lines)
		if !fq.Found {
			t.Errorf("%s: form not found", name)
			continue
		}
		if len(fq.Rates) != len(c.rates) {
			t.Errorf("%s: rates %v, want %v", name, fq.Rates, c.rates)
		}
		for k, v := range c.rates {
			if fq.Rates[k] != v {
				t.Errorf("%s: rate %s = %v, want %v", name, k, fq.Rates[k], v)
			}
		}
		for k, v := range c.gst {
			if fq.GST[k] != v {
				t.Errorf("%s: gst %s = %v, want %v", name, k, fq.GST[k], v)
			}
		}
		if fq.RFQNo != "RFQ/26-27/0055" || fq.VendorCode != "v1" {
			t.Errorf("%s: rfq %q vendor %q", name, fq.RFQNo, fq.VendorCode)
		}
	}
	q := formToQuote(readBodyForm(filled, lines))
	if q["freight"] != 0.0 || q["deliveryDays"] != 7.0 || q["payment"] != "30 days credit" || q["validity"] != "15" {
		t.Errorf("terms: %v", q)
	}
	if !formHasRates(quote(filled)) || formHasRates(quote(form)) {
		t.Error("formHasRates")
	}
}

func TestBodyFormMail(t *testing.T) {
	dir := t.TempDir()
	dataDir, dbPath, filesDir = dir, filepath.Join(dir, "db.json"), filepath.Join(dir, "files")
	os.MkdirAll(filesDir, 0755)
	st = &State{Cols: map[string]map[string]*Doc{}}
	st.SMTP.From = "purchase@rgsinfra.in"
	put := func(col, id string, d map[string]any) {
		if st.Cols[col] == nil {
			st.Cols[col] = map[string]*Doc{}
		}
		st.Cols[col][id] = &Doc{Data: d}
	}
	put("vendors", "v1", map[string]any{"name": "Gobind Alloys", "email": "sales@gobindalloys.com"})
	put("vendors", "v2", map[string]any{"name": "Shiv Traders", "email": "shivtraders@gmail.com"})
	put("rfqs", "r1", formRFQ())

	// the RFQ email carries the form, with the reply button
	htm, txt := addRFQForm("<p>Dear sir</p><!--RFQFORM--><p>Regards</p>", "{{RFQFORM}}\nRequest for Quotation", "RFQ RFQ/26-27/0055 – RGS – quote by 20 Nov", "r1", "v1")
	if !strings.Contains(htm, "QUOTATION FORM") || !strings.Contains(htm, "mailto:purchase@rgsinfra.in") || strings.Contains(htm, "RFQFORM") {
		t.Errorf("html form missing: %s", htm)
	}
	if !strings.HasPrefix(txt, "QUICK REPLY") || !strings.Contains(txt, "[2:c7a2] Cement OPC 43 · 600 Bag | Rate per Bag") {
		t.Errorf("text form missing: %s", txt)
	}

	form := rfqFormText(formRFQ(), "v2")
	filled := fill(form, "53100", "18", "", "", "92", "18", "included", "5", "advance", "7")
	// sent from a different address of the vendor, subject without RFQ number: matched by the form
	raw := "From: Shiv <shiv.office@gmail.com>\r\nTo: purchase@rgsinfra.in\r\nSubject: Re: rates\r\nMessage-ID: <f1@x>\r\nDate: Fri, 13 Nov 2026 10:00:00 +0530\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nRates as below.\r\n\r\n" + strings.ReplaceAll(filled, "\n", "\r\n")
	kept, err := processMail([]byte(raw), MailInConf{})
	if !kept || err != nil {
		t.Fatalf("not kept: %v %v", kept, err)
	}
	var d map[string]any
	for _, x := range st.Cols["mailquotes"] {
		d = x.Data
	}
	t.Logf("status=%v method=%v vendor=%v rfq=%v quote=%v warnings=%v notes=%v", d["status"], d["method"], d["vendorName"], d["rfqNo"], d["quote"], d["warnings"], d["notes"])
	if d["status"] != "review" || d["method"] != "form" || d["vendorId"] != "v2" || d["rfqId"] != "r1" {
		t.Fatalf("wrong: %v", d)
	}
	q := d["quote"].(map[string]any)
	rates := q["rates"].(map[string]any)
	if rates["k3f9"] != 53100.0 || rates["b1x0"] != 92.0 || len(rates) != 2 {
		t.Errorf("rates %v", rates)
	}
}

func TestOwnAddressAndLog(t *testing.T) {
	dir := t.TempDir()
	dataDir, dbPath, filesDir = dir, filepath.Join(dir, "db.json"), filepath.Join(dir, "files")
	os.MkdirAll(filesDir, 0755)
	st = &State{Cols: map[string]map[string]*Doc{}}
	st.SMTP.From = "purchase@rgsinfra.in"
	mailLog = nil
	st.Cols["vendors"] = map[string]*Doc{"v1": {Data: map[string]any{"name": "Test Vendor", "email": "icspljmu@gmail.com"}}}
	st.Cols["rfqs"] = map[string]*Doc{"r1": {Data: formRFQ()}}
	hdr := func(from, id string) string {
		return "From: " + from + "\r\nTo: purchase@rgsinfra.in\r\nSubject: Re: RFQ RFQ/26-27/0055\r\nMessage-ID: <" + id + "@x>\r\nDate: Fri, 13 Nov 2026 10:00:00 +0530\r\nContent-Type: text/plain\r\n\r\n"
	}
	// own address, plain reply: not taken, explained
	processMail([]byte(hdr("purchase@rgsinfra.in", "o1")+"ok noted"), MailInConf{})
	// own address, filled form (testing): taken for the vendor in the form
	filled := fill(rfqFormText(formRFQ(), "v1"), "53100", "18")
	ok, _ := processMail([]byte(hdr("purchase@rgsinfra.in", "o2")+strings.ReplaceAll(filled, "\n", "\r\n")), MailInConf{})
	// unknown sender, no RFQ no
	processMail([]byte(strings.Replace(hdr("x@other.com", "o3"), "Re: RFQ RFQ/26-27/0055", "hello", 1)+"hi"), MailInConf{})
	for _, e := range mailLog {
		t.Logf("taken=%v %s | %s", e.Taken, e.From, e.Result)
	}
	if !ok || len(mailLog) != 3 || mailLog[2].Taken || !mailLog[1].Taken {
		t.Fatalf("ok=%v log=%v", ok, mailLog)
	}
}
