//go:build !windows

package main

func isWindows() bool { return false }

// takeOver is only needed on Windows, where a running EXE cannot be replaced.
func takeOver(port int, exe string, args []string) {}

// relocate is only used on Windows; Linux and Mac servers run as a service
// with a fixed data folder.
func relocate(exe, ownDataDir string, args []string) {}
