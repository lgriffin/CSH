# F221

insta snapshots in Rust ([21](../../docs/spec/21-test-suites-as-evidence.md), section 3; stage 74, A-269).

- Each snapshot's header names its source, `src/lib.rs`, which holds the tests: the snapshots are paired with it, and
  `src/lib.rs` stays code as well.
- `orders__tests__render_basic.snap` is named after `test_render_basic`, less its `test_`; `orders__tests__custom_name.snap`
  after the literal first argument of an `assert_snapshot!`. `orders__tests__gone.snap` names neither:
  `obsolete-snapshot`.
- `tests/snapshots/integration__shown.snap` names `tests/integration.rs`, which does not exist: `orphan-output`.

The expected result was written from the specification before the code.
