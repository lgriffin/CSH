package domain

import "errors"

// ErrInsufficient is returned when a reservation exceeds the stock.
var ErrInsufficient = errors.New("insufficient stock")

// Reserve lowers count by qty, or refuses.
func Reserve(count, qty int) (int, error) {
	if qty > count {
		return count, ErrInsufficient
	}
	return count - qty, nil
}
