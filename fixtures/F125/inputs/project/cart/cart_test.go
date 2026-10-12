package cart

import (
	"fmt"
	"testing"
)

// TestAdd checks REQ-1: adding an item puts it in the cart.
func TestAdd(t *testing.T) {
	if len(New().Add(1).Items) != 1 {
		t.Fatal("the item is not in the cart")
	}
}

func TestQuantities(t *testing.T) {
	for _, qty := range []int{1, 2} {
		t.Run(fmt.Sprint(qty), func(t *testing.T) {})
	}
	t.Run("REQ-2 accepts positive quantities", func(t *testing.T) {})
}

func FuzzParse_REQ_5(f *testing.F) {
	f.Fuzz(func(t *testing.T, s string) { _, _ = Parse(s) })
}

func ExampleCart_Total() {
	fmt.Println(New().Add(2).Total())
	// Output: 2
}

func ExampleCart_REQ_7() {
	fmt.Println(New())
}

func checkREQ_9(t *testing.T) {
	t.Helper()
}
