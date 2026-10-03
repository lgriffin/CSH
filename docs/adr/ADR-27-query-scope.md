# ADR-27: Assumption scope and the model pseudo-source

Source: Semantic contract, section 5.

## Context

The documents define queries in a shared context without saying which assumptions make it up, or which source transitions belong to.

## Decision

Assumptions apply by state and event ([A-05](../../ASSUMPTIONS.md)). Transitions and bindings belong to a pseudo-source `model` ([A-04](../../ASSUMPTIONS.md)). Downstream queries are skipped for an inconsistent state ([A-07](../../ASSUMPTIONS.md)).

## Alternatives

Applying every assumption to every query, which could make unrelated queries vacuous.

## Consequences

Open as [Q-06](../../QUESTIONS.md) and [Q-09](../../QUESTIONS.md).

## Status

Accepted provisionally (implementer's choice; first build)
