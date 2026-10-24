package render

import (
	"os"
	"testing"
)

func TestPage(t *testing.T) {
	want, _ := os.ReadFile("testdata/TestPage.golden")
	if Page() != string(want) {
		t.Fatal("page")
	}
}

func TestHeader(t *testing.T) {
	want, _ := os.ReadFile("testdata/header.golden")
	if Header() != string(want) {
		t.Fatal("header")
	}
}
