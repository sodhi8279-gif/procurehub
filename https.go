package main

// Secure connection (https) with a free certificate.
//
// When the office reaches ProcureHub through an internet name (for example
// rgsit.ddnsking.com), browsers show "Not secure" for plain http. Here an
// administrator enters that name once (Settings → Secure connection); ProcureHub
// then gets a free certificate from Let's Encrypt and renews it by itself.
//
// The same port serves both: a browser speaking https gets the secure site; a
// plain http request for the internet name is sent on to https. Requests by IP
// address or computer name inside the office keep working on plain http.
// Let's Encrypt checks the name over port 80, so the router must forward port
// 80 (as well as the ProcureHub port) to this computer.

import (
	"bufio"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"net/http"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/acme/autocert"
)

type HTTPSConf struct {
	On     bool   `json:"on,omitempty"`
	Domain string `json:"domain,omitempty"`
	Email  string `json:"email,omitempty"`
}

var (
	httpsMu      sync.Mutex
	httpsMgr     *autocert.Manager
	httpsMgrFor  string
	httpsReady   bool
	httpsErr     string
	httpsExpiry  time.Time
	port80Err    string
	port80Up     bool
	manualTLS    bool
	domainRe     = regexp.MustCompile(`^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$`)
	httpsChecked time.Time
)

func httpsConf() HTTPSConf {
	mu.Lock()
	defer mu.Unlock()
	return st.HTTPS
}

// manager for the configured name (nil when switched off)
func httpsManager() *autocert.Manager {
	c := httpsConf()
	httpsMu.Lock()
	defer httpsMu.Unlock()
	if !c.On || c.Domain == "" {
		return nil
	}
	if httpsMgr == nil || httpsMgrFor != c.Domain {
		httpsMgr = &autocert.Manager{
			Prompt:     autocert.AcceptTOS,
			HostPolicy: autocert.HostWhitelist(c.Domain),
			Cache:      autocert.DirCache(filepath.Join(dataDir, "certs")),
			Email:      c.Email,
		}
		httpsMgrFor, httpsReady, httpsErr = c.Domain, false, ""
	}
	return httpsMgr
}

// obtain (or load from the cache) the certificate now
func httpsObtain(timeout time.Duration) {
	m := httpsManager()
	if m == nil {
		return
	}
	c := httpsConf()
	type res struct {
		cert *tls.Certificate
		err  error
	}
	ch := make(chan res, 1)
	go func() {
		// look like a modern browser, so the same (ECDSA) certificate browsers use is fetched
		cert, err := m.GetCertificate(&tls.ClientHelloInfo{ServerName: c.Domain, SupportedProtos: []string{"h2", "http/1.1"},
			SignatureSchemes: []tls.SignatureScheme{tls.ECDSAWithP256AndSHA256}, SupportedCurves: []tls.CurveID{tls.CurveP256},
			CipherSuites: []uint16{tls.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256, tls.TLS_AES_128_GCM_SHA256}, SupportedVersions: []uint16{tls.VersionTLS13, tls.VersionTLS12}})
		ch <- res{cert, err}
	}()
	var r res
	select {
	case r = <-ch:
	case <-time.After(timeout):
		r.err = errors.New("no answer from Let's Encrypt yet; it keeps trying in the background")
	}
	httpsMu.Lock()
	defer httpsMu.Unlock()
	httpsChecked = time.Now()
	if r.err != nil {
		httpsReady, httpsErr = false, explainACME(r.err)
		return
	}
	httpsReady, httpsErr = true, ""
	if r.cert != nil && r.cert.Leaf != nil {
		httpsExpiry = r.cert.Leaf.NotAfter
	}
}

func explainACME(err error) string {
	s := err.Error()
	switch {
	case strings.Contains(s, "Timeout during connect") || strings.Contains(s, "Connection refused") || strings.Contains(s, "connection refused") || strings.Contains(s, "Fetching http"):
		return "Let's Encrypt could not reach this computer on port 80 at " + httpsConf().Domain + ". In the router, forward port 80 (TCP) to this computer, check that the internet name points to the office's internet address, then try again. Details: " + clip(s, 300)
	case strings.Contains(s, "NXDOMAIN") || strings.Contains(s, "no valid A records"):
		return "The internet name was not found. Check the spelling and that the dynamic-DNS name is active. Details: " + clip(s, 300)
	case strings.Contains(s, "rateLimited") || strings.Contains(s, "too many"):
		return "Let's Encrypt is limiting new certificates for this name for now. Try again after an hour. Details: " + clip(s, 300)
	}
	return clip(s, 400)
}

// port 80: answers Let's Encrypt and sends everything else to https
func startPort80() {
	httpsMu.Lock()
	if port80Up {
		httpsMu.Unlock()
		return
	}
	httpsMu.Unlock()
	ln, err := net.Listen("tcp", ":80")
	httpsMu.Lock()
	if err != nil {
		port80Err = "Port 80 on this computer is used by another program (" + clip(err.Error(), 120) + "). Stop that program (for example IIS or Skype) so ProcureHub can answer Let's Encrypt."
		httpsMu.Unlock()
		return
	}
	port80Up, port80Err = true, ""
	httpsMu.Unlock()
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if m := httpsManager(); m != nil {
			m.HTTPHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { toHTTPS(w, r) })).ServeHTTP(w, r)
			return
		}
		http.NotFound(w, r)
	})
	go (&http.Server{Handler: h, ReadHeaderTimeout: 10 * time.Second}).Serve(ln)
}

func toHTTPS(w http.ResponseWriter, r *http.Request) {
	c := httpsConf()
	http.Redirect(w, r, fmt.Sprintf("https://%s:%d%s", c.Domain, listenPort, r.URL.RequestURI()), http.StatusMovedPermanently)
}

// plain http on the ProcureHub port: the internet name moves to https once a certificate exists
func httpsRedirect(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.TLS == nil {
			c := httpsConf()
			host := strings.ToLower(r.Host)
			if i := strings.LastIndex(host, ":"); i >= 0 {
				host = host[:i]
			}
			httpsMu.Lock()
			ready := httpsReady
			httpsMu.Unlock()
			if c.On && ready && host == c.Domain && !strings.HasPrefix(r.URL.Path, "/api/") {
				toHTTPS(w, r)
				return
			}
		}
		h.ServeHTTP(w, r)
	})
}

/* ---- one port, two protocols ---- */

type chanListener struct {
	addr net.Addr
	ch   chan net.Conn
	done chan struct{}
	once sync.Once
}

func (l *chanListener) Accept() (net.Conn, error) {
	select {
	case c := <-l.ch:
		return c, nil
	case <-l.done:
		return nil, net.ErrClosed
	}
}
func (l *chanListener) Close() error   { l.once.Do(func() { close(l.done) }); return nil }
func (l *chanListener) Addr() net.Addr { return l.addr }

type peekConn struct {
	net.Conn
	r *bufio.Reader
}

func (c *peekConn) Read(p []byte) (int, error) { return c.r.Read(p) }

// splitTLS hands TLS connections to one listener and plain http to the other.
func splitTLS(ln net.Listener) (plain, secure net.Listener) {
	p := &chanListener{addr: ln.Addr(), ch: make(chan net.Conn), done: make(chan struct{})}
	s := &chanListener{addr: ln.Addr(), ch: make(chan net.Conn), done: make(chan struct{})}
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				if errors.Is(err, net.ErrClosed) {
					p.Close()
					s.Close()
					return
				}
				time.Sleep(50 * time.Millisecond)
				continue
			}
			go func(c net.Conn) {
				c.SetReadDeadline(time.Now().Add(15 * time.Second))
				br := bufio.NewReader(c)
				b, err := br.Peek(1)
				c.SetReadDeadline(time.Time{})
				if err != nil {
					c.Close()
					return
				}
				pc := &peekConn{Conn: c, r: br}
				if b[0] == 0x16 { // TLS handshake
					s.ch <- pc
				} else {
					p.ch <- pc
				}
			}(c)
		}
	}()
	return p, s
}

func httpsTLSConfig() *tls.Config {
	return &tls.Config{
		MinVersion: tls.VersionTLS12,
		NextProtos: []string{"h2", "http/1.1", "acme-tls/1"},
		GetCertificate: func(hello *tls.ClientHelloInfo) (*tls.Certificate, error) {
			m := httpsManager()
			if m == nil {
				return nil, errors.New("secure connection is not switched on")
			}
			cert, err := m.GetCertificate(hello)
			if err == nil {
				httpsMu.Lock()
				httpsReady, httpsErr = true, ""
				if cert != nil && cert.Leaf != nil {
					httpsExpiry = cert.Leaf.NotAfter
				}
				httpsMu.Unlock()
			}
			return cert, err
		},
	}
}

// serveBoth serves plain http and https on one port.
func serveBoth(ln net.Listener, h http.Handler) error {
	plain, sec := splitTLS(ln)
	srvTLS := &http.Server{Handler: h, ReadHeaderTimeout: 15 * time.Second, TLSConfig: httpsTLSConfig()}
	go srvTLS.Serve(tls.NewListener(sec, srvTLS.TLSConfig))
	srv := &http.Server{Handler: httpsRedirect(h), ReadHeaderTimeout: 15 * time.Second}
	if c := httpsConf(); c.On {
		startPort80()
		go func() { time.Sleep(3 * time.Second); httpsObtain(90 * time.Second) }()
	}
	return srv.Serve(plain)
}

/* ---- Settings → Secure connection ---- */

func httpsStatus() map[string]any {
	c := httpsConf()
	httpsMu.Lock()
	defer httpsMu.Unlock()
	out := map[string]any{"on": c.On, "domain": c.Domain, "email": c.Email, "port": listenPort, "ready": httpsReady, "error": httpsErr, "port80": port80Up, "port80Error": port80Err, "manual": manualTLS}
	if !httpsExpiry.IsZero() {
		out["expires"] = httpsExpiry.UnixMilli()
	}
	if !httpsChecked.IsZero() {
		out["checked"] = httpsChecked.UnixMilli()
	}
	if c.Domain != "" {
		out["url"] = fmt.Sprintf("https://%s:%d", c.Domain, listenPort)
	}
	return out
}

func hHTTPS(w http.ResponseWriter, r *http.Request, u *User) {
	if r.Method == http.MethodGet {
		writeJSON(w, 200, httpsStatus())
		return
	}
	var req struct {
		On            bool
		Domain, Email string
	}
	if !readJSON(w, r, &req, 1<<12) {
		return
	}
	d := strings.ToLower(strings.TrimSpace(req.Domain))
	d = strings.TrimPrefix(strings.TrimPrefix(d, "https://"), "http://")
	if i := strings.IndexAny(d, ":/"); i >= 0 {
		d = d[:i]
	}
	if req.On && !domainRe.MatchString(d) {
		fail(w, 400, "Enter the internet name only, for example rgsit.ddnsking.com (not an IP address).")
		return
	}
	mu.Lock()
	st.HTTPS = HTTPSConf{On: req.On, Domain: d, Email: clip(strings.TrimSpace(req.Email), 120)}
	st.Audit = append(st.Audit, AuditEntry{At: time.Now().UnixMilli(), User: u.Username, Name: u.Name, Col: "settings", Op: "update", Ref: "secure connection", Keys: fmt.Sprintf("on=%v %s", req.On, d)})
	saveLocked()
	mu.Unlock()
	if req.On {
		startPort80()
		ctx, cancel := context.WithTimeout(r.Context(), 100*time.Second)
		defer cancel()
		done := make(chan struct{})
		go func() { httpsObtain(90 * time.Second); close(done) }()
		select {
		case <-done:
		case <-ctx.Done():
		}
	}
	writeJSON(w, 200, httpsStatus())
}
