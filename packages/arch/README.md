# @csh/arch

## Purpose

`@csh/arch` evaluates architecture rules. A rule written with the `forbid`, `only` and `closed` builders of `csl` is compared with the container diagram an Architecture source reads and the dependency facts a Facts source reads ([10](../../docs/spec/10-next-layers.md), sections 4.1 and 4.3). No solver is involved: packages and containers are finite sets and every comparison is a set comparison, so every result is exact.

## Where it sits

It is the "Architecture rules" container of the [containers diagram](../../docs/architecture/containers.mmd), called by the check engine. Its functions are drawn in [components-arch.mmd](../../docs/architecture/components-arch.mmd). It is in the trusted base, since it produces verdicts.

## Public interface

- `evaluateRule(rule, facts, diagram)`, `RuleResult`: a rule against current facts: `violated` with each dependency that breaks it, `holds`, or `unknown` for a container the diagram lacks or a `closed` rule with no diagram.
- `conflictingRelations(rule, diagram)`: the drawn relations a rule forbids, which the check engine reports as `arch-conflict`.
- `undrawnDependencies(diagram, facts)`, `unobservedRelations(diagram, facts)`, `unplacedPackages(diagram, facts)`: the diagram against the facts, for the gaps `undrawn-dependency`, `unobserved-relation` and `unplaced-package`.
- `selects(sel, package, diagram)`, `containersOf(diagram, package)`, `unknownContainers(rule, diagram)`, `sameName(a, b)`, `bareName(name)`: selectors and name matching.
- `describeDependency(dep)`: a dependency as a witness reads, `file:line: from -> to`, marked `(manifest)` or `(type-only)`.
- `ArchDiagram`, `ArchFacts`, `ArchDependency`: the inputs, structurally; the adapter output of `@csh/witness` fits them.

## Depends on and used by

- Depends on: `@csh/kernel` (`ArchRule`, `ArchSel`, `compareCodePoints`). No external packages.
- Used by: `@csh/check` (`check/src/arch.ts`, `assess.ts`).

## Invariants it protects

- Every result is a set comparison over what the diagram and the facts list; nothing is inferred, translated or guessed ([10](../../docs/spec/10-next-layers.md), section 4.3).
- A `forbid` or `only` rule is violated by a named dependency, with its file and line as the witness; a type-only import counts and is flagged ([A-74](../../ASSUMPTIONS.md)).
- A drawn relation conflicts with a rule only when each end lies wholly inside what the rule names ([A-81](../../ASSUMPTIONS.md)).
- A relation to a person or an external system, or a dependency inside one container, is never a gap ([A-82](../../ASSUMPTIONS.md)).

## Rationale

A missing arrow is not a prohibition unless someone says so, which is what `closed` is for ([10](../../docs/spec/10-next-layers.md), section 4.1; [A-73](../../ASSUMPTIONS.md)). Package names match with or without their scope, so rules read as the diagram does ([A-79](../../ASSUMPTIONS.md)).

## How it is tested

- `test/arch.test.ts`: selector matching, each rule form against facts (including a property: no dependency breaks no `forbid` rule), conflicts only where an element is wholly inside the rule, and the three diagram-against-facts comparisons.
- Fixtures F100 to F107 (through `@csh/testkit`), end to end through the check engine.

## Known limits

- Only the container level is read; the component diagrams stay tested for presence ([10](../../docs/spec/10-next-layers.md), section 4.5).
- A dependency that runs through a subprocess, a pipe or a file is invisible to the facts, so its drawn relation shows as `unobserved-relation`.
