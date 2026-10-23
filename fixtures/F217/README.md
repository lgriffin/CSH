# F217

Jest snapshot entries, in TypeScript ([21](../../docs/spec/21-test-suites-as-evidence.md), section 3; stage 71,
A-266).

`src/cart.test.ts` declares, inside `describe("cart")` and `describe("total")`, a test that makes two snapshots (one
with the hint `empty`), a skipped test, and a test whose title is a template with no placeholder. Its snapshot file
holds an entry for each, and one more, `cart total removes a line 1`, that names no test: every title in the file is
a literal, so the entry is `obsolete-snapshot`. The skipped test's entry is not obsolete: Jest keeps the entries of a
test it skips.

The expected result was written from the specification before the code.
