# F172

A cargo workspace of four crates under `crates/`, read through a `Code` source with no Rust toolchain run. Each crate's
`[package] name` is a package, holding the Rust files under its `Cargo.toml`; the workspace's own `Cargo.toml` declares
no package and is none. The container diagram names `shop-web`, `shop-core` and `shop-db` and draws only web to core.
`shop-core` depends on `shop-db` by a path dependency and by `use shop_db::ORDERS_TABLE;` on line 2 of its `lib.rs`
(a crate's name is written with underscores in a path), so `CoreIgnoresDb` is violated with that file and line,
`DiagramIsComplete` is violated too, and core to db is an undrawn dependency naming the line. `shop-web` depends on
`shop-core`, which the diagram draws: `WebSeesOnlyCore` holds. `shop-tools` is a package no container holds: the gap
`unplaced-package` names its `Cargo.toml`. Analyse, danger and grain, section 5; exit of stage 58.

The expected result was written from the documents before the fixture was first run.
