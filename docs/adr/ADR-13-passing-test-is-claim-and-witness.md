# ADR-13: A passing test lifts as both a claim and a witness

Source: Rationale tab, section 4.

## Context

A passing test is its author asserting that the outcome is right, so it can conflict with other claims.

## Decision

Each passing witness record becomes an example claim, lifted through the bindings read in reverse, as well as a witness judged against approved obligations. Failing records are kept as witnesses and executions only.

## Alternatives

Treating tests as witnesses only.

## Consequences

Lifted examples state every post-state field recorded. See `packages/adapter-witness-files/src/adapter.ts` and fixture F24.

## Status

Accepted (Rationale tab, section 4; first build)
