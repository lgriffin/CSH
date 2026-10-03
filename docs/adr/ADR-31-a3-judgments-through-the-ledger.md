# ADR-31: A3 judgments are approved through the ledger, like an obligation

Source: Anchor, harnesses and A3, sections 5.6 and 13 ([09](../spec/09-anchor-harness-a3.md)).

## Context

An A3 mixes numbers counted from runs with judgments only a person can make: the root cause, the countermeasures, the
plan. An agent can write a persuasive root cause, so a judgment needs the same authority as any other fragment.

## Decision

The judgments file of an A3 has a digest and the fragment name `#a3/<slug>`. It is candidate until an intent owner
approves that digest through the ledger, by signed commit, exactly as for an obligation. The sheet's header states
its authority: candidate, approved, or approved (self-approved). Any edit returns it to candidate. An A3 never
changes a verdict or a gate decision; it reads them.

## Alternatives

Treat the A3 as documentation with no authority, reviewed like any pull request. That lets an agent's root cause read
as settled.

## Consequences

`csh approve` accepts `#a3/<slug>` as a target. The `a3` package reads authority and never decides it. Fixture F95
covers the return to candidate.

## Status

Accepted. Decided by the owner on 3 October 2026.
