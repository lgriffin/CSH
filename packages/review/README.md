# @csh/review

## Purpose

`@csh/review` says what a change did to the results ([10](../../docs/spec/10-next-layers.md), section 5). It takes two
stored runs of one component, the base's and the head's, and returns a `csh-diff/v1` model: fragments added, removed
and changed, rules whose authority, verdict, applicability or disposition moved, signals that appeared and cleared,
tests that came and went, which practices' inputs changed, and a few plain observations. It renders the model for a
reviewer, with what costs them a decision first. It decides nothing; the gate does that.

## Where it sits

It is the "Change review" container of the [containers diagram](../../docs/architecture/containers.mmd), called by
`csh diff` in the command line. Its functions are drawn in
[components-review.mmd](../../docs/architecture/components-review.mmd). It is outside the trusted base: it reads
results and never produces a verdict.

## Public interface

- `diffRuns(base, head, ctx?)`, `RunDiff`: the model. Each side is a `RunSide` (`run`, `report`, `gate` and, when the run kept it, `model`) or an `Unavailable` (`{ unavailable: reason }`). `ctx.changes` is the paths changed between the two commits and `ctx.manifest` the component's manifest; without them the observations about the change and the practices' inputs are left out.
- `renderDiff(diff)`: the text of section 5.2. Sections in order: approvals lost; new violations and conflicts on approved rules; rules that became unknown or stale; new signals among candidates; signals cleared; observations; then authority moved, when any did; then one line of counts. An empty section says `none`.
- `describeSignal(signal)`, `describeObservation(observation)`: one line each, as the rendering uses them.
- `RunSide`, `Unavailable`, `ManifestView`, `Observation`, `ObligationMove`, `DiffContext`.

## Depends on and used by

- Depends on: `@csh/check` (`Report`, `Signal`, `signalsOf`), `@csh/kernel` (`fragmentsOf`, `Module`, `compareCodePoints`), `@csh/gate` (`GateDecision`), `@csh/run` (`RunRecord`). No external packages.
- Used by: `@csh/cli` (`csh diff`), `@csh/testkit` (F108 to F112).

## Invariants it protects

- Signals are matched by id, which is stable across runs; a signal is appeared, cleared or persisting, never changed.
- A side that could not be had is never shown as no change: the model says which side is missing and why, and holds the other side's signals and rules alone ([A-77](../../ASSUMPTIONS.md)).
- An observation is a statement about the change ("the implementation and its tests changed in one change"), never a verdict or an accusation ([10](../../docs/spec/10-next-layers.md), section 5.1).
- Everything is computed from the two runs and the changed paths; nothing is read, run or decided here.

## Rationale

A reviewer of a pull request wants to know what the change did, not the whole state of the component. The run
already holds the state; the diff is the difference between two of them, with the approvals and violations a person
must act on put first ([10](../../docs/spec/10-next-layers.md), section 5.2). Fragments come from the kept model when
there is one, else from the obligations the report assesses, so stage records without a model still diff
([A-84](../../ASSUMPTIONS.md)).

## How it is tested

- `test/review.test.ts`: a run against itself is empty with `none` in every section; swapping sides swaps appeared and cleared; an unavailable side is never an empty diff; observations need the changed paths and the manifest.
- Fixtures F108 to F112 (through `@csh/testkit`): signals matched by id, an approval lost, the base unavailable, the observations and inputs of a change, and the empty sections.
- The lockout walkthrough diffs each pair of its four stages and checks the pattern: conflicts cleared, then approvals gained, then one new violation of an approved rule.

## Known limits

- Which practice's inputs changed is read from the paths its sources, adapter, step table and harness arguments name; a test file reached only through a glob or a configuration file is not seen ([A-85](../../ASSUMPTIONS.md)).
- Both sides must be runs of the same component; the model does not check that their manifests agree.
