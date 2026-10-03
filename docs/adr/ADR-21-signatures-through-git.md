# ADR-21: Signature verification through git, behind a version-control port

Source: Authority tab, section 3; Implementer's brief, section 9.

## Context

Signatures must be verified programmatically for the signing methods the owner may use, and mapped to a key fingerprint.

## Decision

`gitVcs` asks git for each commit's signature status (`%G?`) and fingerprints (`%GF`, `%GP`). Trust comes only from `csh/maintainers.json` at the parent commit. A `memoryVcs` implements the same port for unit tests, and fixtures use real repositories with throwaway, test-only gpg keys.

## Alternatives

Parsing OpenPGP packets in the harness. Trusting the keyring's web of trust.

## Consequences

The harness depends on git and gpg being installed where the gate runs. SSH signatures need git's allowed-signers file ([A-26](../../ASSUMPTIONS.md), [Q-16](../../QUESTIONS.md)).

## Status

Accepted provisionally (implementer's choice; first build)
