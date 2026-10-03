# ADR-23: A solver cache and an evidence store, both conservative

Source: Implementer's choice.

## Context

Repeated `csh check` runs re-ask identical solver queries and re-judge unchanged witnesses.

## Decision

`.csh-cache/solver.json` maps a digest of the solver identity, vocabulary and assertions to `sat` or `unsat` answers only. `.csh-cache/evidence.json` maps witness digest and obligation to a judgement, reused only when every dependency digest matches. `--no-cache` bypasses the solver cache.

## Alternatives

No caching. Caching unknown answers.

## Consequences

An unknown answer is always re-asked. A stale cache entry can never turn into a pass, because keys include every input digest.

## Status

Accepted provisionally (implementer's choice; first build)
