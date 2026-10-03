# ADR-29: Strengthening is accepted only when the solver shows it

Source: Main tab, section 6.3.

## Context

Composition rule 4 allows strengthening by a refinement check or a recorded review, and no document defines the review record.

## Decision

Only the solver check is implemented. Anything other than `strengthens` fails emission with `E-WEAKEN`, unless the profile relaxes the obligation explicitly, naming an owner and a reason ([A-23](../../ASSUMPTIONS.md)).

## Alternatives

A new ledger decision kind for refinement review.

## Consequences

Decided in [Q-02](../../QUESTIONS.md). Fixtures F74 to F76 cover strengthening, weakening and relaxation.

## Status

Accepted. The owner confirmed the choice behind it on 3 October 2026.
