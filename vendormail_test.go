package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestVendorMailInbox(t *testing.T) {
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
	put("rfqs", "r1", map[string]any{"no": "RFQ/26-27/0055", "status": "sent", "vendorIds": []any{"v1"},
		"lines": []any{map[string]any{"key": "L1", "desc": "TMT", "spec": "10 mm", "unit": "MT", "qty": 14.4}}})
	mails := []struct{ name, raw string }{
		{"quotation", "From: Gobind <sales@gobindalloys.com>\r\nTo: purchase@rgsinfra.in\r\nSubject: Quote RFQ/26-27/0055\r\nMessage-ID: <a1@x>\r\nDate: Fri, 13 Nov 2026 10:00:00 +0530\r\nContent-Type: text/plain\r\n\r\nDear sir, our rate for TMT 10 mm is Rs 53100 per MT plus GST 18%.\r\n"},
		{"dispatch note", "From: Gobind <sales@gobindalloys.com>\r\nTo: purchase@rgsinfra.in\r\nSubject: Material dispatched\r\nMessage-ID: <a2@x>\r\nDate: Fri, 13 Nov 2026 11:00:00 +0530\r\nContent-Type: text/plain\r\n\r\nThe truck HP01AB1234 left today, reaching tomorrow.\r\n"},
		{"colleague", "From: Accounts <accounts@gobindalloys.com>\r\nTo: purchase@rgsinfra.in\r\nSubject: Ledger confirmation\r\nMessage-ID: <a3@x>\r\nDate: Fri, 13 Nov 2026 12:00:00 +0530\r\nContent-Type: text/plain\r\n\r\nPlease confirm the ledger balance.\r\n"},
		{"stranger", "From: Someone <x@randomco.com>\r\nTo: purchase@rgsinfra.in\r\nSubject: Offer\r\nMessage-ID: <a4@x>\r\nDate: Fri, 13 Nov 2026 12:30:00 +0530\r\nContent-Type: text/plain\r\n\r\nBuy our product.\r\n"},
	}
	for _, m := range mails {
		kept, err := processMail([]byte(m.raw), MailInConf{})
		t.Logf("%-14s kept=%v err=%v", m.name, kept, err)
	}
	for _, d := range st.Cols["mailquotes"] {
		t.Logf("stored: status=%-8s vendor=%-14s rfq=%-15s subject=%q", str(d.Data, "status"), str(d.Data, "vendorName"), str(d.Data, "rfqNo"), str(d.Data, "subject"))
	}
}

func TestRatesInText(t *testing.T) {
	for txt, want := range map[string]bool{
		"Dear sir, our rate for TMT 10 mm is Rs 53100 per MT plus GST 18%.": true,
		"Rate: 53,100/- per MT":                                 true,
		"TMT 10mm 53100 per mt, 12mm 52800 per mt":              true,
		"₹6500 per MT ex-works":                                 true,
		"The truck HP01AB1234 left today, reaching tomorrow.":   false,
		"Please call me on 9417125323 regarding RFQ/26-27/0055": false,
		"We will send the quotation tomorrow.":                  false,
		"Invoice 2026/1145 dated 12.11.2026 attached":           false,
	} {
		if got := ratesInText(txt); got != want {
			t.Errorf("ratesInText(%q) = %v, want %v", txt, got, want)
		}
	}
}
