# @csh/check

## Purpose

`@csh/check` is the check engine behind `csh check`: it pools the emitted model with adapter output, type-checks lifted claims, runs the named queries, turns failing or unknown answers into findings with minimal sets, judges witnesses against obligations, builds the gap view and assembles the csh-report/v1 report. It reports and never blocks; deciding whether delivery proceeds is the gate's job.

## Where it sits

It is the main part of the "Check engine" container, with `@csh/solver`, shown in the [containers diagram](../../docs/architecture/containers.mmd). Its pipeline (pool, typing of lifted claims, queries and minimisation, witness judging, gap view, report) is drawn in [components-check.mmd](../../docs/architecture/components-check.mmd).

## Public interface

- `check(opts)`, `CheckOptions`, `CheckResult`, `DEFAULT_BUDGET_MS`: one complete evaluation, returning the report, the prepared pool and the resolved authority.
- `Report`, `Finding`, `FindingKind`, `Member`, `Gap`, `GapView`, `Cell`, `Assessment`, `EvidenceRecord`, `MethodStatus`, `ReportError`, `Verdict`, `Applicability`, `TOOL_VERSION`: the report and its records.
- `Authority`, `AuthorityInfo`, `AuthorityResolver`, `ALL_CANDIDATE`, `resolveAll`: authority as an injected function; with none, every fragment is candidate.
- `prepare(module, runs)`, `Prepared`, `SourceRun`, `SourcedWitness`: steps 1 and 2 of joint evaluation (add adapter output, type-check lifted claims).
- `buildPool`, `Pool`, `runQueries`, `QueryOutcome`, `SolverCheckStatus`, `assumptionsFor`, `stateOfEvent`, `sourceColumn`, `findingId`, `sortFindings`: steps 3 and 4 (queries and findings), including Q-DIV, the comparison of examples from different sources.
- `judge`, `JudgeContext`, `witnessValue`, `refsOfObligation`, `termsOfObligation`: judging one witness against one obligation.
- `EvidenceStore`, `EvidenceDeps`, `MemoryEvidenceStore`, `loadEvidenceStore`, `saveEvidenceStore`: the dependency digests each piece of evidence was recorded against.
- `assess(input)`, `AssessInput`, `toolDigest`: verdict, applicability and methods for every obligation.
- `gapView(input)`, `GapInput`, `subjectsOf`: the gap view, plus citation errors.
- `SolverCache`, `cachingSolver`: a caching solver port that keeps only `sat` and `unsat`.
- `renderReport(report)`, `renderGaps(report)`, `DIVERGENCE_READINGS`: the human-readable report, generated from the report JSON alone, and the four readings of a divergence.
- `Report.examples` (extension): every example in the pool with its source and the items it cites, for the A3's measure "examples that cite a requirement".
- `signalsOf(report, manifest?)`, `matches(signal, rule)`, `Signal`, `Match`, `PracticeMap`: every item of a report a reader may have to place, with its fragments, sources and practices, and the structured rule that places it.
- `makeRefiner(solver, budgetMs)`, `Replacement`: the refinement check that `@csh/emit` calls for replaced inherited obligations.

## Depends on and used by

- Depends on: `@csh/kernel`, `@csh/solver` and `@csh/witness` (witness and adapter output types, `witnessDigest`). No external packages.
- Used by: `@csh/run` (pipeline), `@csh/cli` (commands, rendering), `@csh/gate` (report and assessment types) and `@csh/testkit`.

## Invariants it protects

- The check engine never reads the ledger; authority arrives as an `AuthorityResolver`, and without one every fragment is candidate (P6, CSH-015).
- A passing execution is kept in `executions` separately from every verdict (P2, CSH-004).
- A missing policy, missing binding, missing key, skipped query or solver unknown leaves the verdict `unknown` with a reason, never `satisfied` (P3, CSH-006; [A-02](../../ASSUMPTIONS.md)).
- One valid violating witness makes an approved obligation `violated`, whatever passes elsewhere, and the report names the witness and its reasons (P2, CSH-005).
- Without an approved binding, a witness is not applicable (P1, CSH-003).
- Evidence whose stored dependency digests differ from the current ones is `stale` (P5, CSH-007; [A-15](../../ASSUMPTIONS.md)).
- Consistency, vacuity, example agreement and preservation run over the specification alone, before any evidence is judged (P8, CSH-018).
- Joint conflicts carry a minimal set with each member's source and the colliding terms (CSH-019).
- Two examples from different sources that answer one input two ways are a divergence with four readings; only an event declared `deterministic` turns a divergence on identical inputs into a conflict. Examples from one source are never compared ([A-36](../../ASSUMPTIONS.md), [A-44](../../ASSUMPTIONS.md)).
- A lifted claim that fails type checking on unit or type is reported `notComparable`, not as a conflict (CSH-021).
- Content that cannot be lifted is kept in `unliftable` and shown in the gap view, never dropped (P4, CSH-002, CSH-020).
- A test that finished and recorded no witness is the gap `unobserved-test` once per source, with the subject `<Source>/<file>::<name>`, so two sources sharing a test identity each report their own missing witness ([A-64](../../ASSUMPTIONS.md)).
- A candidate member never makes an approved obligation conflicting ([A-10](../../ASSUMPTIONS.md)).
- Verdict and applicability are kept apart and never averaged into a score, so an unknown stays visible in every count (P3; main tab, section 4.3).

## Rationale

A joint conflict is an input with no valid outcome ([ADR-08](../../docs/adr/ADR-08-joint-conflict-is-q-feas.md)). The four axes stay separate ([ADR-10](../../docs/adr/ADR-10-four-axes.md)), and `csh check` exits zero when it completes ([ADR-11](../../docs/adr/ADR-11-check-never-blocks.md)). A passing test is both a claim and a witness ([ADR-13](../../docs/adr/ADR-13-passing-test-is-claim-and-witness.md)); requirement sentences are cited, not translated ([ADR-14](../../docs/adr/ADR-14-cite-not-translate.md)). The report carries extension fields ([ADR-22](../../docs/adr/ADR-22-report-extensions-and-json.md), [A-01](../../ASSUMPTIONS.md)). Caches are conservative ([ADR-23](../../docs/adr/ADR-23-caches.md), [A-31](../../ASSUMPTIONS.md)). Running adapters belongs to `@csh/run`, so this package only reads their output ([ADR-33](../../docs/adr/ADR-33-run-package.md), superseding [ADR-24](../../docs/adr/ADR-24-pipeline-in-cli.md)). Assumption scope and the `model` pseudo-source follow [ADR-27](../../docs/adr/ADR-27-query-scope.md) ([A-04](../../ASSUMPTIONS.md), [A-05](../../ASSUMPTIONS.md)), and candidates never change an approved verdict ([ADR-28](../../docs/adr/ADR-28-candidates-never-block.md)). Examples are compared with examples ([ADR-34](../../docs/adr/ADR-34-example-divergence.md)). Other choices are [A-03](../../ASSUMPTIONS.md), [A-06](../../ASSUMPTIONS.md) to [A-08](../../ASSUMPTIONS.md), [A-11](../../ASSUMPTIONS.md), [A-12](../../ASSUMPTIONS.md) and [A-30](../../ASSUMPTIONS.md).

## How it is tested

- `test/cache.test.ts`: the solver cache stores and replays `sat` and `unsat`, never stores `unknown`, and survives a save and load.
- `test/check.test.ts`: witness judging and the verdict order on the account model: violated in implementation scope, satisfied with every method met, unknown without approved bindings, a mocked witness rejected, a missing key, staleness, a failing local result kept apart (P2), no witnesses, no ledger, and a claim in another unit reported not comparable.
- `packages/run/test/faults.test.ts`: a missing witness file, a malformed witness file, a crashing adapter, a hanging adapter and a witness from another commit each leave obligations unknown, never satisfied.
- `test/signals.test.ts`: signals keep a finding's id, name sources and practices through the component, have ids that do not change between runs, and match on kind, fragment (exact or last segment), source, practice, subject and `not`.
- `packages/gate/test/gate.test.ts` uses its report types.
- Fixtures (through `@csh/testkit`): F10 to F16 (single-source queries), F20 to F23 (joint conflicts and not comparable), F12 and F24 (gap view), F30 to F35 (witness judging and methods), F50 and F52 (uncited items and dangling citations), F87 to F90 (divergence), F40, F41, F46, F51 and F64 (staleness and authority changes; F64 compares incremental and full runs).

## Known limits

- The query runner and gap view are unit-tested only through fixtures, apart from `unobserved-test` per source; witness judging, verdicts, comparability and the cache have their own unit tests.
- Retired fragments leave the solver pool entirely ([A-03](../../ASSUMPTIONS.md)).
- Stale evidence is never refreshed; a new witness must be recorded ([A-15](../../ASSUMPTIONS.md)).
- `architecture` and `temporal` obligations are assessed but never evaluated, so they stay `unknown`.
