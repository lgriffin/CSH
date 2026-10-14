# Stockroom

A small reservation service, written to show its layering.

## Layers

- The `internal/domain` package does not import `internal/store` or `internal/httpapi`.
- Handlers must never depend on the database driver.
- The store is independent of the HTTP layer.

Nothing here depends on luck. Imports are sorted with goimports.

```text
The domain does not import anything in this block; it is an example, not a rule.
```

## Running

Run `go test ./...` from the root. The reservation logic lives in `internal/domain/reserve.go`, and the stock counts
in `internal/domain/stock.go`.
