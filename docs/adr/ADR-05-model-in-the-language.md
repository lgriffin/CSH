# ADR-05: The formal model is written in the language itself

Source: Rationale tab, section 2; D11.

## Context

A shared vocabulary is needed before claims from different practices can be compared, and preservation of invariants needs a model of behaviour.

## Decision

States, events and transitions are written in CSL from stage 2. They ground the vocabulary that adapters lift into.

## Alternatives

Importing Z, TLA+ or Alloy. Adding a model later.

## Consequences

The model is limited to linear integers, enumerations and booleans, with no concurrency in version 1. Q-PRES and Q-MEET check the model's transitions against invariants and requirements (`packages/solver/src/queries.ts`).

## Status

Accepted (Rationale tab, section 2; first build)
