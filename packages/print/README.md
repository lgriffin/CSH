# @csh/print

## Purpose

`@csh/print` is the canonical printer: it renders any csh-ir/v1 model, fragment or expression back as CSL TypeScript. It lets people review lifted claims and emitted models in the same notation as hand-written specifications, since approval is of the emitted model and not of the source text.

## Where it sits

It belongs to the "Emission sandbox" container, with `csl` and `@csh/emit`, shown in the [containers diagram](../../docs/architecture/containers.mmd) and in [components-emission.mmd](../../docs/architecture/components-emission.mmd). It runs in the main process; it reads a model and writes text, and never evaluates module code.

## Public interface

- `printModule(m)`: the whole model as a CSL module that imports from `csl`.
- `printFragment(m, kind, node)`: one fragment in the notation it would have inside its container, used by `csh explain` and `csh approve`.
- `printExpr(e, ctx)`: one expression in the notation of a position (step, `now`, assumption).
- `Printer`: the class behind the three functions.

## Depends on and used by

- Depends on: `@csh/kernel` (model types and canonical ordering). No external packages.
- Used by: `@csh/cli` (`csl print`, and fragment rendering in `csh explain` and the decision commands) and `@csh/testkit` (the printer round trip test).

## Invariants it protects

- Emitting printed text reproduces the original digest, so what a reviewer reads is exactly what is approved (P1, CSH-017; main tab, section 7.6).
- Output is independent of the order in which the model lists its declarations (P8).
- Integers beyond the safe JavaScript range print as `bigint` literals, so no value is rounded (P4).
- Content with no source form is not invented: pack imports and unliftable entries are left out rather than approximated, and unliftable content stays visible in the report (P4, CSH-002).

## Rationale

An internal DSL means a source file may compute its obligations, so the containment is to approve the emitted IR and show it through a canonical printer ([ADR-04](../../docs/adr/ADR-04-internal-dsl.md), [ADR-07](../../docs/adr/ADR-07-approval-follows-digest.md)). Lifted claims arrive as IR from adapters ([ADR-12](../../docs/adr/ADR-12-adapters-outside-core.md)), and the printer is how they are read. Packs are not printed ([A-21](../../ASSUMPTIONS.md)).

## How it is tested

- `test/print.test.ts`: arithmetic and comparisons as handle methods, `now` and argument references outside a step, the function form of `and` and `or`, `bigint` literals, independence from declaration order, and a single binding fragment.
- `packages/testkit/test/roundtrip.test.ts`: on random models (fast-check) and on every fixture model that uses no pack, printing then emitting reproduces the digest.
- Fixtures: through the round trip, every fixture from F01 onward whose specification emits without packs; F77 is named in its README as a round-trip exit test.

## Known limits

- `use(...)` of a pack is not printed, so models with packs (F70 to F76, F78) are outside the round trip ([A-21](../../ASSUMPTIONS.md)).
- Unliftable entries have no CSL form and are not printed.
- Units print as generated constant names such as `u_minor_EUR`, not the names the author chose, because local TypeScript names are not part of the model.
