package main

// The quotation sheet: an Excel file sent with every RFQ email. The vendor
// fills in rate, GST % and HSN against each line and replies; ProcureHub
// reads the filled sheet back exactly, without guessing (see mailin.go).
//
// Also a small reader for .xlsx files (shared strings, inline strings,
// numbers), enough to read the sheet back or show any other Excel quotation
// as a table.

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

const sheetNote = "Fill in the columns Rate, GST % and HSN for each item (leave Rate blank for items you do not quote), and the terms below. Do not change the Ref column. Save and attach this file to your reply."

// rfqSheetRows builds the quotation sheet for one RFQ and vendor.
func rfqSheetRows(rfq map[string]any, vendorID, vendorName string) []xSheet {
	rows := [][]any{{"Ref", "Item", "Specification", "Qty", "Unit", "Rate per unit (Rs, excl. GST)", "GST %", "HSN code", "Remarks"}}
	for _, l := range subList(rfq, "lines") {
		rows = append(rows, []any{str(l, "key"), str(l, "desc"), str(l, "spec"), fnum(l["qty"]), str(l, "unit"), nil, nil, nil, nil})
	}
	rows = append(rows, []any{},
		[]any{"", "Freight (Rs, total; 0 if included)", "", "", "", nil},
		[]any{"", "Delivery period (days)", "", "", "", nil},
		[]any{"", "Payment terms", "", "", "", nil},
		[]any{"", "Validity of offer", "", "", "", nil},
		[]any{"", "Other remarks", "", "", "", nil},
		[]any{},
		[]any{"", "RFQ no", "", "", "", str(rfq, "no")},
		[]any{"", "Vendor code", "", "", "", vendorID},
		[]any{"", "Vendor", "", "", "", vendorName},
		[]any{},
		[]any{"", sheetNote},
	)
	return []xSheet{{Name: "Quotation", Rows: rows}}
}

func rfqSheetName(rfq map[string]any, vendorName string) string {
	n := "Quotation " + strings.ReplaceAll(str(rfq, "no"), "/", "-")
	if v := strings.TrimSpace(badSheetChars.Replace(vendorName)); v != "" {
		n += " " + v
	}
	return strings.Map(func(r rune) rune {
		if strings.ContainsRune(`"<>|?*:\/`, r) {
			return '-'
		}
		return r
	}, n) + ".xlsx"
}

func buildRFQSheet(rfqID, vendorID string) (name string, data []byte, err error) {
	mu.Lock()
	rfq := docData("rfqs", rfqID)
	v := docData("vendors", vendorID)
	var sheets []xSheet
	if rfq != nil {
		sheets = rfqSheetRows(rfq, vendorID, str(v, "name"))
		name = rfqSheetName(rfq, str(v, "name"))
	}
	mu.Unlock()
	if rfq == nil {
		return "", nil, errors.New("RFQ not found.")
	}
	var b bytes.Buffer
	if err := writeXLSX(&b, sheets); err != nil {
		return "", nil, err
	}
	return name, b.Bytes(), nil
}

const xlsxType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

func hRFQSheet(w http.ResponseWriter, r *http.Request, u *User) {
	name, data, err := buildRFQSheet(r.URL.Query().Get("rfq"), r.URL.Query().Get("v"))
	if err != nil {
		fail(w, 404, err.Error())
		return
	}
	w.Header().Set("Content-Type", xlsxType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, strings.ReplaceAll(name, `"`, "")))
	w.Write(data)
}

/* ------------------------------ reading .xlsx ------------------------------ */

type xlsxCell struct {
	R  string `xml:"r,attr"`
	T  string `xml:"t,attr"`
	V  string `xml:"v"`
	Is struct {
		T []string `xml:"t"`
		R []struct {
			T string `xml:"t"`
		} `xml:"r"`
	} `xml:"is"`
}

// readXLSX returns the cells of each sheet as rows of text, in workbook order.
func readXLSX(data []byte) ([][][]string, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, errors.New("not an Excel (.xlsx) file")
	}
	files := map[string]*zip.File{}
	for _, f := range zr.File {
		files[strings.TrimPrefix(f.Name, "/")] = f
	}
	read := func(name string) []byte {
		f := files[name]
		if f == nil || f.UncompressedSize64 > 64<<20 {
			return nil
		}
		rc, err := f.Open()
		if err != nil {
			return nil
		}
		defer rc.Close()
		b, _ := io.ReadAll(io.LimitReader(rc, 64<<20))
		return b
	}
	var shared []string
	if b := read("xl/sharedStrings.xml"); b != nil {
		var sst struct {
			SI []struct {
				T string `xml:"t"`
				R []struct {
					T string `xml:"t"`
				} `xml:"r"`
			} `xml:"si"`
		}
		xml.Unmarshal(b, &sst)
		for _, si := range sst.SI {
			s := si.T
			for _, r := range si.R {
				s += r.T
			}
			shared = append(shared, s)
		}
	}
	// sheet order from workbook.xml and its relationships
	var wb struct {
		Sheets []struct {
			ID string `xml:"http://schemas.openxmlformats.org/officeDocument/2006/relationships id,attr"`
		} `xml:"sheets>sheet"`
	}
	xml.Unmarshal(read("xl/workbook.xml"), &wb)
	var rels struct {
		R []struct {
			ID     string `xml:"Id,attr"`
			Target string `xml:"Target,attr"`
		} `xml:"Relationship"`
	}
	xml.Unmarshal(read("xl/_rels/workbook.xml.rels"), &rels)
	target := map[string]string{}
	for _, r := range rels.R {
		t := strings.TrimPrefix(r.Target, "/")
		if !strings.HasPrefix(t, "xl/") {
			t = path.Join("xl", t)
		}
		target[r.ID] = t
	}
	var paths []string
	for _, s := range wb.Sheets {
		if t := target[s.ID]; t != "" {
			paths = append(paths, t)
		}
	}
	if len(paths) == 0 {
		for n := range files {
			if strings.HasPrefix(n, "xl/worksheets/sheet") && strings.HasSuffix(n, ".xml") {
				paths = append(paths, n)
			}
		}
		sort.Strings(paths)
	}
	var out [][][]string
	for _, p := range paths {
		b := read(p)
		if b == nil {
			continue
		}
		var ws struct {
			Rows []struct {
				R     int        `xml:"r,attr"`
				Cells []xlsxCell `xml:"c"`
			} `xml:"sheetData>row"`
		}
		if xml.Unmarshal(b, &ws) != nil {
			continue
		}
		var grid [][]string
		for ri, row := range ws.Rows {
			rn := row.R
			if rn == 0 {
				rn = ri + 1
			}
			if rn > 5000 {
				break
			}
			for len(grid) < rn {
				grid = append(grid, nil)
			}
			line := grid[rn-1]
			for ci, c := range row.Cells {
				col := ci
				if c.R != "" {
					col = colIndex(c.R)
				}
				if col < 0 || col > 200 {
					continue
				}
				var v string
				switch c.T {
				case "s":
					if i, err := strconv.Atoi(strings.TrimSpace(c.V)); err == nil && i >= 0 && i < len(shared) {
						v = shared[i]
					}
				case "inlineStr":
					v = strings.Join(c.Is.T, "")
					for _, r := range c.Is.R {
						v += r.T
					}
				default:
					v = c.V
				}
				for len(line) <= col {
					line = append(line, "")
				}
				line[col] = strings.TrimSpace(v)
			}
			grid[rn-1] = line
		}
		out = append(out, grid)
	}
	if len(out) == 0 {
		return nil, errors.New("the Excel file has no readable sheet")
	}
	return out, nil
}

func colIndex(ref string) int {
	n := 0
	for _, r := range ref {
		if r >= 'A' && r <= 'Z' {
			n = n*26 + int(r-'A'+1)
		} else if r >= 'a' && r <= 'z' {
			n = n*26 + int(r-'a'+1)
		} else {
			break
		}
	}
	return n - 1
}

var numJunk = regexp.MustCompile(`(?i)(rs\.?|inr|₹|/-|,|\s|%)`)

// parseNum reads "14,500", "₹ 14500/-", "18%" etc. ok=false for blank or text.
func parseNum(s string) (float64, bool) {
	s = numJunk.ReplaceAllString(strings.TrimSpace(s), "")
	if s == "" {
		return 0, false
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil || f < 0 {
		return 0, false
	}
	return f, true
}

type sheetQuote struct {
	OK         bool
	RFQNo      string
	VendorCode string
	Rates      map[string]float64
	GST        map[string]float64
	HSN        map[string]string
	Notes      map[string]string
	Terms      map[string]string
	Warnings   []string
}

// readRFQSheet recognises a filled quotation sheet (ours, even if the vendor
// moved columns or added rows) and reads it. keys = the RFQ's line keys, when known.
func readRFQSheet(data []byte, keys map[string]bool) sheetQuote {
	q := sheetQuote{Rates: map[string]float64{}, GST: map[string]float64{}, HSN: map[string]string{}, Notes: map[string]string{}, Terms: map[string]string{}}
	sheets, err := readXLSX(data)
	if err != nil {
		return q
	}
	for _, g := range sheets {
		hdr, cRef, cRate, cGST, cHSN, cRem := -1, -1, -1, -1, -1, -1
		for ri, row := range g {
			for ci, v := range row {
				if strings.EqualFold(strings.TrimSpace(v), "ref") {
					hdr, cRef = ri, ci
				}
			}
			if hdr >= 0 {
				for ci, v := range row {
					lv := strings.ToLower(v)
					switch {
					case strings.Contains(lv, "rate"):
						cRate = ci
					case strings.Contains(lv, "gst"):
						cGST = ci
					case strings.Contains(lv, "hsn"):
						cHSN = ci
					case strings.Contains(lv, "remark"):
						cRem = ci
					}
				}
				break
			}
		}
		if hdr < 0 || cRate < 0 {
			continue
		}
		cell := func(row []string, c int) string {
			if c >= 0 && c < len(row) {
				return row[c]
			}
			return ""
		}
		lines := 0
		for _, row := range g[hdr+1:] {
			key := cell(row, cRef)
			if key == "" || (keys != nil && !keys[key]) {
				// terms rows: a label followed by its value further right
				label := ""
				val := ""
				for _, v := range row {
					if v == "" {
						continue
					}
					if label == "" {
						label = strings.ToLower(v)
					} else if val == "" {
						val = v
					}
				}
				switch {
				case strings.HasPrefix(label, "freight"):
					q.Terms["freight"] = val
				case strings.HasPrefix(label, "delivery"):
					q.Terms["deliveryDays"] = val
				case strings.HasPrefix(label, "payment"):
					q.Terms["payment"] = val
				case strings.HasPrefix(label, "validity"):
					q.Terms["validity"] = val
				case strings.HasPrefix(label, "other remarks"):
					q.Terms["remarks"] = val
				case label == "rfq no":
					q.RFQNo = val
				case label == "vendor code":
					q.VendorCode = val
				}
				continue
			}
			lines++
			if r, ok := parseNum(cell(row, cRate)); ok && r > 0 {
				q.Rates[key] = r
			} else if t := cell(row, cRate); t != "" {
				q.Notes[key] = "Rate written as \"" + t + "\""
			}
			if gs := cell(row, cGST); gs != "" {
				if gv, ok := parseNum(gs); ok && gv <= 100 {
					if gv > 0 && gv < 1 { // 0.18 typed as a fraction
						gv = gv * 100
					}
					q.GST[key] = gv
				} else {
					q.Warnings = append(q.Warnings, fmt.Sprintf("Line %s: GST %% \"%s\" is not a number.", key, gs))
				}
			}
			if h := cell(row, cHSN); h != "" {
				q.HSN[key] = h
			}
			if rm := cell(row, cRem); rm != "" {
				if q.Notes[key] != "" {
					q.Notes[key] += "; "
				}
				q.Notes[key] += rm
			}
		}
		if lines > 0 {
			q.OK = true
			return q
		}
	}
	return q
}

// sheetAsText turns any Excel file into tab-separated text (for the AI reader).
func sheetAsText(data []byte, max int) string {
	sheets, err := readXLSX(data)
	if err != nil {
		return ""
	}
	var b strings.Builder
	for i, g := range sheets {
		fmt.Fprintf(&b, "--- sheet %d ---\n", i+1)
		for _, row := range g {
			line := strings.TrimRight(strings.Join(row, "\t"), "\t")
			if line != "" {
				b.WriteString(line + "\n")
			}
			if b.Len() > max {
				return b.String()[:max]
			}
		}
	}
	return b.String()
}
