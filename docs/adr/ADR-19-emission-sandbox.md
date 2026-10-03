# ADR-19: Emission sandbox: Node permission model, in-process lockdown and double emission

Source: Language reference, section 7; D14.

## Context

Emission runs specification code, which must not reach files, network, environment, clock or randomness.

## Decision

Each module is emitted in a fresh Node subprocess started with `--permission`, reads limited to the tool and the specification's directories, no child processes, workers or addons, and an empty environment. Before the module is imported, the runner replaces `Date`, `Math.random`, `crypto` randomness and network entry points with functions that fail with `E-ACCESS`. The module is emitted twice in two subprocesses, and differing digests fail with `S9`.

## Alternatives

An in-process virtual machine (`node:vm`), which is not a security boundary. A container per emission.

## Consequences

Each emission starts two subprocesses. Node's permission model does not cover the network, so network denial relies on the in-process lockdown. The sandbox tests probe every channel (`packages/emit/test/sandbox.test.ts`).

## Status

Accepted provisionally (implementer's choice; first build)
