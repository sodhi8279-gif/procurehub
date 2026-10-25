package main

// Minimal, dependency-free .xlsx writer: inline strings, numbers, a bold header
// row, frozen panes, auto-filter and sensible column widths. Opens in Excel,
// LibreOffice and Google Sheets.

import (
	"archive/zip"
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"
	"unicode/utf8"
)

type xSheet struct {
	Name string
	Rows [][]any
}

func colName(i int) string {
	s := ""
	for i++; i > 0; i = (i - 1) / 26 {
		s = string(rune('A'+(i-1)%26)) + s
	}
	return s
}

func xmlEsc(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r == '&':
			b.WriteString("&amp;")
		case r == '<':
			b.WriteString("&lt;")
		case r == '>':
			b.WriteString("&gt;")
		case r == '"':
			b.WriteString("&quot;")
		case r == '\t' || r == '\n' || r == '\r':
			b.WriteRune(r)
		case r < 0x20 || r == 0xFFFE || r == 0xFFFF:
			// not allowed in XML
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

var badSheetChars = strings.NewReplacer("[", "(", "]", ")", ":", "-", "*", "", "?", "", "/", "-", "\\", "-")

func sheetName(n string, used map[string]bool) string {
	n = strings.TrimSpace(badSheetChars.Replace(n))
	if n == "" {
		n = "Sheet"
	}
	if utf8.RuneCountInString(n) > 31 {
		n = string([]rune(n)[:31])
	}
	base, i := n, 2
	for used[strings.ToLower(n)] {
		suf := fmt.Sprintf(" %d", i)
		r := []rune(base)
		if len(r)+len(suf) > 31 {
			r = r[:31-len(suf)]
		}
		n = string(r) + suf
		i++
	}
	used[strings.ToLower(n)] = true
	return n
}

func cellText(v any) (s string, isNum bool, f float64) {
	switch x := v.(type) {
	case nil:
		return "", false, 0
	case float64:
		if math.IsNaN(x) || math.IsInf(x, 0) {
			return "", false, 0
		}
		return "", true, x
	case float32:
		return "", true, float64(x)
	case int:
		return "", true, float64(x)
	case int64:
		return "", true, float64(x)
	case bool:
		if x {
			return "Yes", false, 0
		}
		return "No", false, 0
	case string:
		return x, false, 0
	default:
		return fmt.Sprint(x), false, 0
	}
}

func writeXLSX(w io.Writer, sheets []xSheet) error {
	if len(sheets) == 0 {
		sheets = []xSheet{{Name: "Sheet1", Rows: [][]any{{"No data"}}}}
	}
	zw := zip.NewWriter(w)
	add := func(name, body string) error {
		f, err := zw.Create(name)
		if err != nil {
			return err
		}
		_, err = io.WriteString(f, body)
		return err
	}
	used := map[string]bool{}
	names := make([]string, len(sheets))
	for i, s := range sheets {
		names[i] = sheetName(s.Name, used)
	}
	var ct strings.Builder
	ct.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>`)
	for i := range sheets {
		fmt.Fprintf(&ct, `<Override PartName="/xl/worksheets/sheet%d.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`, i+1)
	}
	ct.WriteString(`</Types>`)
	if err := add("[Content_Types].xml", ct.String()); err != nil {
		return err
	}
	add("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`)
	add("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>`+xmlEsc(appName)+`</Application></Properties>`)
	add("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>`+xmlEsc(appName)+`</dc:creator></cp:coreProperties>`)
	var wb, rels strings.Builder
	wb.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>`)
	rels.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`)
	for i := range sheets {
		fmt.Fprintf(&wb, `<sheet name="%s" sheetId="%d" r:id="rId%d"/>`, xmlEsc(names[i]), i+1, i+1)
		fmt.Fprintf(&rels, `<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet%d.xml"/>`, i+1, i+1)
	}
	wb.WriteString(`</sheets></workbook>`)
	fmt.Fprintf(&rels, `<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`, len(sheets)+1)
	add("xl/workbook.xml", wb.String())
	add("xl/_rels/workbook.xml.rels", rels.String())
	// styles: 0 normal, 1 header (bold white on navy), 2 number with thousands, 3 title (bold 14)
	add("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.###"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF163550"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`)
	for i, s := range sheets {
		f, err := zw.Create(fmt.Sprintf("xl/worksheets/sheet%d.xml", i+1))
		if err != nil {
			return err
		}
		ncol := 0
		for _, r := range s.Rows {
			if len(r) > ncol {
				ncol = len(r)
			}
		}
		widths := make([]int, ncol)
		for ri, r := range s.Rows {
			if ri > 400 {
				break
			}
			for ci, v := range r {
				t, isNum, n := cellText(v)
				l := utf8.RuneCountInString(t)
				if isNum {
					l = len(strconv.FormatFloat(n, 'f', -1, 64)) + 2
				}
				if l > widths[ci] {
					widths[ci] = l
				}
			}
		}
		var b strings.Builder
		b.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`)
		b.WriteString(`<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`)
		if ncol > 0 {
			b.WriteString(`<cols>`)
			for ci, wd := range widths {
				w := math.Min(60, math.Max(9, float64(wd)*1.1+2))
				fmt.Fprintf(&b, `<col min="%d" max="%d" width="%.1f" customWidth="1"/>`, ci+1, ci+1, w)
			}
			b.WriteString(`</cols>`)
		}
		b.WriteString(`<sheetData>`)
		for ri, r := range s.Rows {
			fmt.Fprintf(&b, `<row r="%d">`, ri+1)
			for ci, v := range r {
				t, isNum, n := cellText(v)
				ref := colName(ci) + strconv.Itoa(ri+1)
				style := 0
				if ri == 0 {
					style = 1
				}
				if isNum {
					if style == 0 {
						style = 2
					}
					fmt.Fprintf(&b, `<c r="%s" s="%d"><v>%s</v></c>`, ref, style, strconv.FormatFloat(n, 'f', -1, 64))
				} else if t != "" {
					fmt.Fprintf(&b, `<c r="%s" s="%d" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>`, ref, style, xmlEsc(t))
				}
			}
			b.WriteString(`</row>`)
			if b.Len() > 1<<20 {
				if _, err := io.WriteString(f, b.String()); err != nil {
					return err
				}
				b.Reset()
			}
		}
		b.WriteString(`</sheetData>`)
		if len(s.Rows) > 1 && ncol > 0 {
			fmt.Fprintf(&b, `<autoFilter ref="A1:%s%d"/>`, colName(ncol-1), len(s.Rows))
		}
		b.WriteString(`</worksheet>`)
		if _, err := io.WriteString(f, b.String()); err != nil {
			return err
		}
	}
	return zw.Close()
}
