# F171

Three Go modules in one repository, `example.com/shop/core`, `db` and `web`, used together by a `go.work`, read through
a `Code` source with no Go toolchain run. Each module path is a package, holding the Go files under its `go.mod`; the
`go.work` is no package. The container diagram names the three module paths and draws only web to core.
`core/order.go` imports `example.com/shop/db` on line 3, so `CoreIgnoresDb` is violated with that file and line,
`DiagramIsComplete` is violated too, and core to db is an undrawn dependency naming the line. `web` requires `core` in
its `go.mod` and imports it, which the diagram draws: `WebSeesOnlyCore` holds, and web to core is neither undrawn nor
unobserved. Analyse, danger and grain, section 5; exit of stage 58.

The expected result was written from the documents before the fixture was first run.
