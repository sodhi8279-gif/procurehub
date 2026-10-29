package main

// Reading quotations from the company mailbox.
//
// Every few minutes ProcureHub looks at new mail in the inbox (IMAP, read-only:
// messages stay unread and untouched). A mail is taken up only when it names
// one of our RFQ numbers or comes from a vendor's email address. Its quotation
// is read — exactly from our Excel quotation sheet, or by Claude for a PDF,
// scan, photo, the vendor's own Excel or rates typed in the mail — and put in
// "mailquotes" for the purchase team to check and accept into the comparative.

import (
	"bufio"
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net"
	"net/http"
	"net/mail"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type MailInConf struct {
	Enabled     bool   `json:"enabled"`
	Host        string `json:"host,omitempty"`
	Port        int    `json:"port,omitempty"`
	User        string `json:"user,omitempty"`
	Pass        string `json:"pass,omitempty"`
	Every       int    `json:"every,omitempty"`
	AIKey       string `json:"aiKey,omitempty"`
	AIModel     string `json:"aiModel,omitempty"`
	AIDaily     int    `json:"aiDaily,omitempty"`
	AIDay       string `json:"aiDay,omitempty"`
	AICount     int    `json:"aiCount,omitempty"`
	Since       int64  `json:"since,omitempty"`
	UIDValidity uint32 `json:"uidValidity,omitempty"`
	LastUID     uint32 `json:"lastUid,omitempty"`
	LastCheck   int64  `json:"lastCheck,omitempty"`
	LastError   string `json:"lastError,omitempty"`
	LastFound   int    `json:"lastFound,omitempty"`
}

func imapHostFor(smtpHost string) string {
	h := strings.ToLower(strings.TrimSpace(smtpHost))
	switch {
	case h == "":
		return ""
	case strings.Contains(h, "office365") || strings.Contains(h, "outlook"):
		return "outlook.office365.com"
	case strings.HasPrefix(h, "smtppro."):
		return "imappro." + h[8:]
	case strings.HasPrefix(h, "smtp."):
		return "imap." + h[5:]
	}
	return h
}

// mailInEffective fills blanks from the sending email settings.
func mailInEffective(c MailInConf, s SMTPConf) (host string, port int, user, pass string) {
	host, port, user, pass = c.Host, c.Port, c.User, c.Pass
	if host == "" {
		host = imapHostFor(s.Host)
	}
	if port == 0 {
		port = 993
	}
	if user == "" {
		user = firstNonEmpty(s.User, s.From)
		if pass == "" {
			pass = s.Pass
		}
	}
	return
}

/* ------------------------------ a small IMAP client ------------------------------ */

type imapClient struct {
	c   net.Conn
	r   *bufio.Reader
	tag int
}

type imapResp struct {
	Line     string
	Literals [][]byte
}

func imapDial(host string, port int) (*imapClient, error) {
	addr := net.JoinHostPort(host, strconv.Itoa(port))
	d := &net.Dialer{Timeout: 20 * time.Second}
	var conn net.Conn
	var err error
	if port == 143 {
		conn, err = d.Dial("tcp", addr)
	} else {
		conn, err = tls.DialWithDialer(d, "tcp", addr, &tls.Config{ServerName: host})
	}
	if err != nil {
		return nil, fmt.Errorf("could not reach the mail server %s (%v)", addr, err)
	}
	conn.SetDeadline(time.Now().Add(10 * time.Minute))
	ic := &imapClient{c: conn, r: bufio.NewReaderSize(conn, 64<<10)}
	if _, err := ic.readResp(); err != nil {
		conn.Close()
		return nil, err
	}
	return ic, nil
}

func (ic *imapClient) close() {
	ic.cmd("LOGOUT")
	ic.c.Close()
}

// readResp reads one response line, with any literals ({n} + n bytes) inside it.
func (ic *imapClient) readResp() (imapResp, error) {
	var res imapResp
	var line strings.Builder
	for {
		s, err := ic.r.ReadString('\n')
		if err != nil {
			return res, errors.New("the mail server closed the connection")
		}
		s = strings.TrimRight(s, "\r\n")
		line.WriteString(s)
		if n := literalSize(s); n >= 0 {
			if n > 60<<20 {
				return res, errors.New("message too large")
			}
			buf := make([]byte, n)
			if _, err := io.ReadFull(ic.r, buf); err != nil {
				return res, errors.New("the mail server closed the connection")
			}
			res.Literals = append(res.Literals, buf)
			continue
		}
		break
	}
	res.Line = line.String()
	return res, nil
}

var litRe = regexp.MustCompile(`\{(\d+)\+?\}$`)

func literalSize(s string) int {
	m := litRe.FindStringSubmatch(s)
	if m == nil {
		return -1
	}
	n, _ := strconv.Atoi(m[1])
	return n
}

func (ic *imapClient) cmd(format string, args ...any) ([]imapResp, error) {
	ic.tag++
	tag := fmt.Sprintf("p%d", ic.tag)
	if _, err := fmt.Fprintf(ic.c, "%s %s\r\n", tag, fmt.Sprintf(format, args...)); err != nil {
		return nil, err
	}
	var out []imapResp
	for {
		r, err := ic.readResp()
		if err != nil {
			return out, err
		}
		if strings.HasPrefix(r.Line, tag+" ") {
			st := strings.TrimPrefix(r.Line, tag+" ")
			if strings.HasPrefix(st, "OK") {
				return out, nil
			}
			return out, errors.New(strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(st, "NO"), "BAD")))
		}
		out = append(out, r)
	}
}

func imapQuote(s string) string {
	return `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(s) + `"`
}

func (ic *imapClient) login(user, pass string) error {
	if _, err := ic.cmd("LOGIN %s %s", imapQuote(user), imapQuote(pass)); err != nil {
		return fmt.Errorf("the mail server refused the login (%v). For Gmail use an App password and make sure IMAP is allowed", err)
	}
	return nil
}

var uidValRe = regexp.MustCompile(`UIDVALIDITY (\d+)`)

func (ic *imapClient) selectInbox() (uint32, error) {
	rs, err := ic.cmd("EXAMINE INBOX") // read-only: nothing in the mailbox changes
	if err != nil {
		return 0, fmt.Errorf("could not open the inbox (%v)", err)
	}
	for _, r := range rs {
		if m := uidValRe.FindStringSubmatch(r.Line); m != nil {
			v, _ := strconv.ParseUint(m[1], 10, 32)
			return uint32(v), nil
		}
	}
	return 0, nil
}

func (ic *imapClient) searchSince(t time.Time) ([]uint32, error) {
	rs, err := ic.cmd("UID SEARCH SINCE %s", t.Format("2-Jan-2006"))
	if err != nil {
		return nil, err
	}
	var out []uint32
	for _, r := range rs {
		if strings.HasPrefix(r.Line, "* SEARCH") {
			for _, f := range strings.Fields(strings.TrimPrefix(r.Line, "* SEARCH")) {
				if v, err := strconv.ParseUint(f, 10, 32); err == nil {
					out = append(out, uint32(v))
				}
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out, nil
}

var sizeRe = regexp.MustCompile(`RFC822\.SIZE (\d+)`)

func (ic *imapClient) size(uid uint32) int {
	rs, err := ic.cmd("UID FETCH %d (RFC822.SIZE)", uid)
	if err != nil {
		return -1
	}
	for _, r := range rs {
		if m := sizeRe.FindStringSubmatch(r.Line); m != nil {
			n, _ := strconv.Atoi(m[1])
			return n
		}
	}
	return -1
}

func (ic *imapClient) fetch(uid uint32) ([]byte, error) {
	rs, err := ic.cmd("UID FETCH %d (BODY.PEEK[])", uid)
	if err != nil {
		return nil, err
	}
	for _, r := range rs {
		if len(r.Literals) > 0 {
			return r.Literals[0], nil
		}
	}
	return nil, errors.New("empty message")
}

/* ------------------------------ reading a message ------------------------------ */

type inMail struct {
	From, FromName, Subject, MsgID, Text string
	Date                                 time.Time
	Atts                                 []aiFile
}

var wordDec = &mime.WordDecoder{CharsetReader: func(cs string, r io.Reader) (io.Reader, error) { return r, nil }}

func decHeader(s string) string {
	if d, err := wordDec.DecodeHeader(s); err == nil {
		return d
	}
	return s
}

var tagRe = regexp.MustCompile(`(?s)<(script|style)[^>]*>.*?</(script|style)>|<[^>]+>`)
var blankRe = regexp.MustCompile(`[ \t]+`)
var nlRe = regexp.MustCompile(`\n{3,}`)

func htmlToText(h string) string {
	h = regexp.MustCompile(`(?i)<br\s*/?>|</p>|</tr>|</div>|</li>`).ReplaceAllString(h, "\n")
	h = regexp.MustCompile(`(?i)</td>|</th>`).ReplaceAllString(h, "\t")
	h = html.UnescapeString(tagRe.ReplaceAllString(h, ""))
	h = blankRe.ReplaceAllString(h, " ")
	return strings.TrimSpace(nlRe.ReplaceAllString(h, "\n\n"))
}

func parseMail(raw []byte) (*inMail, error) {
	m, err := mail.ReadMessage(bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	im := &inMail{Subject: decHeader(m.Header.Get("Subject")), MsgID: strings.TrimSpace(m.Header.Get("Message-Id"))}
	if a, err := mail.ParseAddress(decHeader(m.Header.Get("From"))); err == nil {
		im.From, im.FromName = strings.ToLower(a.Address), a.Name
	} else if a, err := mail.ParseAddress(m.Header.Get("From")); err == nil {
		im.From, im.FromName = strings.ToLower(a.Address), a.Name
	}
	if d, err := m.Header.Date(); err == nil {
		im.Date = d
	} else {
		im.Date = time.Now()
	}
	var plain, htm string
	var walk func(h map[string][]string, body io.Reader, depth int)
	walk = func(h map[string][]string, body io.Reader, depth int) {
		get := func(k string) string {
			if v := h[k]; len(v) > 0 {
				return v[0]
			}
			return ""
		}
		ct, params, err := mime.ParseMediaType(get("Content-Type"))
		if err != nil {
			ct = "text/plain"
		}
		if strings.HasPrefix(ct, "multipart/") && depth < 8 {
			mr := multipart.NewReader(body, params["boundary"])
			for {
				p, err := mr.NextRawPart()
				if err != nil {
					break
				}
				walk(p.Header, p, depth+1)
			}
			return
		}
		var data []byte
		switch strings.ToLower(strings.TrimSpace(get("Content-Transfer-Encoding"))) {
		case "base64":
			b, _ := io.ReadAll(io.LimitReader(body, 40<<20))
			data, _ = base64.StdEncoding.DecodeString(strings.Map(func(r rune) rune {
				if r == '\r' || r == '\n' || r == ' ' || r == '\t' {
					return -1
				}
				return r
			}, string(b)))
		case "quoted-printable":
			data, _ = io.ReadAll(io.LimitReader(quotedprintable.NewReader(body), 40<<20))
		default:
			data, _ = io.ReadAll(io.LimitReader(body, 40<<20))
		}
		if ct == "message/rfc822" && depth < 8 { // a forwarded mail
			if inner, err := parseMail(data); err == nil {
				if plain == "" {
					plain = inner.Text
				}
				im.Atts = append(im.Atts, inner.Atts...)
			}
			return
		}
		_, dp, _ := mime.ParseMediaType(get("Content-Disposition"))
		name := decHeader(firstNonEmpty(dp["filename"], params["name"]))
		if name == "" && strings.HasPrefix(ct, "text/") {
			if ct == "text/html" {
				htm += string(data)
			} else {
				plain += string(data)
			}
			return
		}
		if name == "" {
			name = "attachment"
		}
		im.Atts = append(im.Atts, aiFile{Name: name, Type: attType(name, ct, data), Data: data})
	}
	walk(m.Header, m.Body, 0)
	im.Text = strings.TrimSpace(plain)
	if im.Text == "" && htm != "" {
		im.Text = htmlToText(htm)
	}
	return im, nil
}

// attType decides what an attachment really is, from its bytes first.
func attType(name, ct string, data []byte) string {
	sniff := http.DetectContentType(data)
	lname := strings.ToLower(name)
	switch {
	case strings.HasPrefix(sniff, "application/pdf"):
		return "application/pdf"
	case sniff == "image/jpeg" || sniff == "image/png" || sniff == "image/webp" || sniff == "image/gif":
		return sniff
	case strings.HasSuffix(lname, ".xlsx") || strings.HasSuffix(lname, ".xlsm") || ct == xlsxType:
		return xlsxType
	case strings.HasSuffix(lname, ".xls"):
		return "application/vnd.ms-excel"
	case strings.HasSuffix(lname, ".csv") || ct == "text/csv":
		return "text/csv"
	}
	return ct
}

/* ------------------------------ matching and reading ------------------------------ */

var rfqNoRe = regexp.MustCompile(`RFQ\s*/\s*\d{2}-\d{2}\s*/\s*\d{3,5}`)

func normRFQNo(s string) string {
	return strings.Join(strings.Fields(strings.ReplaceAll(s, " ", "")), "")
}

func vendorEmails(v map[string]any) []string {
	var out []string
	for _, e := range strings.FieldsFunc(str(v, "email"), func(r rune) bool { return r == ',' || r == ';' || r == ' ' }) {
		if strings.Contains(e, "@") {
			out = append(out, strings.ToLower(strings.TrimSpace(e)))
		}
	}
	return out
}

func domainOf(e string) string {
	if i := strings.LastIndex(e, "@"); i >= 0 {
		return e[i+1:]
	}
	return ""
}

var freeMail = map[string]bool{"gmail.com": true, "yahoo.com": true, "yahoo.co.in": true, "hotmail.com": true, "outlook.com": true, "rediffmail.com": true, "live.com": true, "icloud.com": true}

type extractResult struct {
	Quote    map[string]any
	Notes    map[string]string
	Method   string
	Warnings []string
	RFQNo    string
}

// extractQuote reads the quotation for one RFQ from the mail's files and text.
// It does network calls (AI), so it must run without holding mu.
func extractQuote(conf MailInConf, rfqNo string, lines []map[string]any, files []aiFile, body string) extractResult {
	res := extractResult{Notes: map[string]string{}}
	keys, names := map[string]bool{}, map[string]string{}
	for _, l := range lines {
		keys[str(l, "key")] = true
		names[str(l, "key")] = str(l, "desc")
	}
	nm := func(k string) string {
		if n := names[k]; n != "" {
			return n
		}
		return k
	}
	// 1. our Excel quotation sheet: read exactly
	for _, f := range files {
		if f.Type != xlsxType {
			continue
		}
		sq := readRFQSheet(f.Data, keys)
		if !sq.OK {
			continue
		}
		rates, gst, hsn := map[string]any{}, map[string]any{}, map[string]any{}
		for k, v := range sq.Rates {
			rates[k] = v
		}
		for k, v := range sq.GST {
			if _, ok := sq.Rates[k]; ok {
				gst[k] = v
			}
		}
		for k, v := range sq.HSN {
			hsn[k] = v
		}
		q := map[string]any{"rates": rates, "gstRates": gst, "hsn": hsn, "payment": sq.Terms["payment"], "validity": sq.Terms["validity"], "remarks": sq.Terms["remarks"]}
		if v, ok := parseNum(sq.Terms["freight"]); ok {
			q["freight"] = v
		} else if t := strings.ToLower(sq.Terms["freight"]); strings.Contains(t, "incl") || strings.Contains(t, "free") || strings.Contains(t, "nil") {
			q["freight"] = 0.0
		}
		if v, ok := parseNum(strings.Fields(sq.Terms["deliveryDays"] + " x")[0]); ok {
			q["deliveryDays"] = v
		}
		res.Quote, res.Notes, res.Method, res.RFQNo = q, sq.Notes, "excel", sq.RFQNo
		res.Warnings = append(res.Warnings, sq.Warnings...)
		if sq.RFQNo != "" && normRFQNo(sq.RFQNo) != normRFQNo(rfqNo) {
			res.Warnings = append(res.Warnings, "The Excel sheet is for "+sq.RFQNo+", not "+rfqNo+".")
		}
		for k := range keys {
			if _, ok := sq.Rates[k]; ok {
				if _, g := sq.GST[k]; !g {
					res.Warnings = append(res.Warnings, nm(k)+": rate given without GST %.")
				}
			}
		}
		if len(rates) == 0 {
			res.Warnings = append(res.Warnings, "The Excel sheet came back without any rates.")
		}
		return res
	}
	// 2. anything else: Claude, when a key is set
	var inputs []aiFile
	total := 0
	for _, f := range files {
		switch {
		case f.Type == "application/pdf" || f.Type == "image/jpeg" || f.Type == "image/png" || f.Type == "image/webp" || f.Type == "image/gif":
			if len(f.Data) > 10<<20 || total+len(f.Data) > 24<<20 {
				res.Warnings = append(res.Warnings, f.Name+" is too large to read automatically.")
				continue
			}
			total += len(f.Data)
			inputs = append(inputs, f)
		case f.Type == xlsxType:
			if t := sheetAsText(f.Data, 60000); t != "" {
				inputs = append(inputs, aiFile{Name: f.Name, Type: "text/plain", Data: []byte(t)})
			}
		case f.Type == "text/csv":
			d := f.Data
			if len(d) > 60000 {
				d = d[:60000]
			}
			inputs = append(inputs, aiFile{Name: f.Name, Type: "text/plain", Data: d})
		case f.Type == "application/vnd.ms-excel":
			res.Warnings = append(res.Warnings, f.Name+" is an old Excel 97-2003 (.xls) file, which cannot be read automatically. Open it and enter the rates.")
		}
	}
	if len(body) > 20000 {
		body = body[:20000]
	}
	if len(inputs) == 0 && !ratesInText(body) {
		res.Method = "manual"
		res.Warnings = append(res.Warnings, "No rates found to read. Open the mail's attachment and enter the rates.")
		return res
	}
	if conf.AIKey == "" {
		res.Method = "manual"
		res.Warnings = append(res.Warnings, "Reading PDFs, photos and the vendor's own format needs the AI key (Settings → Read quotations from email). Enter the rates from the attachment.")
		return res
	}
	if !aiAllowance() {
		res.Method = "manual"
		res.Warnings = append(res.Warnings, "Today's limit of AI readings is used up. Enter the rates, or raise the limit in Settings.")
		return res
	}
	aq, err := aiRead(conf.AIKey, conf.AIModel, rfqNo, lines, inputs, body)
	if err != nil {
		res.Method = "manual"
		res.Warnings = append(res.Warnings, err.Error()+". Enter the rates from the attachment.")
		return res
	}
	rates, gst, hsn := map[string]any{}, map[string]any{}, map[string]any{}
	for _, l := range aq.Lines {
		if !keys[l.Key] {
			continue
		}
		if l.Rate != nil && *l.Rate > 0 && *l.Rate < 1e10 {
			rates[l.Key] = round2(*l.Rate)
			if l.GST != nil && *l.GST >= 0 && *l.GST <= 100 {
				gst[l.Key] = *l.GST
			} else {
				res.Warnings = append(res.Warnings, nm(l.Key)+": GST % not found in the quotation.")
			}
		}
		if h := strings.TrimSpace(l.HSN); h != "" && len(h) <= 12 {
			hsn[l.Key] = h
		}
		note := strings.TrimSpace(l.Note)
		if mk := strings.TrimSpace(l.Brand); mk != "" {
			note = strings.TrimSpace("Make: " + mk + ". " + note)
		}
		if note != "" {
			res.Notes[l.Key] = clip(note, 300)
		}
	}
	q := map[string]any{"rates": rates, "gstRates": gst, "hsn": hsn, "payment": clip(aq.Payment, 200), "validity": clip(aq.Validity, 100), "remarks": clip(aq.Remarks, 500)}
	if aq.Freight != nil && *aq.Freight >= 0 {
		q["freight"] = round2(*aq.Freight)
	}
	if aq.DeliveryDays != nil && *aq.DeliveryDays > 0 && *aq.DeliveryDays < 1000 {
		q["deliveryDays"] = float64(int(*aq.DeliveryDays + 0.5))
	}
	for _, w := range aq.Warnings {
		if w = strings.TrimSpace(w); w != "" && len(res.Warnings) < 30 {
			res.Warnings = append(res.Warnings, clip(w, 300))
		}
	}
	if len(rates) == 0 {
		res.Warnings = append(res.Warnings, "No rates could be read. Open the attachment and enter them.")
	}
	res.Quote, res.Method, res.RFQNo = q, "ai", aq.RFQNo
	if aq.RFQNo != "" && rfqNoRe.MatchString(aq.RFQNo) && normRFQNo(aq.RFQNo) != normRFQNo(rfqNo) {
		res.Warnings = append(res.Warnings, "The quotation mentions "+aq.RFQNo+", not "+rfqNo+".")
	}
	return res
}

func clip(s string, n int) string {
	s = strings.TrimSpace(s)
	if len([]rune(s)) > n {
		return string([]rune(s)[:n]) + "…"
	}
	return s
}

var bigNumRe = regexp.MustCompile(`\d[\d,]{2,}(\.\d+)?`)

func ratesInText(t string) bool {
	t = rfqNoRe.ReplaceAllString(t, "")
	return len(bigNumRe.FindAllString(t, -1)) >= 1
}

// aiAllowance counts AI readings per day against the limit.
func aiAllowance() bool {
	mu.Lock()
	defer mu.Unlock()
	c := &st.MailIn
	day := time.Now().Format("2006-01-02")
	if c.AIDay != day {
		c.AIDay, c.AICount = day, 0
	}
	lim := c.AIDaily
	if lim <= 0 {
		lim = 50
	}
	if c.AICount >= lim {
		return false
	}
	c.AICount++
	saveLocked()
	return true
}

var storeExt = map[string]string{"application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", xlsxType: ".xlsx"}

func storeMailFile(f aiFile) (string, bool) {
	ext := storeExt[f.Type]
	if ext == "" || len(f.Data) == 0 || len(f.Data) > 15<<20 {
		return "", false
	}
	id := randHex(12) + ext
	if os.WriteFile(filepath.Join(filesDir, id), f.Data, 0600) != nil {
		return "", false
	}
	return id, true
}

func putDocLocked(col, id string, data map[string]any) {
	c := st.Cols[col]
	if c == nil {
		c = map[string]*Doc{}
		st.Cols[col] = c
	}
	st.Rev++
	c[id] = &Doc{Rev: st.Rev, Data: data}
}

type rfqSnap struct {
	ID, No, Status string
	Vendors        []string
	Lines          []map[string]any
}

// processMail takes up one message; returns true when it was a quotation.
func processMail(raw []byte, conf MailInConf) (bool, error) {
	m, err := parseMail(raw)
	if err != nil {
		return false, nil
	}
	mu.Lock()
	self := strings.ToLower(st.SMTP.From)
	msgSeen := false
	for _, x := range liveLocked("mailquotes") {
		if m.MsgID != "" && str(x.D, "msgId") == m.MsgID {
			msgSeen = true
		}
	}
	type vend struct {
		ID, Name string
		Emails   []string
	}
	var vendors []vend
	for _, x := range liveLocked("vendors") {
		vendors = append(vendors, vend{x.ID, str(x.D, "name"), vendorEmails(x.D)})
	}
	var rfqs []rfqSnap
	for _, x := range liveLocked("rfqs") {
		var vs []string
		for _, v := range anyList(x.D["vendorIds"]) {
			if s, ok := v.(string); ok {
				vs = append(vs, s)
			}
		}
		rfqs = append(rfqs, rfqSnap{x.ID, str(x.D, "no"), str(x.D, "status"), vs, subList(x.D, "lines")})
	}
	mu.Unlock()
	if msgSeen || m.From == "" || m.From == self {
		return false, nil
	}
	var names []string
	for _, a := range m.Atts {
		names = append(names, a.Name)
	}
	// which vendor, which RFQ
	vendorID, vendorName := "", ""
	for _, v := range vendors {
		for _, e := range v.Emails {
			if e == m.From {
				vendorID, vendorName = v.ID, v.Name
			}
		}
	}
	rfqNo := ""
	if f := rfqNoRe.FindString(m.Subject + "\n" + strings.Join(names, "\n") + "\n" + m.Text); f != "" {
		rfqNo = normRFQNo(f)
	}
	var warnings []string
	for _, a := range m.Atts { // our sheet carries the RFQ no and vendor code
		if a.Type != xlsxType {
			continue
		}
		if sq := readRFQSheet(a.Data, nil); sq.OK {
			if rfqNo == "" && sq.RFQNo != "" {
				rfqNo = normRFQNo(sq.RFQNo)
			}
			if vendorID == "" && sq.VendorCode != "" {
				for _, v := range vendors {
					if v.ID == sq.VendorCode {
						vendorID, vendorName = v.ID, v.Name
						warnings = append(warnings, "Sent from "+m.From+", which is not "+v.Name+"'s email in Vendors; matched by the vendor code in the Excel sheet.")
					}
				}
			}
		}
	}
	if rfqNo == "" && vendorID == "" {
		return false, nil // not a quotation for us
	}
	useful := false
	for _, a := range m.Atts {
		if storeExt[a.Type] != "" || a.Type == "text/csv" || a.Type == "application/vnd.ms-excel" {
			useful = true
		}
	}
	if !useful && !ratesInText(m.Text) {
		return false, nil // e.g. "we will send the quote tomorrow"
	}
	var rfq *rfqSnap
	for i := range rfqs {
		if rfqNo != "" && normRFQNo(rfqs[i].No) == rfqNo {
			rfq = &rfqs[i]
		}
	}
	if rfq == nil && vendorID != "" && rfqNo == "" {
		var open []*rfqSnap
		for i := range rfqs {
			if rfqs[i].Status != "sent" && rfqs[i].Status != "draft" {
				continue
			}
			for _, v := range rfqs[i].Vendors {
				if v == vendorID {
					open = append(open, &rfqs[i])
				}
			}
		}
		if len(open) == 1 {
			rfq = open[0]
			warnings = append(warnings, "The mail does not mention an RFQ number; matched to "+rfq.No+", the only open RFQ sent to this vendor.")
		}
	}
	if rfq != nil && vendorID == "" { // a colleague of the vendor, same company domain
		d := domainOf(m.From)
		for _, vid := range rfq.Vendors {
			for _, v := range vendors {
				if v.ID != vid {
					continue
				}
				for _, e := range v.Emails {
					if domainOf(e) == d && !freeMail[d] && vendorID == "" {
						vendorID, vendorName = v.ID, v.Name
						warnings = append(warnings, "Sent from "+m.From+"; matched to "+v.Name+" by the email domain.")
					}
				}
			}
		}
	}
	if rfq != nil && vendorID != "" && rfq.Status != "sent" && rfq.Status != "draft" {
		warnings = append(warnings, rfq.No+" is already "+map[string]string{"approved": "approved", "ordered": "ordered", "cancelled": "cancelled"}[rfq.Status]+"; this quotation came late.")
	}
	// keep the originals
	var files []any
	for _, a := range m.Atts {
		if id, ok := storeMailFile(a); ok {
			files = append(files, id)
		}
	}
	body := clip(m.Text, 20000)
	doc := map[string]any{"from": m.From, "fromName": m.FromName, "subject": clip(m.Subject, 300), "received": m.Date.UnixMilli(), "msgId": m.MsgID,
		"body": body, "files": files, "fileNames": names, "at": time.Now().UnixMilli(), "rfqNoSeen": rfqNo}
	if rfq != nil && vendorID != "" {
		res := extractQuote(conf, rfq.No, rfq.Lines, m.Atts, m.Text)
		doc["status"], doc["rfqId"], doc["rfqNo"], doc["vendorId"], doc["vendorName"] = "review", rfq.ID, rfq.No, vendorID, vendorName
		doc["method"], doc["quote"], doc["notes"] = res.Method, res.Quote, res.Notes
		warnings = append(warnings, res.Warnings...)
	} else {
		doc["status"] = "unmatched"
		if rfq != nil {
			doc["rfqId"], doc["rfqNo"] = rfq.ID, rfq.No
			warnings = append(warnings, "The sender "+m.From+" is not one of the vendors of "+rfq.No+". Choose the vendor.")
		} else {
			doc["vendorId"], doc["vendorName"] = vendorID, vendorName
			if rfqNo != "" {
				warnings = append(warnings, rfqNo+" is not an RFQ in ProcureHub. Choose the RFQ.")
			} else {
				warnings = append(warnings, "Could not tell which RFQ this quotation is for. Choose the RFQ.")
			}
		}
	}
	doc["warnings"] = toAny(warnings)
	mu.Lock()
	putDocLocked("mailquotes", newDocID(), doc)
	saveLocked()
	notifyLocked()
	mu.Unlock()
	log.Printf("Quotation read from email: %s (%s) %s", m.From, str(doc, "rfqNo"), str(doc, "status"))
	return true, nil
}

func toAny(ss []string) []any {
	out := []any{}
	for _, s := range ss {
		out = append(out, s)
	}
	return out
}

func newDocID() string { return strconv.FormatInt(time.Now().UnixMilli(), 36) + randHex(3) }

var mailRun sync.Mutex

// checkMail looks for new quotations now.
func checkMail() (int, error) {
	if !mailRun.TryLock() {
		return 0, errors.New("A mail check is already running. Try again in a minute.")
	}
	defer mailRun.Unlock()
	n, err := checkMailInner()
	mu.Lock()
	st.MailIn.LastCheck = time.Now().UnixMilli()
	st.MailIn.LastFound = n
	st.MailIn.LastError = ""
	if err != nil {
		st.MailIn.LastError = err.Error()
	}
	saveLocked()
	mu.Unlock()
	return n, err
}

func checkMailInner() (int, error) {
	mu.Lock()
	c, s := st.MailIn, st.SMTP
	mu.Unlock()
	host, port, user, pass := mailInEffective(c, s)
	if host == "" || user == "" || pass == "" {
		return 0, errors.New("Set up the email account first (Settings → Email, or the mailbox details under Read quotations from email).")
	}
	ic, err := imapDial(host, port)
	if err != nil {
		return 0, err
	}
	defer ic.close()
	if err := ic.login(user, pass); err != nil {
		return 0, err
	}
	uv, err := ic.selectInbox()
	if err != nil {
		return 0, err
	}
	since := time.UnixMilli(c.Since)
	if c.Since == 0 {
		since = time.Now().AddDate(0, 0, -7)
	}
	uids, err := ic.searchSince(since.AddDate(0, 0, -1))
	if err != nil {
		return 0, fmt.Errorf("could not search the inbox (%v)", err)
	}
	last := c.LastUID
	if c.UIDValidity != uv {
		last = 0
	}
	found, done := 0, 0
	for _, uid := range uids {
		if uid <= last {
			continue
		}
		if done >= 200 {
			break // the rest on the next check
		}
		done++
		if sz := ic.size(uid); sz < 0 || sz <= 40<<20 {
			raw, err := ic.fetch(uid)
			if err != nil {
				return found, fmt.Errorf("could not read a message (%v)", err)
			}
			if m, err := mail.ReadMessage(bytes.NewReader(raw)); err == nil {
				if d, err := m.Header.Date(); err == nil && d.Before(since) {
					goto next
				}
			}
			if ok, _ := processMail(raw, c); ok {
				found++
			}
		}
	next:
		mu.Lock()
		st.MailIn.UIDValidity, st.MailIn.LastUID = uv, uid
		saveLocked()
		mu.Unlock()
	}
	return found, nil
}

func mailInLoop() {
	for {
		time.Sleep(30 * time.Second)
		mu.Lock()
		c := st.MailIn
		mu.Unlock()
		if !c.Enabled {
			continue
		}
		every := c.Every
		if every < 2 {
			every = 5
		}
		if time.Since(time.UnixMilli(c.LastCheck)) < time.Duration(every)*time.Minute {
			continue
		}
		if n, err := checkMail(); err != nil {
			log.Printf("Mail check: %v", err)
		} else if n > 0 {
			log.Printf("Mail check: %d quotation(s) read", n)
		}
	}
}

/* ------------------------------ endpoints ------------------------------ */

func mailInPublic() map[string]any {
	c, s := st.MailIn, st.SMTP
	host, port, user, pass := mailInEffective(c, s)
	day := time.Now().Format("2006-01-02")
	used := 0
	if c.AIDay == day {
		used = c.AICount
	}
	lim := c.AIDaily
	if lim <= 0 {
		lim = 50
	}
	every := c.Every
	if every < 2 {
		every = 5
	}
	return map[string]any{"enabled": c.Enabled, "host": c.Host, "port": c.Port, "user": c.User, "hasPass": c.Pass != "",
		"effHost": host, "effPort": port, "effUser": user, "ready": host != "" && user != "" && pass != "",
		"every": every, "hasAIKey": c.AIKey != "", "aiModel": firstNonEmpty(c.AIModel, defaultAIModel), "aiDaily": lim, "aiUsed": used,
		"since": c.Since, "lastCheck": c.LastCheck, "lastError": c.LastError, "lastFound": c.LastFound}
}

func hMailIn(w http.ResponseWriter, r *http.Request, u *User) {
	if r.Method == http.MethodGet {
		mu.Lock()
		out := mailInPublic()
		mu.Unlock()
		writeJSON(w, 200, out)
		return
	}
	var req struct {
		Enabled         bool
		Host, User      string
		Pass, AIKey     string
		AIModel         string
		Port, Every     any
		AIDaily, Days   any
		ClearAI, OwnBox bool
	}
	if !readJSON(w, r, &req, 1<<14) {
		return
	}
	toInt := func(v any) int {
		switch x := v.(type) {
		case float64:
			return int(x)
		case string:
			n, _ := strconv.Atoi(strings.TrimSpace(x))
			return n
		}
		return 0
	}
	mu.Lock()
	defer mu.Unlock()
	c := st.MailIn
	if req.Enabled && !c.Enabled {
		days := toInt(req.Days)
		if days <= 0 {
			days = 7
		}
		if days > 90 {
			days = 90
		}
		c.Since = time.Now().AddDate(0, 0, -days).UnixMilli()
		c.LastCheck = 0
	}
	c.Enabled = req.Enabled
	if req.OwnBox {
		c.Host, c.Port, c.User = strings.TrimSpace(req.Host), toInt(req.Port), strings.TrimSpace(req.User)
		if req.Pass != "" {
			c.Pass = strings.ReplaceAll(req.Pass, " ", "")
		}
	} else {
		c.Host, c.Port, c.User, c.Pass = "", 0, "", ""
	}
	if e := toInt(req.Every); e >= 2 && e <= 240 {
		c.Every = e
	}
	if d := toInt(req.AIDaily); d >= 1 && d <= 5000 {
		c.AIDaily = d
	}
	if k := strings.TrimSpace(req.AIKey); k != "" {
		c.AIKey = k
	}
	if req.ClearAI {
		c.AIKey = ""
	}
	c.AIModel = strings.TrimSpace(req.AIModel)
	if c.AIModel == defaultAIModel {
		c.AIModel = ""
	}
	st.MailIn = c
	saveLocked()
	writeJSON(w, 200, mailInPublic())
}

func hMailInCheck(w http.ResponseWriter, r *http.Request, u *User) {
	if r.Method != http.MethodPost {
		fail(w, 405, "Method not allowed.")
		return
	}
	n, err := checkMail()
	if err != nil {
		fail(w, 502, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "found": n})
}

// hMailInAssign: the purchase team tells which RFQ / vendor an unmatched mail
// belongs to; the quotation is then read again from the kept originals.
func hMailInAssign(w http.ResponseWriter, r *http.Request, u *User) {
	var req struct{ ID, RfqID, VendorID string }
	if !readJSON(w, r, &req, 1<<12) {
		return
	}
	mu.Lock()
	d := docData("mailquotes", req.ID)
	rfq := docData("rfqs", req.RfqID)
	v := docData("vendors", req.VendorID)
	conf := st.MailIn
	if d == nil || rfq == nil || v == nil {
		mu.Unlock()
		fail(w, 404, "Choose the RFQ and the vendor.")
		return
	}
	d = shallowCopy(d)
	lines, rfqNo := subList(rfq, "lines"), str(rfq, "no")
	var files []aiFile
	for _, f := range anyList(d["files"]) {
		id, _ := f.(string)
		if !fileIDRe.MatchString(id) {
			continue
		}
		b, err := os.ReadFile(filepath.Join(filesDir, id))
		if err != nil {
			continue
		}
		files = append(files, aiFile{Name: id, Type: attType(id, "", b), Data: b})
	}
	body := str(d, "body")
	vname := str(v, "name")
	mu.Unlock()
	res := extractQuote(conf, rfqNo, lines, files, body)
	d["status"], d["rfqId"], d["rfqNo"], d["vendorId"], d["vendorName"] = "review", req.RfqID, rfqNo, req.VendorID, vname
	d["method"], d["quote"], d["notes"] = res.Method, res.Quote, res.Notes
	d["warnings"] = toAny(append([]string{"Matched by " + u.Name + "."}, res.Warnings...))
	mu.Lock()
	auditLocked(u, "update", "mailquotes", req.ID, d, map[string]any{"rfqId": req.RfqID, "vendorId": req.VendorID})
	putDocLocked("mailquotes", req.ID, d)
	saveLocked()
	notifyLocked()
	mu.Unlock()
	writeJSON(w, 200, map[string]any{"ok": true})
}
