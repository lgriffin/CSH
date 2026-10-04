# Dependencies

Every external dependency, with its purpose and pinned version (Implementer's brief, rule 10). Versions are exact in
each `package.json`, and `pnpm-lock.yaml` pins the full tree. The kernel has no dependencies at all.

## Runtime

| Dependency | Version | Used by | Purpose |
| --- | --- | --- | --- |
| [z3-solver](https://www.npmjs.com/package/z3-solver) | 5.2.0 | `@csh/solver` | Z3's official JavaScript bindings (WebAssembly). Decides every query in linear integer arithmetic (D15, [ADR-09](docs/adr/ADR-09-z3-lia.md)). |
| [typescript](https://www.npmjs.com/package/typescript) | 5.9.3 | `@csh/emit`, `@csh/testkit` | The compiler API checks rules S1 to S5 and units at emission time ([ADR-04](docs/adr/ADR-04-internal-dsl.md)). Also the workspace type checker, and the compiler that turns each package into JavaScript when it is packed ([A-40](ASSUMPTIONS.md)). |
| [@types/node](https://www.npmjs.com/package/@types/node) | 22.20.5 | `@csh/emit` | Node's type definitions, the type roots emission type-checks a specification with, so that an installed tool carries them ([A-51](ASSUMPTIONS.md)). |

## Development

| Dependency | Version | Purpose |
| --- | --- | --- |
| [pnpm](https://pnpm.io) | 10.28.0 | Workspace-aware package manager, chosen once ([ADR-17](docs/adr/ADR-17-toolchain.md)). Pinned in `packageManager`. |
| [vitest](https://www.npmjs.com/package/vitest) | 3.2.7 | The one test runner. |
| [fast-check](https://www.npmjs.com/package/fast-check) | 4.10.2 | Property tests: typing soundness, evaluator against solver, printer round trip. |
| [@types/node](https://www.npmjs.com/package/@types/node) | 22.20.5 | Node type definitions for the workspace's type checking. |

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

## Verification checklist (anchor, harnesses and A3, section 14.1)

The six points the anchor design asks to verify before building on them ([09](docs/spec/09-anchor-harness-a3.md),
section 14.1). Each was checked on 3 October 2026 by running code with Node 22.22, unless it says otherwise.

- [x] **A reporter for Node's test runner and the probe agree on a test's identity.** Inside a test, the context gives `t.fullName` (the names of the enclosing suites and tests and its own, joined by ` > `) and `t.filePath`. A custom reporter receives `test:start`, `test:pass` and `test:fail` events with `name`, `nesting` and `file`. Start events arrive in definition order, so the reporter rebuilds the full name from the names of the open tests at each nesting level. Both sides therefore see the same file and the same full name. Suites report `details.type` of `suite` and are not tests. Tests with the same name in the same file cannot be told apart; their identity is ambiguous ([A-39](ASSUMPTIONS.md)).
- [x] **CSL accepts an event on a state with no fields.** `s.state("Gate", {})` with an event on it, a transition over its arguments and result, emits, and `csh check` runs every query on it with no finding. The stateless gate decision needs no placeholder state.
- [x] **Emission accepts a system with no vocabulary.** A specification holding only a system name and one `s.source(...)` emits, and `csh check` completes on it. Rung 1 of the ladder needs nothing more.
- [x] **`pnpm pack` on a private package, and running it from `node_modules`.** `pnpm pack` packs a package marked private. Installed with npm into another directory, a package whose exports point at TypeScript fails with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`: Node does not strip types under `node_modules`. A packed package needs compiled JavaScript. This affects [ADR-18](docs/adr/ADR-18-no-build-step.md) and is open as [Q-18](QUESTIONS.md) ([A-40](ASSUMPTIONS.md)).
- [x] **`csh run --at` when a past commit's dependencies differ.** A worktree created inside the project resolves packages from the project's own `node_modules`, the mechanism authorship already relies on. A commit whose dependencies differ would therefore run against the current ones without saying so. The run compares the commit's `package.json` and lock files with the working tree's and refuses with `dependencies-differ` when they differ ([A-38](ASSUMPTIONS.md)).
- [x] **The divergence query within the solver budget.** Measured in stage 15 on one event with N examples in each of two sources, every pair with overlapping inputs and differing outcomes, on a development container: 5 per source (25 queries) took 491 ms in total and at most 198 ms for one query; 10 (100) took 867 ms, at most 32 ms; 20 (400) took 3,022 ms, at most 35 ms; 40 (1,600) took 12,140 ms, at most 1,086 ms. About 8 ms a query, so the total grows with the square of the examples per event while every single query stays well inside the 5,000 ms budget. The lockout example asks 16 Q-DIV queries in 135 ms ([stage 13](docs/stages/stage-13.md)).

## Verification checklist (next layers, section 11.1)

The six points the next-layers design asks to verify before building on them ([10](docs/spec/10-next-layers.md),
section 10). Each was checked on 4 October 2026 with Node 22.22, unless it says otherwise.

- [~] **A repository variable holding the pinned root cannot be changed by a pull request.** On GitHub a repository variable (`vars.CSH_ROOT_COMMIT`) is set in the repository's settings by someone with admin access; it is not a file, so no commit or pull request carries it. A pull request can, however, change the workflow that reads it: the variable binds only as long as `.github/workflows` is protected, which is step 8 of the owner's runbook and a hosting-service setting the harness cannot see ([10](docs/spec/10-next-layers.md), section 3.3). Not checked here against the hosting service's own documentation, which could not be fetched from the build container. Conservative handling: when the variable is empty or absent, as it may be for a workflow run from a fork, `csh status` reports the root as taken from history, never as pinned.
- [x] **Signature verification through git in a runner once the public key is imported.** In a fresh `GNUPGHOME` with no keys, git reports an OpenPGP-signed commit as `E` (cannot check). After `gpg --import` of the exported public key only, git reports `U` (good signature, validity unknown to the keyring), and `%GF` and `%GP` give the full fingerprint, upper case, exactly as `gpg --list-secret-keys` gave it on the signing machine. The ledger accepts `G` and `U` and decides validity from `csh/maintainers.json` alone (`packages/ledger/src/vcs.ts`), so importing the key is all a runner needs. Git must not be told to use SSH signatures (`gpg.format`); a runner's default is OpenPGP.
- [x] **The Model Context Protocol's TypeScript library.** The package is [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk), version 1.32.0 on 4 October 2026, Node 18 or later. It serves tools over standard input and output through `StdioServerTransport` (`@modelcontextprotocol/sdk/server/stdio.js`), and its `Client` with `StdioClientTransport` drives such a server, which is what the scripted client needs. It pulls in an HTTP stack (express, hono and others) that the standard-input transport does not use.
- [x] **The diagram adapter reads every line of `containers.mmd`.** Every line of `docs/architecture/containers.mmd` at this commit is one of: a `%%` comment, `C4Container`, `title`, `Person(id, "label")`, `System_Boundary(id, "label") {`, `}`, `Container(id, "label", "technology", "description")`, `System_Ext(id, "label", "technology")` or `Rel(from, to, "label")`. It draws 25 relations. The adapter reads that subset; any other line is kept as unliftable with its text.
- [x] **The import scan handles re-exports and dynamic imports.** TypeScript's own parser (`typescript` 5.9.3, already a dependency) gives every `import` and `export ... from` declaration with its type-only flag, `import("x")` with a literal argument, `require("x")`, `import x = require("x")` and `typeof import("x")`, and none of the look-alikes inside comments or strings. A dynamic `import(name)` whose argument is not a literal cannot be resolved: the scan records it as skipped, with its file and line, rather than dropping it.
- [x] **The merge base of a pull request can be run in CI.** `csh run --at` refuses a commit whose dependency files or workspace packages differ from the working tree's (A-38, A-55), and a pull request that changes any package the gate component resolves is exactly that case, so `csh diff` cannot run the merge base inside the head's checkout. A second worktree at the merge base with its own `pnpm install --frozen-lockfile` can: checked here at a commit of stage 10, the install took under two seconds from the store and the base's own `csh` ran. The CI diff job runs the base that way, and `csh diff` reads the base run it stored; when the base cannot be installed or run, the diff says `base-unavailable` ([Q-21](QUESTIONS.md)).
