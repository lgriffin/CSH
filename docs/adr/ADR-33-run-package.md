# ADR-33: The pipeline and the run live in their own package

Source: Anchor, harnesses and A3, section 4 ([09](../spec/09-anchor-harness-a3.md)). Supersedes [ADR-24](ADR-24-pipeline-in-cli.md).

## Context

`csh run` adds harness execution, a stored run record and runs at past commits to the pipeline that `csh check` and
`csh gate` already shared. With the pipeline inside the command line, the test kit depended on the whole command line,
and the A3 package of stage 14 would have to as well.

## Decision

Project loading, source running, the pipeline, evaluation and the run move into `@csh/run`. `@csh/cli` keeps argument
parsing, printing and `csh init`. The manifest reader is its own package, `@csh/component`. `@csh/check` still consumes
adapter output without knowing any adapter, and now receives the owner of each source and the unowned sources, never
the manifest.

## Alternatives

Keep everything in `@csh/cli` and add `run` beside `check`. Smaller now, but the test kit and the A3 builder would keep
importing the command line.

## Consequences

The test kit depends on `@csh/run` and `@csh/component` instead of `@csh/cli`. `csh check`, `csh gate` and `csh run`
compute one evaluation the same way. The faults test moved with the pipeline.

## Status

Accepted provisionally (implementer's choice; stage 10)
