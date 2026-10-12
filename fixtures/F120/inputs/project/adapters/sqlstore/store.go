package sqlstore

import (
	"database/sql"

	"example.com/shop/adapters/metrics"
)

// Store keeps orders in a SQL database.
type Store struct {
	db *sql.DB
}

// Add inserts one order.
func (s *Store) Add(id string, total int64) error {
	metrics.Count("orders.added")
	_, err := s.db.Exec("insert into orders values (?, ?)", id, total)
	return err
}
