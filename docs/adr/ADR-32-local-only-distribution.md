# ADR-32: Distribution is local only; nothing is published to npm

Source: Anchor, harnesses and A3, sections 10.4 and 13 ([09](../spec/09-anchor-harness-a3.md)).

## Context

A visitor cannot use the harness on their own code: every package is private and none is published.

## Decision

Nothing is published to npm. Every package keeps `"private": true`, so nothing can be published by accident. A user
installs from the clone, from tarballs made by `pnpm pack`, or through a path dependency.

**Revisited in stage 60.** [16](../spec/16-analyse-danger-grain.md), section 7, asked how a stranger runs CSH ([Q-51](../../QUESTIONS.md)). The
chosen answer keeps the decision and adds two ways in, neither of which publishes to a registry:

- **A tagged tarball release.** Pushing a tag `v*` runs `.github/workflows/release.yml`: it packs every package as
  F96 does, installs the bundle into an empty directory outside the repository, runs `csh analyse` from there, and
  attaches the bundle and each tarball to a GitHub release of the tag. Every package keeps `"private": true`.
- **An Action.** `action.yml` runs `csh analyse` from the Action's own source at the ref it is used at, so no tarball
  is needed; CI uses it on a subject in the job `Action`.

npm stays out until a second maintainer joins. Cutting a tag is the owner's.

## Alternatives

Publish the packages to npm under a scope.

## Consequences

The starter's fixture (F96) installs from packed tarballs into a directory outside the repository. A packed package
must run from `node_modules`, which Node will not strip types in, so packing needs compiled JavaScript
([Q-18](../../QUESTIONS.md)).

## Status

Accepted. Decided by the owner on 3 October 2026. Revisited on 14 October 2026 (stage 60, Q-51 as proposed; issue 78
asks the owner to confirm).
