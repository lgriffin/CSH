# F218

Vitest snapshot entries, in TypeScript ([21](../../docs/spec/21-test-suites-as-evidence.md), section 3; stage 71,
A-266). Vitest joins a test's describe titles and its own with ` > `, and writes a hint the same way.

`src/case.test.ts` declares only literal titles. Its entries `case > upper > shouts 1` and
`case > upper > shouts > loud 2` name its test, read with Vitest's separator; `case > lower 1` names none, so it is
`obsolete-snapshot`.

`src/slug.test.ts` declares a `test.each` whose title has a `%s` placeholder and a test whose title is a template with
a placeholder. CSH cannot read either name, so the entries that name no literal test are `snapshot-undecided`, naming
the file, and none is called obsolete. Its entry for the literal test `drops spaces at the ends` is matched.

The expected result was written from the specification before the code.
