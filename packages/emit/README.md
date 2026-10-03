# @csh/emit

## Purpose

`@csh/emit` turns a specification module into a checked, canonical model and its digest: it type-checks the file in strict mode, evaluates it in a locked-down Node subprocess, checks the IR and pack lock, writes canonical JSON, and emits a second time in a fresh subprocess to compare digests. Specification modules are untrusted code, and this package is the boundary that keeps them from reading files, the network, the clock, randomness or the environment.

## Where it sits

It is the launcher, loader and rule checker of the "Emission sandbox" container (with `csl` and `@csh/print`), shown in the [containers diagram](../../docs/architecture/containers.mmd) and in [components-emission.mmd](../../docs/architecture/components-emission.mmd). The launcher is trusted; the module code it runs is not.

## Public interface

- `emit(file, opts)`: the full emission, returning `EmitResult`.
- `EmitResult`: either `{ ok: true, module, digest, canonical, composition }` or `{ ok: false, errors, diagnostics? }`.
- `EmitOptions`: `root`, `readable`, `lock`, `refine`, `timeoutMs`, `skipTypeCheck` and the test-only `unsafeAllowNondeterminism`.
- `EmitError`: a code (`E-ACCESS`, `E-EXPORT`, `E-TIMEOUT`, `E-EVAL`, `E-VOCAB`, `E-COMPOSE`, `E-WEAKEN`, `TS`, `S1` to `S9`, and others) with message and location.
- `runSandboxed(file, opts)`: one evaluation of the module in a fresh, locked-down subprocess.
- `typeCheck(file)`, `CompileDiagnostic`, `COMPILER_OPTIONS`: the strict TypeScript check that enforces S1 to S5.
- `Lock`, `readLock(path)`: the csh-lock/v1 file pinning pack versions and digests.
- `RefinementChecker`, `ShadowedObligation`, `CompositionReport`: the hook for checking a local obligation that replaces an inherited one, and what composition reports.

## Depends on and used by

- Depends on: `@csh/kernel` (validation, canonical form, digests) and `csl` (the sandbox runner recognises modules and reads composition metadata). External: `typescript` 5.9.3 for the strict type check; the sandbox uses Node's permission model (`--permission`, `--allow-fs-read`).
- Used by: `@csh/cli` (the `csl emit` and `csl lock` commands and the pipeline) and `@csh/testkit` (fixture runner and printer round trip).

## Invariants it protects

- A module runs with file reads limited to the specification root, installed packs and the tool's own packages; writes, child processes, workers, sockets, `fetch`, timers, `Date`, `Math.random`, crypto randomness and environment reads all fail with `E-ACCESS` (P8; main tab, section 7.1, "Deterministic emission").
- The module cannot forge a reply: `process.send` is removed before the module is imported.
- Two emissions in fresh subprocesses must give the same digest, or emission fails with S9 (P8).
- A pack import must match the lock file in version and digest, or emission fails with S8 (main tab, section 6.3, rule 1; CSH-014).
- A local obligation that replaces an inherited one is accepted only when the refinement check answers `strengthens`; any other answer, or no checker, is `E-WEAKEN` (main tab, section 6.3, rules 4 and 5; CSH-009).
- Authority is never derived here: the result is a model and a digest, nothing more (CSH-015).

## Rationale

The sandbox combines Node's permission model, an in-process lockdown before the import and double emission ([ADR-19](../../docs/adr/ADR-19-emission-sandbox.md)); untrusted code runs in locked-down subprocesses as part of the hexagonal layout ([ADR-16](../../docs/adr/ADR-16-hexagonal-monolith.md)). The emitted model is what gets digested and approved ([ADR-04](../../docs/adr/ADR-04-internal-dsl.md), [ADR-07](../../docs/adr/ADR-07-approval-follows-digest.md)). The refinement check is injected so that this package needs no solver; `@csh/check` supplies it through `makeRefiner` ([ADR-29](../../docs/adr/ADR-29-refinement-by-solver.md), [A-23](../../ASSUMPTIONS.md)). Node 22.18 or later is needed for type stripping and a stable permission model ([A-25](../../ASSUMPTIONS.md), [ADR-18](../../docs/adr/ADR-18-no-build-step.md)).

## How it is tested

- `test/sandbox.test.ts`: a well-behaved module emits; probes in `test/sandbox/` for file read, file write, network, socket, environment, clock, randomness and child processes each fail with `E-ACCESS`; with nondeterminism forced open, a module that draws randomness fails S9.
- `test/static-rules.test.ts` with `test/static-rules.ts`: every line marked as breaking S1 to S5 must fail to compile, and nothing else may.
- Fixtures: F01 to F09 (rules on the account specification; F08 is the clock probe), F10 emits cleanly, F70 to F78 (lock file, vocabulary merging, `E-WEAKEN` and relaxation). The printer round trip in `@csh/testkit` re-emits every fixture model.

## Known limits

- Isolation relies on Node's permission model and on replacing globals before the import; a Node release that changes either could weaken it. Non-configurable exports are left to the permission model.
- Two emissions that happen to draw the same random values would pass S9; the lockdown, not S9, is the main defence.
- Every emission spawns two subprocesses and runs the TypeScript compiler, which dominates run time.
