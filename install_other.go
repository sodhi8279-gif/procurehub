//go:build !windows

package main

import (
	"os"
	"os/exec"
	"syscall"
)

func isWindows() bool { return false }

// takeOver is only needed on Windows, where a running EXE cannot be replaced.
func takeOver(port int, exe string, args []string) {}

// relocate is only used on Windows; Linux and Mac servers run as a service
// with a fixed data folder.
func relocate(exe, ownDataDir string, args []string) {}

func hideWindow(c *exec.Cmd) {}

// detach lets the restarted ProcureHub keep running after this one exits.
func detach(c *exec.Cmd) {
	c.Stdout, c.Stderr = os.Stdout, os.Stderr
	c.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
}
