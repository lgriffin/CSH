# Stage 12: Scenario adapter

**Exit:** F86, plus every earlier fixture and both walkthroughs.

**Status:** exit reached.

## Built

- `adapter-gherkin`: the lockout example's Gherkin adapter as a package. The step table moved into the project (`csh/steps.ts`), named by the scenarios practice's `steps` setting. The cited source moved to the practice's `cites` setting. Unit conversions stay in the source's `units.json`. Behaviour is unchanged: an unknown step keeps the scenario whole as unliftable, and a tag shaped like an identifier becomes a citation.
- `run`: hands the adapter the step table's file URL and lets the sandbox read that one file. `Scenarios` sources use the package by default ([A-43](../../ASSUMPTIONS.md)). An adapter's `run` may now return a promise, since loading the table is an import.

## The three corners

- C4: the scenario lifter in [components-adapters.mmd](../architecture/components-adapters.mmd), and `adapter-gherkin` named in the Adapters container.
- Docs: the package README, [the step table guide](../guides/steps.md), the lockout README and walkthrough.
- Examples: the lockout example uses the package with `csh/steps.ts`; `examples/lockout/adapters/` is gone. The lockout walkthrough's counts are unchanged, and the A3's one change is where the step definitions live.

## Effort

Small: about 30 lines changed in the adapter itself (loading the table, reading the cited source from the practice), 20 in `run`, and the tests. No correction rounds.

## What the fixtures revealed

- F86: the unknown-step span had to stay the span of the step, not of the scenario, so a reader goes straight to the phrase the table lacks.

## What proved wrong or costly in the documents

- The design moves the table into the project but does not say how the adapter learns which event the scenarios are about; the example's adapter took the vocabulary's first event. The table may now export `event`, and with several events and none named nothing is lifted ([A-43](../../ASSUMPTIONS.md)).
