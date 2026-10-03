# ADR-18: Run TypeScript directly with Node type stripping

Source: Implementer's choice.

## Context

A build step adds a second copy of every file, and source maps between them, to a trusted base that should stay small.

## Decision

Every package's `exports` points at `src/index.ts`, and imports use `.ts` extensions. Node 22.18 and later strip types natively. `tsc` is used only for type checking.

## Alternatives

Compiling to JavaScript with `tsc` or a bundler before running.

## Consequences

Only erasable TypeScript syntax may be used: no enums, namespaces or parameter properties. The tool needs Node 22.18 or later ([A-25](../../ASSUMPTIONS.md)).

## Status

Accepted. The owner confirmed the choice behind it on 3 October 2026.
