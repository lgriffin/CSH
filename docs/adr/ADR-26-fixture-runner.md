# ADR-26: A fixture runner that checks results independently

Source: Implementer's brief, section 6.

## Context

Expected results hold only what the documents determine, never solver models verbatim.

## Decision

The test kit matches finding kinds, members, verdicts, reasons and dispositions. It checks every counterexample by exact evaluation and every no-outcome input with a fresh solver query. Before stage 7, fixtures stand in for the ledger with `authority.json` ([A-14](../../ASSUMPTIONS.md)). Stage 7 and later fixtures build real git histories signed with throwaway test-only keys.

## Alternatives

Comparing whole reports to golden files.

## Consequences

Fixtures with git need gpg installed. The fixture test fails rather than skips unless `CSH_ALLOW_GPG_SKIP=1` is set.

## Status

Accepted provisionally (implementer's choice; first build)
