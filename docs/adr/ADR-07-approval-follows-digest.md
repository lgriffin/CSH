# ADR-07: Approval follows the digest of the emitted model

Source: Rationale tab, section 2; D18.

## Context

Formatting and renaming should not cost a re-approval; any change of meaning should.

## Decision

Each fragment has a digest over its canonical JSON and the digests of the declarations it references. An approval names that digest. When the digest changes, the fragment returns to candidate with reason `digest-changed`.

## Alternatives

Resetting approval on any edit. Digesting source text.

## Consequences

Canonical form is in the trusted base and must be exactly right (`packages/kernel/src/canonical.ts`, `packages/kernel/src/fragments.ts`). The kernel tests pin a digest, and fixtures F40, F41 and F46 cover a meaning change, a rename and a unit change.

## Status

Accepted (Rationale tab, section 2; first build)
