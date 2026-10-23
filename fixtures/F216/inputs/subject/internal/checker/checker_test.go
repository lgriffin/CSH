package checker

import "testing"

func TestCheck(t *testing.T) {
	if !Check() {
		t.Fail()
	}
}
