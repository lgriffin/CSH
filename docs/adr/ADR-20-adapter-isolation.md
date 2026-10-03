# ADR-20: Adapters run isolated and receive bytes, not paths

Source: Evidence tab, section 4.

## Context

Adapters are untrusted. The harness, not the adapter, decides what an adapter may read.

## Decision

The harness reads each source's files and passes their bytes, the vocabulary and the bindings to the adapter over IPC. The adapter runs in a subprocess with `--permission`, reads limited to the tool's own packages, and an empty environment. A crash, timeout or malformed output becomes an `adapter-failed` diagnostic.

## Alternatives

Running adapters in the main process. Letting adapters open files by path.

## Consequences

Each adapter run costs a subprocess. The fault-injection tests show that a crashing or hanging adapter never yields a satisfied obligation (`packages/cli/test/faults.test.ts`).

## Status

Accepted provisionally (implementer's choice; first build)
