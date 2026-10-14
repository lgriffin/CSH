package retry

import "testing"

func TestGRN_4_Retries(t *testing.T) {
	p := Policy{Retries: 2}
	if p.Attempts() != 3 {
		t.Fatalf("retries: got %d attempts", p.Attempts())
	}
}
