# F123

pytest's JUnit XML report (`results/pytest.xml`, the default `xunit2` family, which writes no `file` attribute) read by
the practice of a test-file source holding `tests/test_orders.py`. The suite is named `pytest`, so each test case's
file is its classname up to its last test-module segment as a `.py` path: `tests.test_orders` and
`tests.test_orders.TestRefunds` are both `tests/test_orders.py`, so every result joins that file and none is
`results-unmatched`. `failure` is failed, `error` (a fixture that failed on setup) errored and `skipped` skipped, so
the file counts four tests: one passed, one failed, one errored and one skipped. Each test's name cites what it names,
an underscore read as a hyphen since the pattern `REQ-[0-9]+` holds none, so REQ-1 to REQ-4 each count the one outcome
of the test that names it. The failed and errored tests make the file a `failing-test` gap naming REQ-2 and REQ-4; no
verdict changes. Polyglot code ([12](../../docs/spec/12-polyglot-code.md)), section 4; A-115, A-116, A-128 and A-129;
stage 30.

The expected result was written from the documents before the fixture was first run.
