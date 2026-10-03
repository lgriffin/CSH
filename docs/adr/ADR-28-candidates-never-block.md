# ADR-28: Candidate fragments never change an approved obligation's verdict

Source: Semantic contract, section 4.

## Context

An agent can write candidate fragments freely. If a candidate could make an approved obligation conflicting, an agent could block delivery or hide a violation behind a conflict.

## Decision

A finding counts against an approved obligation only when every member is approved ([A-10](../../ASSUMPTIONS.md)). Findings with candidate members are still reported, and the gate lists them as never blocking.

## Alternatives

Counting every finding.

## Consequences

Decided in [Q-10](../../QUESTIONS.md).

## Status

Accepted. The owner confirmed the choice behind it on 3 October 2026.
