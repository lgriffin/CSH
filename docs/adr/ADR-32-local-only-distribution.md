# ADR-32: Distribution is local only; nothing is published

Source: Anchor, harnesses and A3, sections 10.4 and 13 ([09](../spec/09-anchor-harness-a3.md)).

## Context

A visitor cannot use the harness on their own code: every package is private and none is published.

## Decision

Nothing is published to npm. Every package keeps `"private": true`, so nothing can be published by accident. A user
installs from the clone, from tarballs made by `pnpm pack`, or through a path dependency.

## Alternatives

Publish the packages to npm under a scope.

## Consequences

The starter's fixture (F96) installs from packed tarballs into a directory outside the repository. A packed package
must run from `node_modules`, which Node will not strip types in, so packing needs compiled JavaScript
([Q-18](../../QUESTIONS.md)).

## Status

Accepted. Decided by the owner on 3 October 2026.
