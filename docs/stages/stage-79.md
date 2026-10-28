# Stage 79: Labelled precision

**Exit:** every TypeScript subject of [22](../spec/22-analysis-a3-and-1.0.md), section 4, has a labels file that its cold
analysis meets in CI, and the false entries labelling found are fixed or reported.

**Status:** exit reached. `BUILT_THROUGH_STAGE` is 79; F229 holds the fixes.

Leigh, 28 October 2026: "go with your labels", so the labels are drafted by the agent and gate the release without a
review of each; and "No let's fix problems and get the Java benches in before we go and publish".

## Built

- **`csh analyse --labels <file>`** (`check/labels.ts`). A `csh-labels/v1` file names the subject's repo and commit and
  judges each gap and indeterminate entry, by outcome, kind and subject, true or false with a sentence. The analysis
  prints the precision overall and per kind, records it in `csh-analysis.json`, and exits 1 when an open entry is
  unlabelled, a label names no entry, the labels judge another commit, or a refuted entry is labelled false.
- **Labels** for ESI.ts, tutors-mono-repo, taskboard and lgriffin/TypeScript in `evaluation/labels/`, and two CI jobs:
  `labelled`, which fetches each subject at its labelled commit and must meet its labels, and `benchmark`, which reads
  Apache Camel 4.23.0 and Hadur_Robot cold and reports them without failing. Both write the time and peak memory to the
  job summary. The lockout example is not a subject: a cold analysis of it inside this repository reads CSH's profile.
- **Fixes**, each found by a label and each in F229 or the fixtures it changes:
  - A module named without its extension (`src/adapters/PipelineTransport`) resolves (A-278).
  - A file a sentence calls former, folded, merged, superseded or excluded is not dangling, in a Verified by field too
    (A-279).
  - A told rule whose line names its own check (a `pnpm lint:layers`, a `*.rules.cjs`) is checked by it (A-280).
  - A path written from a fixture's root, or a feature a test loads from it, resolves from further up (A-281).
  - An ignored directory named without its slash is ignored (A-282).
  - A dated record, or a plan's `Landed`, `Done when` or `Brief`, is not lifted as a rule (A-283).
  - jest-cucumber's steps are matched whole and ignoring case, as it matches them, not as Cucumber expressions (A-284).
  - A directory named `step-fixtures` or `report_fixtures` is a fixture directory (A-285).
  - A `Given` called in a unit test that loads no feature is test data, not a step definition (A-286).
  - The cases of a suite with no accepted output are one indeterminate entry, not a gap each (A-287, Q-85).

## What labelling found

Each subject read cold on 28 October 2026, before and after the fixes:

| Subject | Commit | Open before | Open after | True after | Precision |
| --- | --- | ---: | ---: | ---: | ---: |
| ESI.ts | `2a2da8a` | 82 | 48 | 30 | 63% |
| tutors-mono-repo | `d350404` | 76 | 74 | 61 | 82% |
| taskboard | `ce2767c` | 4 | 4 | 4 | 100% |
| lgriffin/TypeScript | `a91e938` | 298 | 18 | 17 | 94% |

- **ESI.ts.** 10 of its 13 refuted references were false: build output, folded guides, extensionless modules and paths
  from a fixture's root. 2 refuted remain, both true: ROADMAP names `src/sde/schemas.ts`, which moved, and CHARTER names
  `buildError` in a file that does not declare it. 10 step gaps were test data or jest-cucumber's literal steps. The
  false entries left are 14 `unverified` sentences that describe rather than rule, and 4 `symbol-undecided` names
  declared in `scripts/` and `tests/`, code outside the profile's code practice.
- **tutors-mono-repo.** 13 false `unverified` sentences: descriptions, a FAQ answer, a walkthrough.
- **lgriffin/TypeScript.** All 282 `unaccepted-case` gaps were false: 42 cases in `skippedTests`, most others set an
  option the runner skips, and the rest compile clean with no emit and no type baselines, so write nothing. They are
  now two indeterminate entries, one per suite, which list the cases. One `unpaired-outputs` is false: copies of
  upstream baselines kept as test data under `tsc/testdata/fixtures`.
- **The ESI.ts profile** drops six false dangling references (113 gaps to 107), and its prose-drift A3 is rebuilt with
  them gone from every stage from v11.0.0.

Cost, on one CI-sized machine: ESI.ts 8 s, tutors-mono-repo 7 s, taskboard 3 s, lgriffin/TypeScript 67 s, Apache Camel
(16,867 Java files) 138 s.
