# F182

Mechanisms the repository names, and the gaps it records ([17](../../docs/spec/17-from-the-tutors-run.md), section 6;
stage 61).

- `.dependency-cruiser.cjs` defines the check `types-self-contained`. The proposal reads the configuration, and the
  guess names it. The told rule at `docs/layering.md:1` names that check in backticks, so it is verified by the
  configuration and is checked, at L3. The told rule at line 3 names nothing that checks it, so it is `unverified`.
- `tests/architecture/known-violations.txt` says it may only shrink. It is a baseline with two entries, a `baselined`
  gap naming both. `known-drift.txt` is a baseline with no entries, so it is no gap. `notes.txt` has a comment line but
  says nothing about shrinking, so it is not a baseline.

The expected result was written from the specification before the code.
