package main

// Keeping data written by other versions.
//
// Users and the server state are stored as Go structs. A field this version
// does not know (written by a newer or a side version) would be dropped on the
// next save. These marshallers keep such fields as they are, so updating or
// going back a version never loses data.

import (
	"bytes"
	"encoding/json"
	"reflect"
	"strings"
	"sync"
)

var knownKeys sync.Map // reflect.Type -> map[string]bool

func jsonKeys(t reflect.Type) map[string]bool {
	if v, ok := knownKeys.Load(t); ok {
		return v.(map[string]bool)
	}
	m := map[string]bool{}
	for i := 0; i < t.NumField(); i++ {
		f := t.Field(i)
		tag := f.Tag.Get("json")
		if tag == "-" {
			continue
		}
		name := strings.Split(tag, ",")[0]
		if name == "" {
			name = f.Name
		}
		m[name] = true
	}
	knownKeys.Store(t, m)
	return m
}

func marshalKeep(v any, extra map[string]json.RawMessage) ([]byte, error) {
	b, err := json.Marshal(v)
	if err != nil || len(extra) == 0 {
		return b, err
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	for k, x := range extra {
		if _, has := m[k]; !has {
			m[k] = x
		}
	}
	return json.Marshal(m)
}

func extraOf(b []byte, t reflect.Type) map[string]json.RawMessage {
	var m map[string]json.RawMessage
	if json.Unmarshal(b, &m) != nil {
		return nil
	}
	known := jsonKeys(t)
	var out map[string]json.RawMessage
	for k, v := range m {
		if !known[k] {
			if out == nil {
				out = map[string]json.RawMessage{}
			}
			out[k] = v
		}
	}
	return out
}

type userJSON User

func (u User) MarshalJSON() ([]byte, error) { return marshalKeep(userJSON(u), u.Extra) }

func (u *User) UnmarshalJSON(b []byte) error {
	var x userJSON
	if err := json.Unmarshal(b, &x); err != nil {
		return err
	}
	x.Extra = extraOf(b, reflect.TypeOf(x))
	*u = User(x)
	return nil
}

type stateJSON State

func (s State) MarshalJSON() ([]byte, error) { return marshalKeep(stateJSON(s), s.Extra) }

func (s *State) UnmarshalJSON(b []byte) error {
	var x stateJSON
	if err := json.Unmarshal(b, &x); err != nil {
		return err
	}
	x.Extra = extraOf(b, reflect.TypeOf(x))
	*s = State(x)
	return nil
}

// jsonEq compares two values the way they are stored.
func jsonEq(a, b any) bool {
	x, err1 := json.Marshal(a)
	y, err2 := json.Marshal(b)
	return err1 == nil && err2 == nil && bytes.Equal(x, y)
}
