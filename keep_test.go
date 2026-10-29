package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestUnknownFieldsKept(t *testing.T) {
	in := `{"version":"5.9.0","rev":3,"cols":{},"users":{"u1":{"id":"u1","username":"dir","role":"hq","sign":"abc.png","designation":"Director (Procurement)","later":{"a":1}}},"newer":[1,2]}`
	var s State
	if err := json.Unmarshal([]byte(in), &s); err != nil {
		t.Fatal(err)
	}
	if s.Users["u1"].Sign != "abc.png" {
		t.Fatal("sign lost")
	}
	b, err := json.Marshal(&s)
	if err != nil {
		t.Fatal(err)
	}
	out := string(b)
	for _, want := range []string{`"newer":[1,2]`, `"later":{"a":1}`, `"designation":"Director (Procurement)"`} {
		if !strings.Contains(out, want) {
			t.Errorf("%s missing from %s", want, out)
		}
	}
}

func TestKeyOfMatchesWebApp(t *testing.T) {
	// itemKey('DI K-7 Pipe','150 mm','RMT') in the web app
	if got := keyOf("DI K-7 Pipe", "150 mm", "RMT"); got != "di k 7 pipe|150 mm|rmt" {
		t.Fatal(got)
	}
}
