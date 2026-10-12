# F121

A small hexagonal Rust crate (`Cargo.toml` naming `shop-core`, a library root `src/lib.rs` declaring the modules
`domain`, `ports` and `adapters`) read through a `Code` source, with no Rust toolchain run. The reader follows the
`mod` declarations to build the module tree, and a `use` leaf depends on the file of the deepest module its path
names, so `use crate::adapters::sql::SqlOrderStore;` on line 1 of `src/domain/order.rs` depends on
`src/adapters/sql.rs`, and `DomainIgnoresAdapters` (ARCH-1) is violated with that file and line as its reason. The
ports use only the domain's `Order`, so `PortsIgnoreAdapters` and `PortsSeeOnlyTheDomain` (ARCH-2) are satisfied. A
trait is a declaration, so the claim citing PORT-1 that `src/ports/mod.rs` declares `OrderStore` holds. The adapter's
`use crate::metrics::Counter;` names a module the crate root neither declares nor imports: that path is a `skipped`
fact at its line. Polyglot code ([12](../../docs/spec/12-polyglot-code.md)), sections 1 and 3; A-127 and A-133;
stage 34.

The expected result was written from the documents before the fixture was first run.
