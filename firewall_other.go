//go:build !windows

package main

func ensureFirewall(port int, skip bool) string { return "" }
