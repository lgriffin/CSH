# F215

Jest snapshot directories, in TypeScript ([21](../../docs/spec/21-test-suites-as-evidence.md), section 2; stage 70).

`src/__snapshots__/format.test.ts.snap` names `src/format.test.ts`, which exists. `parse.test.ts.snap` names
`src/parse.test.ts`, which does not, so Jest would call it obsolete: `orphan-output`. The entries are read in stage
71.

The expected result was written from the specification before the code.
