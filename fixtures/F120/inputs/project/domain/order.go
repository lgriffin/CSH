package domain

import (
	"errors"

	"example.com/shop/adapters/sqlstore"
)

// ErrEmpty is returned for an order with no lines.
var ErrEmpty = errors.New("empty order")

// Order is a customer's order.
type Order struct {
	ID    string
	Lines []int64
}

// Total is the sum of the order's lines.
func (o Order) Total() int64 {
	var t int64
	for _, l := range o.Lines {
		t += l
	}
	return t
}

// Save stores the order.
func (o Order) Save(s *sqlstore.Store) error {
	if len(o.Lines) == 0 {
		return ErrEmpty
	}
	return s.Add(o.ID, o.Total())
}
