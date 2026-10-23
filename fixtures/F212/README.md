# F212

Rust UI outputs ([21](../../docs/spec/21-test-suites-as-evidence.md), section 2; stage 70).

`tests/ui` holds the cases trybuild compiles. `missing_field.rs` must fail, with the errors `missing_field.stderr`
accepts. `compiles.rs` must compile, so it has no output and is not reported. `renamed.stderr` names no case:
`renamed.rs` is gone, so it is `orphan-output`.

The expected result was written from the specification before the code.
