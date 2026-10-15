# Stage 61: What the tutors-mono-repo run asked for

**Exit:** fixtures F179 to F183, written from [17](../spec/17-from-the-tutors-run.md) before the code. Every subject in
CI still meets its expected results and its `analysis-expected.json`. A cold read of tutors-mono-repo at `1279669`
reports none of the false findings of [issue 85](https://github.com/lgriffin/CSH/issues/85).

**Status:** exit reached. `BUILT_THROUGH_STAGE` is 61.

## Built

- `run` (`propose`):
  - Features leave out fixtures and dot-directories (A-206).
  - A dependency-cruiser configuration joins `Documents` (A-211).
  - Shrink-only text files form a `Baselines` source of the documents practice (A-212).
- `adapter-items`:
  - `tests` records each TypeScript test file's titles (A-205), reads a vitest-cucumber file in its dialect (A-207), reads
    a step string as its value, and reads a `const` step text (A-209).
  - `gherkin` records an outline's steps as written (A-208).
  - `common` and `markdown` read a mentioned path with its whole sentence (A-210), read checks and baselines (A-211,
    A-212), and read specification prose in Gherkin (A-213).
- `check`:
  - `trace` resolves an identifier with case ignored (A-204), resolves a path from the mentioning file's directory, and
    leaves absent and elsewhere paths unchecked (A-210).
  - `trace` binds a scenario by a test's title, and reports a `baselined` gap.
  - `steps` matches vitest-cucumber definitions and outline templates, and binds by title (A-205, A-207, A-208).
- [Q-57](../../QUESTIONS.md) to [Q-59](../../QUESTIONS.md) record the choices left open.

## What the run revealed

Before the stage, the cold read of tutors-mono-repo at `1279669` reported 193 gaps, 1 indeterminate and 0 converged,
20 of the gaps refuted. After it, the read reports 74 gaps, 1 indeterminate and 0 converged, none refuted:

| | Before | After |
|---|---|---|
| Refuted danger | 20, all false | 0 |
| `undefined-step` | 142, all false | 0 |
| `unused-step-definition` | 6, all false | 0 |
| `unverified` | 25 told rules | 21 told rules, and 46 scenarios of specification prose |
| `baselined` | not read | 7 baselines: 67 knip findings, 52 known gaps, 15 features with no Rule, 8 response headers, 6 suite findings, 4 manifest drifts, 3 layering violations |

The 46 specification scenarios are those of `guides/specifications/*.md` that no test runs. The repository says so of
them, and its own README lists 19 as covered by nothing. A told rule that names its dependency-cruiser check
(`guides/SHARED-TYPES.md:4`) is now checked.

Of the 21 told rules still `unverified`, the stage 60 reading stands: each names no mechanism and no test cites it. Some
are sentences about data rather than code, which [Q-57](../../QUESTIONS.md) records. Two cite a rule as prose
("Rule 0130"), which is not read (17, section 8).

ESI.ts changes by one gap: `guides/LOGGING.md:336` names `src/core/logger/logger.ts` in a sentence that says it "was
removed", so the file's absence is no longer a dangling reference. Its expected count is now 113 gaps, and the
prose-drift A3 is rebuilt to match. No other subject changes.

No test outcome is read for tutors-mono-repo, because it commits no results file. So nothing converges, and its 197 L3
items stay checked rather than explained.
