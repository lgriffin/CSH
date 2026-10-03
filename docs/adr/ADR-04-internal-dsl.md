# ADR-04: An internal DSL in TypeScript; the emitted model is the contract

Source: Rationale tab, section 2; D2, D8, D16, D19.

## Context

Specifications must be easy to write and read, typed, and unit-checked, and approvers must recognise the wording of structured requirements.

## Decision

CSL is an internal DSL in TypeScript (`packages/csl`). Units are template-literal types, so the TypeScript compiler rejects unit mismatches. Requirement fields keep the EARS words `while`, `when` and `shall`. The emitted JSON model, not the source text, is the contract.

## Alternatives

A standalone grammar with its own parser. YAML. Extending existing requirement files.

## Consequences

A specification file is code. Approval therefore attaches to the emitted model, and emission runs in a sandbox ([ADR-19](ADR-19-emission-sandbox.md)). The static rules S1 to S5 are enforced by the compiler (`packages/emit/src/typecheck.ts`), and S6 to S9 by the emitter.

## Status

Accepted (Rationale tab, section 2; first build)
