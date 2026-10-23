# F226

What a run touched and parsed, and build output only where a build writes it
([21](../../docs/spec/21-test-suites-as-evidence.md), section 8; stage 75, A-268).

The subject is a Go command whose package `internal/execute/build` is source, with a web view beside it.

- `internal/execute/build` is a directory named `build` with no build manifest beside it, so its code is Code and its
  test is a test, as `tsc/internal/execute/build` is in lgriffin/TypeScript.
- `web/src/out` is a directory named `out` with no manifest beside it: its file is Code.
- `build/` at the root and `web/dist/` beside `web/package.json` are a build's output: no source reads them.
- `.github/workflows/ci.yml` has no reader.
- The coverage says all 8 eligible files are read, every one parsed, and why each of the other 3 is skipped.

The expected result was written from the specification before the code.
