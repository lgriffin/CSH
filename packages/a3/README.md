# @csh/a3

## Purpose

`@csh/a3` builds an A3: the harness's answer to one problem on one component, on one sheet. Every number on it is counted from runs, and every judgment on it is written by a person and marked with its authority ([09](../../docs/spec/09-anchor-harness-a3.md), section 5). It reads two inputs, the stage records under `csh/a3/<slug>/stages/` and the judgments in `csh/a3/<slug>/judgments.json`, builds one model (`csh-a3/v1`) and renders that model, and nothing else, to Markdown and to one self-contained HTML page. [The A3 guide](../../docs/guides/a3.md) shows how to write one.

## Where it sits

It is the "A3" container, shown in the [containers diagram](../../docs/architecture/containers.mmd). Its components (stage records, the builder, measures, the skeleton, the two renderers) are in [components-a3.mmd](../../docs/architecture/components-a3.mmd). `csh a3` in `@csh/cli` finds its inputs: stored runs, authority from the ledger, and files at a stage's commit. The package itself reads no clock, no ledger and no git, so the same inputs always give the same sheet. It is not trusted: it reads reports and gate decisions and can change neither.

## Public interface

- `Judgments`, `Pointer`, `JUDGMENTS_SCHEMA`: the judgments file, `csh-a3-judgments/v1`, with structured match rules (`Match` from `@csh/check`) and decision points keyed by practice id.
- `StageRecord`, `readStage(dir, id)`, `stageIntegrity(stage)`, `STAGE_FILES`, `a3Dir`, `stageDir`, `SLUG`: one stage's `run.json`, `report.json` and `gate.json`, and whether the two files are the ones the run record names.
- `readJudgments(root, slug)`, `validateJudgments(v)`: the judgments file's bytes, whose digest the ledger approves, and its structural problems.
- `buildA3(input)`, `BuildInput`, `A3Model`, `A3_SCHEMA`, `labelOf`, `pareto`: the model: stages, lanes, the Pareto, decision points, measures, root causes with resolved evidence, countermeasure status, follow-up and problems.
- `MEASURES`, `measureValues`: the eight default measures, each with an id so the judgments can override its target.
- `renderMarkdown(model)`, `renderHtml(model)`, `authorityLine`, `UNWRITTEN`: the two renderings.
- `skeleton(stage, practices)`: the judgments `csh a3 open` writes.
- `Problem`, `ProblemKind`, `Authority`, `CountermeasureStatus`, `SheetStage`, `SheetSignal`: the records the model carries.

## Depends on and used by

- Depends on: `@csh/check` (report types, `signalsOf`, `matches`), `@csh/component` (practice types) and `@csh/kernel` (digests). No external packages.
- Used by: `@csh/cli` (`csh a3` and approvals of `#a3/<slug>`) and `@csh/testkit` (F91 to F95).

## Invariants it protects

- A signal no cause places is shown as unclassified and listed as a problem; it is never dropped, so a new kind of finding appears on the sheet the first time it occurs (section 5.2).
- Checks on the judgments are reported, never repaired: `unclassified`, `dead-rule`, `dangling-pointer`, `unknown-practice`, `unanswered`, `unverifiable`, and `missing-stage` (section 5.5).
- An empty judged section renders as "Not yet written.", never as blank space, so a half-finished sheet cannot pass for a finished one (section 5.8).
- A stage's Tests column counts every test that finished: those whose witnesses the report's executions hold, once each, and those that recorded no witness, read from the `unobserved-test` gaps' details, with no change to the report's schema ([A-67](../../ASSUMPTIONS.md)).
- The model depends only on its inputs: no clock and no commit hash, so continuous integration can compare it with the committed copy.
- The authority shown is the one given, from the judgments' digest in the ledger; the package cannot make a sheet approved, and an A3 never changes a verdict or a gate decision (section 5.6; [ADR-31](../../docs/adr/ADR-31-a3-judgments-through-the-ledger.md)).

## Rationale

The sheet is computed where it can be and judged where it must be, so an agent can draft root causes without its draft passing for approved ([ADR-31](../../docs/adr/ADR-31-a3-judgments-through-the-ledger.md)). Stage records are committed so the sheet outlives its branches ([A-35](../../ASSUMPTIONS.md)). The builder takes authority and file contents as inputs, so the package stays a pure function of files ([ADR-35](../../docs/adr/ADR-35-a3-package.md)). The extensions to the judgments format, the scope of `dead-rule`, and the status rules are [A-45](../../ASSUMPTIONS.md) to [A-47](../../ASSUMPTIONS.md).

## How it is tested

- `test/a3.test.ts`: signals counted and placed by cause and lane; a test counted once however many witnesses it records; a test that recorded no witness counted from its `unobserved-test` gap, with the old subject or the source-qualified one; countermeasure status for clears, expects, a named stage and scope; every problem kind; a file pointer read at the stage's commit, and one that cannot be read; the eight measures and a target override; the same model for the same inputs; stage integrity; "Not yet written." for a skeleton; the authority line; escaping and no external loads in the page.
- `packages/cli/test/a3.test.ts`: `csh a3 open`, `build --check`, `stage`, `verify` and an approval of `#a3/<slug>` on a copy of the lockout example.
- Fixtures F91 to F95 through `@csh/testkit`, and the lockout walkthrough, whose committed sheet `csh a3 build --check` compares in CI.
- The gate component's sheet, opened from its first run and left for its owner ([csh/a3/dispositions](../gate/csh/a3/dispositions/a3.md)), whose committed copy `packages/cli/test/a3.test.ts` compares with a fresh build.

## Known limits

- The judgments say nothing the tool can check about whether a root cause is the right one; it checks only that pointers resolve and that rules place real signals (section 13).
- The lanes picture places each practice's lanes in one row and every hub lane in one column; a component whose hand-offs are not lanes reads less well.
- A file pointer is resolved only where the stage's commit can be read; elsewhere it is reported as dangling, with the reason.
