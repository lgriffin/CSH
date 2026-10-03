# ADR-24: Sources and the pipeline live in the command line, not in the check engine

Source: Implementer's brief, section 4.

## Context

Dependencies must point inward, and adapters are outer packages. The check engine must not import them.

## Decision

`check` consumes adapter output (`SourceRun`) without knowing any adapter. Running sources and the end-to-end pipeline (`runSources`, `evaluateSpec`) live in `cli`, which may depend on everything.

## Alternatives

Putting source running in `check`.

## Consequences

The test kit depends on `cli` to run fixtures end to end.

## Status

Accepted provisionally (implementer's choice; first build)
