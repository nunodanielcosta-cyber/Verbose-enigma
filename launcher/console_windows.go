//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

// Ativa UTF-8 na consola (acentos corretos) e define o título da janela.
func init() {
	k := syscall.NewLazyDLL("kernel32.dll")
	_, _, _ = k.NewProc("SetConsoleOutputCP").Call(65001)
	if t, err := syscall.UTF16PtrFromString("OtoDita"); err == nil {
		_, _, _ = k.NewProc("SetConsoleTitleW").Call(uintptr(unsafe.Pointer(t)))
	}
}
