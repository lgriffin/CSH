# ADR-16: A hexagonal modular monolith with untrusted code in locked-down subprocesses; MIT licence

Source: Rationale tab, section 5; D6, D14, D20.

## Context

Ports keep the solver, sandbox and version control replaceable, and one process is simple to run.

## Decision

One TypeScript workspace of thirteen packages with inward dependencies. The solver, version control and subprocesses sit behind ports with fakes. Specification modules and adapters run in permission-restricted subprocesses. The licence is MIT.

## Alternatives

Separate services. An in-process virtual machine for untrusted code. Apache-2.0.

## Consequences

There is a subprocess start-up cost for every emission and adapter run, and no explicit patent grant. The sandbox mechanism was verified ([DEPENDENCIES.md](../../DEPENDENCIES.md)).

## Status

Accepted (Rationale tab, section 5; first build)
