# ADR-10: Four separate result axes and no aggregate score

Source: Rationale tab, section 3; D5.

## Context

A green test or a waiver must never overwrite a verdict, and one violation outweighs any number of passes.

## Decision

Each obligation carries authority, verdict and applicability. The gate adds disposition. They are never merged into one status or a percentage.

## Alternatives

A single status. A percentage.

## Consequences

Reports are longer and need reading. `Assessment` in `packages/check/src/types.ts` and the gate decision in `packages/gate/src/gate.ts` keep the axes in separate fields.

## Status

Accepted (Rationale tab, section 3; first build)
