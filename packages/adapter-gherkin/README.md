# @csh/adapter-gherkin

## Purpose

`@csh/adapter-gherkin` reads BDD scenarios in Gherkin and lifts each one as an example claim, through the project's own step table: a list of phrases, by keyword, each mapped to the witness keys it sets, which the specification's bindings then turn into model terms. Tags shaped like requirement identifiers become citations. Scenarios are read, never executed ([A-37](../../ASSUMPTIONS.md); [09](../../docs/spec/09-anchor-harness-a3.md), section 3.3). [The step table guide](../../docs/guides/steps.md) shows how to write a table.

## Where it sits

It belongs to the "Adapters" container, shown in the [containers diagram](../../docs/architecture/containers.mmd), as the scenario lifter in [components-adapters.mmd](../../docs/architecture/components-adapters.mmd). `@csh/run` runs it in the isolated adapter subprocess, for sources of kind `Scenarios` or a practice that names it, and lets that subprocess read the project's step table file and nothing else of the project.

## Public interface

- `adapter`, `manifest`: the adapter (id `csh.adapter.gherkin`, input kind `Scenarios`, produces claims).
- `run(input)`: loads the step table from the file URL in `input.config.steps`, then lifts; returns a promise.
- `runWith(input, table)`: lifts with a table already loaded.
- `StepDefinition`, `StepTable`, `Effect`, `Value`, `Part`: the types a project's `csh/steps.ts` uses. The module exports `steps`, and optionally `event`, the event its scenarios are about.
- `readStepTable(module)`: checks a loaded module's shape.
- `parse(text)`, `exampleName(title)`, `readConversions(value, span, diagnostics)`: the Gherkin reader, example naming and the unit conversions of `units.json`.

## Depends on and used by

- Depends on: `@csh/kernel` (model types) and `@csh/witness` (the adapter contract). No external packages: the Gherkin reader is its own, and covers Feature, Rule, Scenario, Example, tags and steps.
- Used by: no package imports it at run time. `@csh/run` names it in `BUILTIN_ADAPTERS` for the kind `Scenarios` and depends on it so that it resolves. `examples/lockout/csh/steps.ts` and fixture F86 use its types and its table format.

## Invariants it protects

- A scenario is lifted whole or not at all: an unknown step, a line it cannot read, a Scenario Outline or a Background makes the whole scenario unliftable, with the span of the step that stopped it (P4).
- A quantity keeps the unit the scenario wrote; it is converted only by a conversion recorded in the source's `units.json`, where a team reviews it as a decision.
- A tag cites only the source the practice's `cites` setting names; with none, the tag is reported (`citation-without-source`) rather than attached to a guessed source.
- A missing or malformed step table is an error, and no scenario is lifted from a partial table.
- With several events in the vocabulary and no `event` exported by the table, nothing is guessed (`event-unnamed`).
- Lifting never approves: an example lifted through a candidate binding is noted and stays candidate (P1).

## Rationale

The lockout example carried this adapter with its step table compiled in. Moving the table into the project leaves the package generic and keeps the project's phrases where the project reviews them. Adapters stay outside the core ([ADR-12](../../docs/adr/ADR-12-adapters-outside-core.md)) and run isolated with bytes as input ([ADR-20](../../docs/adr/ADR-20-adapter-isolation.md)); the step table is the one file of the project the sandbox may read.

## How it is tested

- `test/adapter.test.ts`: lifting through the table with a citation; an unknown step and an outline kept whole with their spans; units kept or converted by `units.json`; a tag with no cited source reported; the event named by the table when the vocabulary has several; malformed tables refused; a table imported from a project file, and a missing table reported; parsing and example names; conversions.
- Fixture F86: the package with a project step table, through the isolated runner.
- `examples/lockout/walkthrough.sh`: the lockout scenarios through `csh/steps.ts`.

## Known limits

- The step table file may import nothing from the project, since the sandbox lets the adapter read that one file only; type-only imports are fine, because they are erased.
- Scenario Outline, Background and data tables are not lifted.
- Every scenario in one source is about one event.
