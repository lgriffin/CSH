package ports

import "example.com/shop/domain"

// OrderRepository stores orders.
type OrderRepository interface {
	Add(o domain.Order) error
}
