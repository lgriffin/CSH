# ADR-14: Requirement sentences are cited, not translated

Source: Rationale tab, section 4; D21.

## Context

Turning prose into a predicate is interpretation and belongs to a person, and a reworded sentence should void the approval of a predicate that cites it.

## Decision

The EARS adapter identifies sentences, classifies their pattern and records a digest of their text. A person-written requirement cites them. An approval records the text digests it saw, and a changed digest returns the fragment to candidate with reason `source-text-changed`.

## Alternatives

Generating predicates from prose by rules or by a language model.

## Consequences

A person writes every predicate. See `packages/adapter-ears-markdown/src/adapter.ts`, `resolveAuthority` in `packages/ledger/src/authority.ts`, and fixtures F50 to F52.

## Status

Accepted (Rationale tab, section 4; first build)
