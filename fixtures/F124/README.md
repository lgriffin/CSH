# F124

Two runners whose results name no test file by path. Maven Surefire's JUnit XML report names its test cases by class
(`com.acme.shop.OrderTest`) with no `file` attribute; `go test -json` names each test by its package import path
(`example.com/shop/domain`, the subtest `TestRefund/REQ-3_full_refund` by its full name), and the package
`example.com/shop/adapters/sqlstore` failed with no failing test, which is one errored result with no test name. The
tests adapter joins a result by what the source's files declare (A-134): the classname to `OrderTest.java`, whose
`package` is `com.acme.shop` and which declares `OrderTest`; the import path to `domain/` by the `module` line of
`go.mod`, and each test to `order_test.go`, which declares it, the parent `TestRefund` beside its subtest (A-129). A
joined name cites with its underscores read as hyphens (A-128), so REQ-1 counts a passed test from each runner, and the
failed tests make each file a `failing-test` gap naming REQ-2 and REQ-3. The errored package names no test, joins
nothing and is counted as `results-unmatched`, never dropped. The first line of the Go report (`go: downloading ...`)
is not JSON, and is a problem at its line. Polyglot code ([12](../../docs/spec/12-polyglot-code.md)), section 4;
A-115, A-128, A-129 and A-134; stages 30 and 35.

The first version of this fixture was written from the documents before it was first run, when A-129 left these
results unmatched. It was rewritten from A-134 when the joins were added; the expectations follow that row, not the run.
