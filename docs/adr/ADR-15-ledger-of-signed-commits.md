# ADR-15: Authority lives in a ledger of signed commits

Source: Rationale tab, section 5; D4, D9, D13, D17.

## Context

An agent can edit any file but cannot sign as a person. Solo work is the starting reality.

## Decision

Decisions are lines in `csh/ledger.ndjson`, valid only when committed alone and signed by a person key listed in `csh/maintainers.json` at the parent commit. Solo self-approval is allowed and marked. It ends when a second person is listed, and earlier self-approvals then need review.

## Alternatives

An approval keyword in source. A separate approval service. Relying on branch rules. Requiring two people from day one.

## Consequences

Protection depends on where keys are kept and where the gate runs. Self-approval is weaker and is flagged in every report and gate decision. See `packages/ledger/src/ledger.ts` and fixtures F42, F43, F60 to F64.

## Status

Accepted (Rationale tab, section 5; first build)
