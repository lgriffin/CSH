# ADR-34: Examples are compared with examples, and disagreement is a divergence

Source: Anchor, harnesses and A3, sections 6.1 and 12 ([09](../spec/09-anchor-harness-a3.md)); countermeasure C7 of the lockout A3.

## Context

Before stage 13 an example was checked only against rules (Q-EX). Two examples that answer the same input two ways,
a scenario and a unit test say, were invisible unless a rule happened to sit between them. In the lockout example the
third wrong password is locked by the scenario and allowed by the test, and the harness said nothing about that pair.
Calling every such pair a conflict assumes the event answers one input one way, which a model may not promise
(a clock, a random choice, state the vocabulary does not name).

## Decision

A new named query, Q-DIV(E1, E2), runs on every pair of examples of one event whose sources count under different
columns (the model and intents are one column). It fails when the inputs can coincide, SAT(in1 and in2), and the
outcomes cannot both hold there, UNSAT(in1 and in2 and then1 and then2). Rules and assumptions are left out, so the
pair alone decides. A failure is an `example-divergence` with four readings and no choice among them, marked
`inputs: identical` when both examples state every field and argument with equal values and `overlapping` otherwise.
An event may be declared `deterministic: true`; then a divergence on identical inputs is an `example-conflict`.
`deterministic` joins the event's dependency digest only when true, so the digests of existing models do not change.
`signalsOf(report, manifest)` and `matches(signal, rule)` move into `@csh/check`, so the A3 reads one definition.

## Alternatives

Make every disagreement a conflict, as if every event were deterministic ([A-36](../../ASSUMPTIONS.md) names this as
the alternative). Simpler, but it asserts a property no one declared. Include rules and assumptions in Q-DIV: then a
pair whose disagreement a rule already exposes would be reported twice, once per query.

## Consequences

The account example gains one divergence (the overdraw test against `RejectAtBoundary`) and the lockout example one
before its countermeasures and two after its regression. The lockout A3 places them under the cause that already held
the count disagreement. The finding counts line gains `example-divergence`. Examples from one source are never
compared with each other (F90). The core amendments of section 6.5 are recorded in 09 and these records; tabs 00 to
08 are unchanged until their owner amends them.

## Status

Accepted provisionally (implementer's choice; stage 13)
