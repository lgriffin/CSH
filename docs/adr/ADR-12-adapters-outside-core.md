# ADR-12: Adapters sit outside the core; version 1 ships two

Source: Rationale tab, section 4; D7.

## Context

The core must stay independent of any test framework or document format.

## Decision

Adapters are separate packages that depend only on `kernel` and `witness`. Version 1 ships `adapter-witness-files` and `adapter-ears-markdown`. Each runs in an isolated subprocess ([ADR-20](ADR-20-adapter-isolation.md)).

## Alternatives

Building framework parsers into the core.

## Consequences

Other practices need adapters before they contribute. Claim sets already in IR form can be read as data ([A-13](../../ASSUMPTIONS.md)).

## Status

Accepted (Rationale tab, section 4; first build)
