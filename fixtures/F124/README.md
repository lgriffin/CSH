# F124

Two runners whose results name no test file. Maven Surefire's JUnit XML report names its test cases by class
(`com.acme.shop.OrderTest`) with no `file` attribute, and the classname's last segment does not start with `test_`, so
each result's file is the classname as written; `go test -json` names each test by its package import path
(`example.com/shop/domain`, the subtest `TestRefund/REQ-3_full_refund` by its full name), and the package
`example.com/shop/adapters/sqlstore` failed with no failing test, which is one errored result. A class or a package
names no test file, so every one of these results is counted as `results-unmatched` for its source and never joined by
a guessed path: neither `OrderTest.java` nor `order_test.go` has an outcome, nothing they cite counts one, and though
a test failed no file is a `failing-test` gap. The first line of the Go report (`go: downloading ...`) is not JSON, and
is a problem at its line. Polyglot code ([12](../../docs/spec/12-polyglot-code.md)), section 4; A-115 and A-129;
stage 30.

The expected result was written from the documents before the fixture was first run.
