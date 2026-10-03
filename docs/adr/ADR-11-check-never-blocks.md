# ADR-11: `csh check` exits zero when it completes; only the gate blocks

Source: Rationale tab, section 3; P6.

## Context

Reporting and judging are separate powers.

## Decision

`csh check` exits 0 whenever the run completes, whatever it found. Only `csh gate` in enforcing mode exits non-zero, on an overall block.

## Alternatives

Failing the build from the checker.

## Consequences

There are two commands where one might seem enough. See `packages/cli/src/csh.ts` and `exitCode` in `packages/gate/src/gate.ts`.

## Status

Accepted (Rationale tab, section 3; first build)
