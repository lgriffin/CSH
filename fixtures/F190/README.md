# F190

A test title cites nothing when the repository has no identifier scheme
([19](../../docs/spec/19-from-the-typescript-run.md), section 2; stage 63).

The Markdown files name one identifier, `REQ-1`, once, so the proposal finds no scheme. `test/decode.test.ts` has
tests titled with `WTF-8`, a tracker key `JIRA-123`, and `REQ-1` and `REQ-2`. None of them is a citation of something
the repository defines, so the test file is not a dangling reference, and the guesses say that tests cite nothing.

The expected result was written from the specification before the code.
