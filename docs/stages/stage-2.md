# Stage 2: Language

**Exit:** F01 to F09; F10 emits; print then emit keeps the digest for every fixture model.

**Status:** exit reached. All 51 fixtures pass at the end of the build.

## Built

- `kernel`: expression typing and units, phase rules, canonical JSON, digests, fragments, and the IR rules (`validate.ts`).
- `csl`: units as template-literal types, handles, and builders for states, events, transitions, intents, examples, policies and bindings.
- `emit`: the TypeScript check for rules S1 to S5, and sandboxed emission in a locked-down subprocess, run twice ([ADR-19](../adr/ADR-19-emission-sandbox.md)). Then rules S6 to S9, and emission errors.
- `print`: the canonical printer.

## Effort

The largest stage after the checker: about 2,700 lines of source across `kernel`, `csl`, `emit` and `print`. Effort was not timed. The build ran as one continuous session, so effort is given as code size and the number of correction rounds.

## What the fixtures revealed

- F09 compiled at first, because a comment beginning `// @ts-ignore` in the fixture suppressed the very error it describes. The fixture's comment was reworded; the rule was right.
- F01 showed that unit errors are readable: both units appear in the compiler's message ([DEPENDENCIES.md](../../DEPENDENCIES.md)).
- The printer round trip, on random models and on every fixture model, found no digest drift once canonical ordering covered every list.

## What proved wrong or costly in the documents

Node's permission model does not cover the network, so the sandbox needs in-process stubs as well ([ADR-19](../adr/ADR-19-emission-sandbox.md)). The `and(...)` phase inference was left to the implementer (Implementer's brief, section 10). The chosen rule gives the result the union of its arguments' phases, so a position that rejects any one of them rejects the whole expression. The compile-time fixtures fix the required behaviour.
