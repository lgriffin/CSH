# Decision records

Records ADR-01 to ADR-16 are the rows of the Rationale tab. ADR-17 onward record choices made during the build. Each has five headings: Context, Decision, Alternatives, Consequences, Status.

| Record | Decision |
| --- | --- |
| [ADR-01](ADR-01-standalone-evaluator.md) | A standalone evaluator whose outputs are the gap view and joint conflicts |
| [ADR-02](ADR-02-safety-and-unity.md) | Safety and unity govern every choice |
| [ADR-03](ADR-03-all-stages-end-to-end.md) | The first build runs all nine stages end to end |
| [ADR-04](ADR-04-internal-dsl.md) | An internal DSL in TypeScript; the emitted model is the contract |
| [ADR-05](ADR-05-model-in-the-language.md) | The formal model is written in the language itself |
| [ADR-06](ADR-06-no-frame-rule.md) | No silent assumptions and no frame rule |
| [ADR-07](ADR-07-approval-follows-digest.md) | Approval follows the digest of the emitted model |
| [ADR-08](ADR-08-joint-conflict-is-q-feas.md) | A joint conflict is an input with no valid outcome (Q-FEAS) |
| [ADR-09](ADR-09-z3-lia.md) | Z3 with linear integer arithmetic |
| [ADR-10](ADR-10-four-axes.md) | Four separate result axes and no aggregate score |
| [ADR-11](ADR-11-check-never-blocks.md) | `csh check` exits zero when it completes; only the gate blocks |
| [ADR-12](ADR-12-adapters-outside-core.md) | Adapters sit outside the core; version 1 ships two |
| [ADR-13](ADR-13-passing-test-is-claim-and-witness.md) | A passing test lifts as both a claim and a witness |
| [ADR-14](ADR-14-cite-not-translate.md) | Requirement sentences are cited, not translated |
| [ADR-15](ADR-15-ledger-of-signed-commits.md) | Authority lives in a ledger of signed commits |
| [ADR-16](ADR-16-hexagonal-monolith.md) | A hexagonal modular monolith with untrusted code in locked-down subprocesses; MIT licence |
| [ADR-17](ADR-17-toolchain.md) | pnpm workspaces, Vitest and fast-check |
| [ADR-18](ADR-18-no-build-step.md) | Run TypeScript directly with Node type stripping |
| [ADR-19](ADR-19-emission-sandbox.md) | Emission sandbox: Node permission model, in-process lockdown and double emission |
| [ADR-20](ADR-20-adapter-isolation.md) | Adapters run isolated and receive bytes, not paths |
| [ADR-21](ADR-21-signatures-through-git.md) | Signature verification through git, behind a version-control port |
| [ADR-22](ADR-22-report-extensions-and-json.md) | Report extensions, and two JSON forms |
| [ADR-23](ADR-23-caches.md) | A solver cache and an evidence store, both conservative |
| [ADR-24](ADR-24-pipeline-in-cli.md) | Sources and the pipeline live in the command line, not in the check engine |
| [ADR-25](ADR-25-drafts-never-commit.md) | Decision commands draft a ledger line and never commit |
| [ADR-26](ADR-26-fixture-runner.md) | A fixture runner that checks results independently |
| [ADR-27](ADR-27-query-scope.md) | Assumption scope and the model pseudo-source |
| [ADR-28](ADR-28-candidates-never-block.md) | Candidate fragments never change an approved obligation's verdict |
| [ADR-29](ADR-29-refinement-by-solver.md) | Strengthening is accepted only when the solver shows it |
| [ADR-30](ADR-30-anchor-is-the-gate.md) | The first real component is the gate's own disposition decision |
| [ADR-31](ADR-31-a3-judgments-through-the-ledger.md) | A3 judgments are approved through the ledger, like an obligation |
| [ADR-32](ADR-32-local-only-distribution.md) | Distribution is local only; nothing is published |
| [ADR-33](ADR-33-run-package.md) | The pipeline and the run live in their own package (supersedes ADR-24) |
| [ADR-34](ADR-34-example-divergence.md) | Examples are compared with examples, and disagreement is a divergence |
