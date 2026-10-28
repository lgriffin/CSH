# F227

The A3 of a cold analysis ([22](../../docs/spec/22-analysis-a3-and-1.0.md), section 1; stage 77). The subject is a small
TypeScript ledger: three requirements with identifiers in `docs/requirements.md`, a test that cites `LED-1`, and a
README that links `docs/design.md`, which does not exist.

- The README's link is refuted by the tree, so it is danger, and its countermeasure comes first, whatever its count.
- `LED-2` and `LED-3` are cited by no test: two `unverified` gaps of the `Requirements` source. Their place is the
  source, because an identifier is not a path, and one countermeasure clears both.
- The test's outcome is unknown, since no results file was read: one `no-results` entry, which CSH could not decide.
- All three causes are vital: "Claims nothing checks" (2 of 4) and "Prose has drifted from the code" (3 of 4) stay
  below 80% together.
- The proposed goal closes the one danger entry.
- `csh analyse` writes the A3 beside the analysis, as JSON, Markdown and HTML.

The expected result was written from the specification before the code existed. Two things changed when it first ran,
on 28 October 2026. The `no-results` entry was missing from the expectation, and is right, so the vital causes became
three. And CSH did not read `docs/requirements.md` at all: its requirements are list items, not headings or table
rows, so the test's citation of `LED-1` was reported as a reference to nothing, refuted. That is a false refutation on
a TypeScript repository, and stage 77 reads such list items (A-276) instead of changing the expectation.
