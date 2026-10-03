# ADR-06: No silent assumptions and no frame rule

Source: Rationale tab, section 2; D12, P10.

## Context

Silent assumptions are the defect the tool exists to catch.

## Decision

Unmentioned state is unconstrained. Every assumption is a named fragment with a source. The gap view reports `unconstrained-after` when a transition branch leaves a field unmentioned.

## Alternatives

Treating unmentioned fields as unchanged.

## Consequences

Specifications are more verbose, and an example must state the post-state it relies on. The witness adapter lifts every post-state field it is given (`packages/adapter-witness-files/src/adapter.ts`).

## Status

Accepted (Rationale tab, section 2; first build)
