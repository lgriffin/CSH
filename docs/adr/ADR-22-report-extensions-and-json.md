# ADR-22: Report extensions, and two JSON forms

Source: Semantic contract, section 6; Joint evaluation, section 6.

## Context

The report needs places for unliftable content, harness errors, executions and ledger problems. Digests need one canonical form, while output files should stay readable.

## Decision

The report adds fields marked "Extension" ([A-01](../../ASSUMPTIONS.md)). Digests use `canonicalJson`, with sorted keys and integers as strings. Report, model and gate files use `stableJson`, with sorted keys and numbers kept, so that they are byte-identical across runs.

## Alternatives

Leaving those facts out of the report. One JSON form for both purposes.

## Consequences

Consumers must ignore fields they do not know. The incremental-equals-full fixtures compare `stableJson` output.

## Status

Accepted provisionally (implementer's choice; first build)
