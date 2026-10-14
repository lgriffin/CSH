package httpapi

import (
	"net/http"

	"example.com/stockroom/internal/domain"
)

// Handle answers one reservation.
func Handle(w http.ResponseWriter, _ *http.Request) {
	if _, err := domain.Reserve(1, 2); err != nil {
		w.WriteHeader(http.StatusConflict)
	}
}
