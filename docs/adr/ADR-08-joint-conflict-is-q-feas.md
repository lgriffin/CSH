# ADR-08: A joint conflict is an input with no valid outcome (Q-FEAS)

Source: Rationale tab, section 3.

## Context

Two rules that are each satisfiable can still collide on overlapping inputs, and plain joint satisfiability misses that.

## Decision

Q-FEAS asks whether some pre-state and arguments exist for which no post-state and result satisfy all applicable obligations together. The input found is reported, and the solver's unsatisfiable core is minimised to a minimal conflicting set.

## Alternatives

Checking only that the conjunction is satisfiable. Checking pairs only.

## Consequences

The query is quantified, so it may be slow and may return unknown. An unknown becomes an `unknown` finding, never a pass. The test kit checks every reported input independently (`packages/testkit/src/verify.ts`).

## Status

Accepted (Rationale tab, section 3; first build)
