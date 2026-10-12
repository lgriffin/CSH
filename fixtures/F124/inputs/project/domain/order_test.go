package domain

import "testing"

func TestTotal_REQ_1(t *testing.T) {
	if (Order{Lines: []int64{1, 2}}).Total() != 3 {
		t.Fatal("wrong total")
	}
}

func TestRefund(t *testing.T) {
	t.Run("REQ-3 full refund", func(t *testing.T) {
		if len((Order{Lines: []int64{1}}).Refund()) != 1 {
			t.Fatal("a full refund returns every line")
		}
	})
}
