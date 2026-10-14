package core

import "example.com/shop/db"

// Order is a customer's order.
type Order struct{ Table string }

// NewOrder makes an order stored in the orders table.
func NewOrder() Order { return Order{Table: db.OrdersTable} }
