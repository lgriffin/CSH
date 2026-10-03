# ADR-09: Z3 with linear integer arithmetic

Source: Rationale tab, section 3; D15.

## Context

The predicate subset must be decidable, and minimal sets need unsatisfiable cores.

## Decision

Z3 through the `z3-solver` package, behind the `SolverPort` interface (`packages/solver/src/port.ts`). A fake solver (`packages/solver/src/fake.ts`) injects crashes, timeouts and garbage.

## Alternatives

Another solver. Staying solver-neutral.

## Consequences

One solver is in the trusted base. Its JavaScript bindings were verified for tracked assertions, cores and quantified integer formulas ([DEPENDENCIES.md](../../DEPENDENCIES.md)).

## Status

Accepted (Rationale tab, section 3; first build)
