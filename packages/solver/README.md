# @csh/solver

## Purpose

`@csh/solver` defines the solver port, a solver-independent formula language over model expressions, the six named queries of the Semantic contract, minimal conflicting sets, the unconstrained-after query and refinement checks. It ships a Z3 adapter for the port and a scripted fake for tests and fault injection.

## Where it sits

It belongs to the "Check engine" container, with `@csh/check`, shown in the [containers diagram](../../docs/architecture/containers.mmd) and in [components-check.mmd](../../docs/architecture/components-check.mmd). Z3 is an external system reached only through `SolverPort`.

## Public interface

- `SolverPort`, `CheckInput`, `CheckResult`, `SatStatus`, `Tracked`: the port; tracked assertions can appear in an unsatisfiable core.
- `createZ3Solver()`: the Z3 implementation (linear integer arithmetic, enumerations as bounded integers).
- `createFakeSolver(behaviour)`, `FakeBehaviour`: a fake that crashes, times out, answers unknown, answers garbage or follows a script.
- `F`, `Frame`, `PRE`, `POST`, `STATE`, `T`, `FALSE`, `ex`, `all`, `any`, `neg`, `imp`: formulas and the frames that say which state a reference reads.
- `fieldVar`, `argVar`, `resultVar`, `varOf`, `typeOfVar`, `varsOf`, `freeVarsOf`: constant naming and inspection.
- `QAssumption`, `QInvariant`, `QRequirement`, `QExample`, `QTransition`: query inputs.
- `assumptionF`, `invariantF`, `triggerF`, `requirementF`, `transitionF`, `exampleF`, `outcomeVars`: formulas for each kind of fragment.
- `qState`, `qVac`, `qFeas`, `qEx`, `qPres`, `qMeet`, `qDiv`: Q-STATE, Q-VAC, Q-FEAS, Q-EX, Q-PRES, Q-MEET and Q-DIV. `exampleInputF` encodes an example's inputs without its outcome.
- `QueryResult`, `MinimalSet`, `QueryEnv`, `Budget`, `MAX_SETS`: query outcomes (`wanted`, `failed` with sets, or `unknown` with a reason), the environment and the shared per-query time budget.
- `enumerateMinimal(items, test, limit)`: shrink-by-deletion enumeration of minimal conflicting subsets, up to `MAX_SETS` (16).
- `unconstrainedAfter(env, t, assumptions, invariants)`, `Unconstrained`: fields a transition branch leaves unconstrained.
- `satisfiable(env, hard)`, `refines(env, local, inherited, assumptions)`, `RefinementResult`: satisfiability and refinement (`strengthens`, `weakens`, `vacuous` or `unknown`).

## Depends on and used by

- Depends on: `@csh/kernel` (expressions and vocabulary). External: `z3-solver` 5.2.0, loaded lazily by `createZ3Solver`.
- Used by: `@csh/check` (queries, gap view, refinement, solver cache), `@csh/cli` (creates the Z3 solver), `@csh/run` (passes it to the check) and `@csh/testkit` (fixture runner and independent checks).

## Invariants it protects

- A solver crash, a timeout, a malformed answer or an `unknown` answer becomes a query result of `unknown` with a reason; it is never read as a wanted outcome (P3, CSH-006; Implementer's brief, section 8, "No silent satisfaction").
- A budget of zero gives `unknown` with reason `solver-timeout` without calling the solver (P3).
- Every reported conflicting set is minimal: removing any member makes the rest satisfiable (CSH-019).
- A joint conflict is an input with no valid outcome (Q-FEAS), with the outcome quantified (CSH-019).
- Refinement first checks that the local obligation is satisfiable under the assumptions, so a vacuous replacement is caught rather than accepted (main tab, section 4.4; P3).
- Unconstrained-after reports every field a branch leaves free instead of assuming it unchanged (P10).

## Rationale

Z3 with linear integer arithmetic was chosen for its JavaScript bindings and unsatisfiable cores ([ADR-09](../../docs/adr/ADR-09-z3-lia.md)). A joint conflict is defined through Q-FEAS ([ADR-08](../../docs/adr/ADR-08-joint-conflict-is-q-feas.md)). The solver sits behind a port so the check engine can be tested with a fake and the kernel stays free of it ([ADR-16](../../docs/adr/ADR-16-hexagonal-monolith.md)). No frame rule is assumed, hence the unconstrained-after query ([ADR-06](../../docs/adr/ADR-06-no-frame-rule.md)). Strengthening is accepted only when `refines` shows it ([ADR-29](../../docs/adr/ADR-29-refinement-by-solver.md)). Q-DIV compares two examples with no rule between them ([ADR-34](../../docs/adr/ADR-34-example-divergence.md)).

## How it is tested

- `test/solver.test.ts`: property tests (fast-check) that exact evaluation and Z3 agree on random expressions and values; that every minimal set is unsatisfiable and every set with one member removed is satisfiable; that a fake solver answering crash, timeout, unknown or garbage gives `unknown`; that a zero budget gives `solver-timeout`; and that Q-DIV fails with both examples and a shared input when their inputs meet and their outcomes cannot both hold, and is wanted when the outcomes agree or the inputs cannot meet.
- `packages/run/test/faults.test.ts` and `packages/testkit/src/verify.ts` check solver answers independently end to end.
- Fixtures: F10 to F16 (single-source queries; F16 sets the budget to zero), F20 to F22 (joint conflicts and minimal sets), F12 (unconstrained-after in the gap view), F74 to F76 and F78 (refinement in composition).

## Known limits

- Only linear integer arithmetic over the version 1 predicate subset; enumerations are encoded as bounded integers.
- Minimal-set enumeration stops at 16 sets and marks the result `incomplete`.
- Calls to one Z3 context are serialised, so queries run one at a time.
- Q-FEAS uses a quantifier; its run time on larger models has only been checked against the base fixtures.
