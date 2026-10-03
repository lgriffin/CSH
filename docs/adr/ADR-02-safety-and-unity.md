# ADR-02: Safety and unity govern every choice

Source: Rationale tab, section 1; D3.

## Context

The goal is safe AI-assisted development across varied kinds of requirement.

## Decision

Every design choice is judged against two goals: safety (nothing turns a passing run or a persuasive explanation into approved conformance) and unity (one model, one language, one vocabulary of results).

## Alternatives

Optimising for coverage numbers. Optimising for speed of adoption.

## Consequences

Some convenient features are refused: no aggregate score, no automatic approval, no inference of predicates from prose. Where the documents were silent, the build took the option that yields unknown or rejects ([ASSUMPTIONS.md](../../ASSUMPTIONS.md)).

## Status

Accepted (Rationale tab, section 1; first build)
