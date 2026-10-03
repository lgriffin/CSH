# Stage 14: A3

**Exit:** the lockout sheet through the product path, F91 to F95, plus every earlier fixture and both walkthroughs.

**Status:** exit reached.

## Built

- `a3`: stage records and their integrity, the judgments format `csh-a3-judgments/v1` with structured matches, the model `csh-a3/v1`, the eight default measures, the checks on the judgments, the skeleton, and the Markdown and HTML renderers ([ADR-35](../adr/ADR-35-a3-package.md)).
- `cli`: `csh a3 open`, `stage`, `build [--check]` and `verify`; `csh approve #a3/<slug>`; `csh run` names `csh a3 open <slug>` after a cross-source conflict or an enforcing block.
- `check`: the report lists every example with its source and citations (`examples`), for the measure "examples that cite a requirement"; a gap's source is read from its subject.
- `testkit`: A3 fixtures, built from `inputs/component.json` and `inputs/csh/a3/<slug>/`, with authority through a real, signed ledger. `BUILT_THROUGH_STAGE` is 14.

## The three corners

- C4: the A3 container in [containers.mmd](../architecture/containers.mmd) and its [component diagram](../architecture/components-a3.mmd).
- Docs: the package README, [the A3 guide](../guides/a3.md), the command line, check and test kit READMEs, the root README, the lockout README and walkthrough, [ADR-35](../adr/ADR-35-a3-package.md), [A-45 to A-47](../../ASSUMPTIONS.md).
- Examples: the lockout example's `a3/` directory is gone. Its judgments are `csh/a3/three-practices/judgments.json`, rules rewritten as structured matches, and its sheet is `a3.md`, `a3.html` and `a3.json` beside them. The walkthrough makes four commits, runs each with `csh run`, records each with `csh a3 stage`, and ends with `csh a3 build --check` and `csh a3 verify`. Its `expect` lines are gone: the committed `a3.json` holds every count, and the script decides nothing itself.

## What moved on the lockout sheet

Every count equals the committed sheet's, apart from these:

- The hub lane counts 6 signals before the countermeasures, not 5: the stage-13 divergence is placed where the practices first meet.
- The eighth measure, examples that cite a requirement: 2 of 7 before, 8 of 8 at every later stage, when the unit tests cite their sentences (stage 11).
- C7 is verified, because the divergence it expects appears at the first stage; C8 is verified, because the eighth measure meets its target at the last stage. Both were "proposed".
- Q6's answer and evidence now describe the built query, and Q2 and Q7 point at checked evidence (a quoted line of `src/lockout.ts` at the first stage, and the regression's conflict) instead of prose.
- The `unbound` rule on the "witness keys" lane placed nothing at any stage; the builder reported it as a dead rule, and the rule was removed from the judgments. The lane stays, with no rule.

## Effort

Large: about 600 lines in `a3`, 200 in the command line, 80 in the test kit, the lockout judgments rewritten, and the
tests. Correction rounds: the fixtures' A3 inputs first sat under `inputs/a3/` rather than the component layout
`inputs/csh/a3/`, and `--check` had to become a flag of the argument parser.

## What the fixtures revealed

- F94: building a sheet from a tampered stage still works, and shows dead rules, since the edited report lost its findings. Integrity belongs to `verify`, which reports the stage as `stage-mismatch` before re-running anything.
- F95: the A3's ledger name needs a container, `<component>/#a3/<slug>`, so the ledger's role rule reads it as an intent-owner decision.

## What proved wrong or costly in the documents

- Section 5.4 has no way to verify C8, which section 12 verifies by a measure; a countermeasure may name a measure ([A-45](../../ASSUMPTIONS.md)).
- Section 5.5 does not say which rules can be dead; only placing rules can ([A-46](../../ASSUMPTIONS.md)).
- Section 5.7 says stage records are committed, but the lockout example's stages are made by a script whose commit hashes change on every run; they are committed in the scratch repository, and the sheet leaves hashes out ([A-47](../../ASSUMPTIONS.md)).
