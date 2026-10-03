# ADR-03: The first build runs all nine stages end to end

Source: Rationale tab, section 1; D22.

## Context

A whole system can be evaluated holistically; a partial one hides how the parts interact.

## Decision

All nine stages were built in order without pausing for owner review, each with its stage note, READMEs, C4 sources and decision records.

## Alternatives

Pausing for owner review after each stage.

## Consequences

Choices made during the build are provisional. They are registered in [ASSUMPTIONS.md](../../ASSUMPTIONS.md) and [QUESTIONS.md](../../QUESTIONS.md), and the composition fixtures F70 to F78 are flagged for owner review.

## Status

Accepted (Rationale tab, section 1; first build)
