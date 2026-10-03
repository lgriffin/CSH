# ADR-01: A standalone evaluator whose outputs are the gap view and joint conflicts

Source: Rationale tab, section 1; D1, D10.

## Context

Test-driven development, formal models and structured requirements each protect something, and each is judged alone. No existing tool shows where they disagree with each other.

## Decision

The harness is a standalone evaluator of what those practices already produce. Its two primary outputs are the gap view and joint conflicts: A holds, B holds, and A and B cannot both hold.

## Alternatives

Replacing the practices with one method. Building the evaluator inside one existing system first.

## Consequences

Inputs must be lifted, and lifting is partial. Whatever cannot be lifted is kept and reported as `unliftable` (P4). The result is a view for decisions, never a certificate. In the code, `check` produces findings and a gap view (`packages/check/src/run.ts`, `packages/check/src/gaps.ts`), and nothing in the report claims completeness.

## Status

Accepted (Rationale tab, section 1; first build)
