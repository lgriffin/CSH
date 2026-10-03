# ADR-17: pnpm workspaces, Vitest and fast-check

Source: Implementer's brief, section 5.

## Context

The brief asks for one workspace-aware package manager and one test runner, chosen once and recorded.

## Decision

pnpm workspaces with exact pinned versions, Vitest as the single test runner (forked pool, since the solver loads WebAssembly), and fast-check for property tests.

## Alternatives

npm or Yarn workspaces. Node's built-in test runner, which lacks property testing and parameterised tables.

## Consequences

Contributors need pnpm. Every dependency is listed in [DEPENDENCIES.md](../../DEPENDENCIES.md).

## Status

Accepted provisionally (implementer's choice; first build)
