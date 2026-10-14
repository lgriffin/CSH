package domain

import "testing"

func TestSTK_1_ReserveFits(t *testing.T) {
	left, err := Reserve(5, 2)
	if err != nil || left != 3 {
		t.Fatalf("got %d, %v", left, err)
	}
}
