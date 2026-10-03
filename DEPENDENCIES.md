# Dependencies

Every external dependency, with its purpose and pinned version (Implementer's brief, rule 10). Versions are exact in
each `package.json`, and `pnpm-lock.yaml` pins the full tree. The kernel has no dependencies at all.

## Runtime

| Dependency | Version | Used by | Purpose |
| --- | --- | --- | --- |
| [z3-solver](https://www.npmjs.com/package/z3-solver) | 5.2.0 | `@csh/solver` | Z3's official JavaScript bindings (WebAssembly). Decides every query in linear integer arithmetic (D15, [ADR-09](docs/adr/ADR-09-z3-lia.md)). |
| [typescript](https://www.npmjs.com/package/typescript) | 5.9.3 | `@csh/emit` | The compiler API checks rules S1 to S5 and units at emission time ([ADR-04](docs/adr/ADR-04-internal-dsl.md)). Also the workspace type checker. |

## Development

| Dependency | Version | Purpose |
| --- | --- | --- |
| [pnpm](https://pnpm.io) | 10.28.0 | Workspace-aware package manager, chosen once ([ADR-17](docs/adr/ADR-17-toolchain.md)). Pinned in `packageManager`. |
| [vitest](https://www.npmjs.com/package/vitest) | 3.2.7 | The one test runner. |
| [fast-check](https://www.npmjs.com/package/fast-check) | 4.10.2 | Property tests: typing soundness, evaluator against solver, printer round trip. |
| [@types/node](https://www.npmjs.com/package/@types/node) | 22.20.5 | Node type definitions for type checking. |

## System tools

| Tool | Version tested | Purpose |
| --- | --- | --- |
| Node.js | 22.22.0 locally; 22 and 24 in CI | Runs TypeScript directly through type stripping ([ADR-18](docs/adr/ADR-18-no-build-step.md)). Needs 22.18 or later ([A-25](ASSUMPTIONS.md)). |
| git | 2.43.0 | History, commit identity and signature status for the ledger ([ADR-21](docs/adr/ADR-21-signatures-through-git.md)). |
| GnuPG | 2.4.4 | Verifies OpenPGP commit signatures. The fixtures also use it to generate throwaway, test-only keys in a temporary home. |

## Documentation tooling (not installed in the workspace)

The C4 diagrams in `docs/architecture/` were rendered to SVG with
[@mermaid-js/mermaid-cli](https://www.npmjs.com/package/@mermaid-js/mermaid-cli) 11, installed outside the repository
and run once. It is not a dependency of the tool. See `docs/architecture/README.md`.

## Verification checklist (Implementer's brief, section 9)

Each item was checked on 3 October 2026, against the current documentation and by running code in this repository.

- [x] **Z3's JavaScript bindings.** The package is `z3-solver`, version 5.2.0. At run time it reports Z3 5.1.0.0 through `Z3.get_full_version()`; the package and library version numbers differ. Unsatisfiable cores with tracked assertions work: each tracked assertion is asserted as an implication from a fresh Boolean, and `unsatCore()` returns those Booleans after `check(...)` is called with them as assumptions. The minimality property test checks every reported set (`packages/solver/test/solver.test.ts`). Quantified integer formulas work: Q-FEAS uses a universal quantifier over the post-state and result, and fixtures F20 to F22 depend on it. The test runner uses forked processes rather than worker threads, so that each test file loads its own WebAssembly instance.
- [x] **A Node subprocess with access denied.** Node's permission model is enabled with `--permission`, which is stable from Node 22.13 and 23.5 (the flag was `--experimental-permission` before). It denies file reads and writes outside `--allow-fs-read` paths, child processes, worker threads, native addons (`--no-addons`) and WASI. It does **not** cover the network in Node 22 or 24. The emission sandbox therefore also replaces every network entry point (`net`, `tls`, `http`, `https`, `http2`, `dgram`, `dns`, `fetch`, `WebSocket`) in the subprocess before the module is imported. The subprocess starts with an empty environment, and `process.env` is replaced by a proxy that denies every read. The clock and randomness are replaced the same way. Every channel is probed by `packages/emit/test/sandbox.test.ts`, each failing with `E-ACCESS` ([ADR-19](docs/adr/ADR-19-emission-sandbox.md)).
- [~] **Verifying a commit signature and mapping it to a fingerprint.** Git reports the verification status with `%G?`, the signing key's fingerprint with `%GF` and the primary key's fingerprint with `%GP`. For OpenPGP this was verified end to end: fixtures F42, F43 and F60 to F64 create real repositories, generate throwaway ed25519 keys and sign commits. For SSH signatures, git verifies only against a file named by `gpg.ssh.allowedSignersFile`, and `%GF` gives the `SHA256:` key fingerprint. That path is implemented but untested here, because the build container has no `ssh-keygen`. It is open as [Q-16](QUESTIONS.md) ([A-26](ASSUMPTIONS.md)).
- [x] **Readable unit errors.** A unit mismatch gives errors like this one, from fixture F01: `Argument of type 'Int<"minor(USD)", "pre">' is not assignable to parameter of type 'Int<"minor(EUR)", "pre">'`, followed by `Type '"minor(USD)"' is not assignable to type '"minor(EUR)"'`. Both units appear in the message, at the line of the comparison.
- [x] **Q-FEAS within the budget.** With the default budget of 5,000 ms per query, Q-FEAS returns `sat` or `unsat` on every base fixture. No fixture reports `solver-timeout`. The 51 fixtures run in about 45 seconds in total, including two emissions per module and the git fixtures.
