package format

import (
	"os"
	"testing"
)

func TestGolden(t *testing.T) {
	for _, name := range []string{"simple", "rules.go"} {
		in, _ := os.ReadFile("testdata/" + name)
		want, _ := os.ReadFile("testdata/" + name + ".golden")
		if Format(string(in)) != string(want) {
			t.Errorf("%s differs from its golden file", name)
		}
	}
}

func TestFormat(t *testing.T) {
	want, _ := os.ReadFile("testdata/TestFormat.golden")
	if Format("x") != string(want) {
		t.Error("differs")
	}
}
