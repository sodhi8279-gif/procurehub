//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

func setTitle(t string) {
	p := syscall.NewLazyDLL("kernel32.dll").NewProc("SetConsoleTitleW")
	if s, err := syscall.UTF16PtrFromString(t); err == nil {
		p.Call(uintptr(unsafe.Pointer(s)))
	}
}
