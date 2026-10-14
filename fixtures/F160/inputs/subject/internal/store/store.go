package store

import "example.com/stockroom/internal/domain"

// Store holds counts by sku.
type Store struct{ counts map[string]int }

// Take reserves qty of sku.
func (s *Store) Take(sku string, qty int) error {
	left, err := domain.Reserve(s.counts[sku], qty)
	if err == nil {
		s.counts[sku] = left
	}
	return err
}
