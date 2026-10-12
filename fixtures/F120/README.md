# F120

A small hexagonal Go module (`go.mod` naming `example.com/shop`, packages `domain`, `ports` and `adapters/sqlstore`)
read through a `Code` source, with no Go toolchain run. An import under the module path is local and depends on each
non-test file of the package directory, so `"example.com/shop/adapters/sqlstore"` on line 6 of `domain/order.go`
depends on `adapters/sqlstore/store.go`, and `DomainIgnoresAdapters` (ARCH-1) is violated with that file and line as
its reason. The port imports only `example.com/shop/domain`, so `PortsIgnoreAdapters` and `PortsSeeOnlyTheDomain`
(ARCH-2) are satisfied. Methods are declared as `Type.Method`, so the claim citing DOM-1 that `domain/order.go`
declares `Order.Total` holds. The store imports `example.com/shop/adapters/metrics`, a local package whose directory
holds no file read: that import is a `skipped` fact at its line. Polyglot code
([12](../../docs/spec/12-polyglot-code.md)), sections 1 and 3; A-127 and A-132; stage 33.

The expected result was written from the documents before the fixture was first run.
