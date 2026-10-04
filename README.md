# CSH: the Composable Specification Harness

CSH exists so that software changed quickly, including by AI agents, cannot be declared correct on evidence that
does not support the claim. Tests, formal models, structured requirements and design notes each protect something,
and each is usually judged alone. CSH replaces none of them. It reads what they already produce and reports where
they disagree. It also tracks which statements a person has approved, judges recorded test runs against those
statements, and gates delivery.

The output is a view for informed decisions, not a certificate. What the harness cannot establish, it reports as
unknown.

## Three doors

| You want to | Go to |
| --- | --- |
| See what it does | [See it](#see-it): the lockout A3, then the walkthrough that makes it |
| Run it on your own code | [Use it](#use-it): the starter, then the ladder |
| Know how it is built, and why | [Understand it](#understand-it): context, containers, a package, a decision |

You need Node 22.18 or later, pnpm, git and GnuPG. Every `sh` block in this file is executed in continuous
integration (`node packages/testkit/src/triangle.ts readme`), so the commands below run as written.

## See it

[examples/lockout](examples/lockout) describes sign-in lockout three ways: EARS requirements, BDD scenarios read by
the Gherkin adapter through the example's step table, and unit tests written test first. Each practice is signed off
on its own. Read together they disagree on nine decision points: an off-by-one between the tests and the
requirements, two EARS sentences that cannot both hold, a unit the scenarios state in minutes, and cases only one
practice can express. [The A3](examples/lockout/csh/a3/three-practices/a3.md) reads them as one problem, and
[a3.html](examples/lockout/csh/a3/three-practices/a3.html) is the same sheet with a picker for each stage.

```sh
pnpm install
examples/lockout/walkthrough.sh
```

The script runs the example in four stages, each a commit run by `csh run` and recorded by `csh a3 stage`: as
written, after the countermeasures, with a model and signed approvals (the enforcing gate allows), and after a
regression that keeps the tests green (the enforcing gate blocks). It ends with `csh a3 build --check`, which fails
when the sheet it builds differs from the committed one, then shows what each change did with `csh diff` between
each pair of stages. [docs/lockout-walkthrough.md](docs/lockout-walkthrough.md) shows the run.

What did the regression do? `csh diff` compares two stored runs and puts first what costs a reviewer a decision: here,
an approved rule that was satisfied and is now violated, with the tests that changed beside it
([the change review guide](docs/guides/review.md)).

```sh
cd .csh-cache/walkthrough/lockout
node ../../../packages/cli/bin/csh.js diff csh/a3/three-practices/stages/approved csh/a3/three-practices/stages/regression
```

[examples/account](examples/account) is the worked case of the main tab, section 6.6. The model says the balance
never falls below the floor; a passing unit test lets a premium account overdraw to minus 5,000; a design note
mentions premium accounts in words the model cannot express. [docs/walkthrough.md](docs/walkthrough.md) shows each
step with its real output.

```sh
examples/account/walkthrough.sh
```

The harness reports two cross-source example conflicts, the design note held as unliftable with its original text,
a test with no rule behind it, a requirement sentence nothing cites, and both obligations `candidate` and
`conflicting`, because nobody has approved anything yet.

## Use it

[examples/starter](examples/starter) is the smallest component: one function, one probe, one sentence, one rule.
Copy it out of the repository and install the tool beside it, from tarballs packed from this clone. Nothing is
published ([ADR-32](docs/adr/ADR-32-local-only-distribution.md)).

```sh
packs=$(mktemp -d) project=$(mktemp -d)
node packages/testkit/src/pack.ts "$packs"
cp -r examples/starter/. "$project"
cd "$project"
npm install --save-dev --no-audit --no-fund "$packs"/*.tgz
npx csh run
```

Then replace the function with yours, as [the starter's README](examples/starter/README.md) says.

### The ladder

Each rung is one thing you add and one result you get back. No rung requires the next, so you can stop where the
value stops.

| Rung | You add | You get back |
| --- | --- | --- |
| 1 Inventory | `csh init`: a manifest naming your practices and where their files are | Every requirement sentence as an identified item, each listed as uncited; your tests counted as unobserved |
| 2 Vocabulary and a probe | The state and one event in CSL; [a probe](docs/guides/probe.md) around one function; bindings | Your passing tests as examples in one vocabulary, each with no rule behind it |
| 3 First rule | One requirement predicate that cites one sentence | The first place where a test can disagree with a sentence. The starter is here |
| 4 Second practice | Scenarios with [a step table](docs/guides/steps.md), or tests that cite | Conflicts and divergences across practices |
| 5 Model | A transition for the event | Rules checked by the solver, so that they can become satisfied |
| 6 Authority | A maintainers file, signed approvals, the enforcing gate in continuous integration | A change that breaks an approved rule is blocked even when its tests are green |
| 7 A3 | [Judgments](docs/guides/a3.md) on a problem a run found | The sheet |

## Understand it

Read these in order:

1. [The context diagram](docs/architecture/context.mmd): who uses the harness and what it touches.
2. [The container diagram](docs/architecture/containers.mmd): the eleven runtime containers and every package by name, with [a component diagram for each](docs/architecture/README.md).
3. A package README, such as [run](packages/run/README.md), [check](packages/check/README.md) or [a3](packages/a3/README.md): purpose, interface, invariants, tests and limits, in the same eight sections for every package.
4. The decision records in [docs/adr](docs/adr), such as [ADR-15](docs/adr/ADR-15-ledger-of-signed-commits.md) on authority.

The design is in [docs/spec](docs/spec), a read-only export of the specification: start with
[the main tab](docs/spec/00-main.md), and read [09](docs/spec/09-anchor-harness-a3.md) for components, harnesses
and the A3. The harness also evaluates part of itself: [the gate](packages/gate/README.md) is a component, with an A3
whose candidate judgments an agent wrote at the owner's request.

## The two findings

**Gaps.** The gap view shows, for each term and obligation, which sources assert it, which exercise it, which are
silent, and which hold something the harness could not read. Examples are an approved rule with no boundary example,
a passing test with no rule behind it, and a requirement sentence that nothing cites.

**Joint conflicts.** A holds, B holds, and A and B cannot both hold. In a shared context C:

```
SAT(C ∧ A)    SAT(C ∧ B)    UNSAT(C ∧ A ∧ B)
```

For more than two claims, the harness reports a minimal conflicting set, naming each member, its source, and the
terms on which they collide. It offers three readings and chooses none: a member is wrong, a context is missing, or
the intent is undecided. Claims in different units are reported as not comparable, never as a conflict. Two examples
from different practices whose inputs can coincide and whose outcomes cannot both hold are a divergence.

## Commands

```
csl emit <spec.csl.ts> [--out model.json]   Emit the model and print its digest. Non-zero on any rule or error.
csl print <model.json | spec.csl.ts>        Print the canonical TypeScript.
csl lock <spec.csl.ts>                      Write csh/lock.json from the packs the specification uses.

csh init                                    Write csh/component.json by asking for each field. Guesses nothing.
                                            Writes under --root, or the git top level, as every command reads.
csh run [--at <commit>] [--mode advisory|enforcing] [--budget ms] [--no-cache]
                                            Run each practice's harness, check, decide, and store the run under
                                            .csh-cache/runs/<snapshot digest>/. Non-zero only on block in enforcing mode,
                                            or 3 when a past commit needs other dependencies than the installed ones.
csh a3 open <slug> [--at <commit>]         Record a run as the first stage of an A3 under csh/a3/<slug>/, with an
                                            empty judgments skeleton in which every signal is unclassified.
csh a3 stage <slug> <id> --at <commit>      Record the run of a commit as a stage, running it if no run is stored.
csh a3 build <slug> [--check]               Build a3.json, a3.md and a3.html; with --check, fail when they differ.
csh a3 verify <slug>                        Re-run every stage at its commit and report any that differs.
csh check [spec] [--json] [--budget ms] [--no-cache]
                                            Run every check; write reports/csh-report.json. Exits 0 when it completes.
csh gaps [spec]                             Print the gap view only.
csh explain <finding-id> [--run <dir|commit>]
                                            Print one finding, members rendered through the printer; with
                                            --run, from a stored run (csh run --at writes no reports/ files).
csh approve | reject | retire <fragment | #a3/slug> --actor <name> --rationale <text>
csh waive <fragment> --scope <finding|obligation> --expires <YYYY-MM-DD> --actor <name> --rationale <text>
csh countersign <seq> --actor <name> --rationale <text>
                                            Draft one ledger line. The tool never commits or signs.
csh status [--json]                         What is and is not protected, for one component. Reads only.
csh diff <base> <head> [--json] [--out <dir>]
                                            What a change did to the results, between two runs of one component.
                                            Each side is a stored run's directory, a commit, or . for the working tree.
                                            Decides nothing; non-zero only when the head cannot be run.
csh gate [--mode advisory|enforcing]        Check and decide for the current snapshot. Non-zero only on block in enforcing mode.
csh gate --verify <decision.json>           Recompute; refuse a decision for another snapshot or one that differs.
```

In a clone, run them as `node packages/cli/bin/csh.js` and `node packages/cli/bin/csl.js`; installed from the packed
tarballs, as `npx csh` and `npx csl`. A component is described by
`csh/component.json`: its practices, the sources each owns and the command that runs each practice's tests. A project
keeps its other settings in `csh/config.json`, its ledger in `csh/ledger.ndjson` and its maintainers in `csh/maintainers.json`.

## How to read a report

`csh check` prints, in this order:

1. **Cross-source conflicts**, then other conflicts. Each shows the query that found it, its members with their source and authority, the context, the collision terms, and the three readings.
2. **Failed preservation.** A transition of the model breaks an invariant (`not-preserved`) or fails a requirement (`not-met`), with a counterexample.
3. **Unknown.** The solver could not decide, with the reason.
4. **Not comparable.** Claims that differ in unit or scope.
5. **The gap view**, then the derived gaps. A gap is not a failure.
6. **Obligations.** Four axes are kept apart and never merged into a score:
   - **Authority:** approved, candidate or retired. It comes only from signed ledger entries.
   - **Verdict:** conflicting, violated, satisfied or unknown, with the reasons for unknown.
   - **Applicability:** current, stale, inapplicable or unavailable, for the evidence behind the verdict.
   - **Disposition:** allow, review, block or waived. Only the gate decides it.
7. **Counts**, last.

A test that passed is an execution fact and is never a verdict. A waived violation is still a violation.
Self-approved decisions are marked as such wherever they appear.

## Authority, briefly

Approval is a line in `csh/ledger.ndjson`, valid only when committed alone and signed by a person key listed in
`csh/maintainers.json`. Agents can do everything a contributor does, but an agent's key cannot approve. Changing what a
fragment means changes its digest and returns it to candidate. A solo maintainer may approve their own work, marked
self-approved, until a second person joins. See the [Authority tab](docs/spec/05-authority-and-ledger.md) and
[ADR-15](docs/adr/ADR-15-ledger-of-signed-commits.md).

Is this repository protected, or only able to be? `csh status` answers for one component: the root of trust, the
maintainers, what is approved, the gate mode, and whether the stored decision is for the current snapshot. Continuous
integration runs it for the gate component on every change, as the first step of the gate job
(`.github/scripts/gate-job.sh`). Until the owner takes the eight steps of [the authority runbook](docs/guides/authority.md),
it says `unprotected`, and why.

```sh
node packages/cli/bin/csh.js status --root packages/gate
```

## Limits

- **Predicates are limited.** Linear integer arithmetic, enumerations and booleans, over one state per event. No concurrency, no time, no quantifiers in specifications.
- **Reserved constructs.** Temporal obligations are carried and reported, but not evaluated. Architectural obligations are evaluated when written with the `forbid`, `only` and `closed` builders, against a container diagram and the imports of TypeScript and JavaScript code ([architecture rules](docs/guides/architecture-rules.md)); any other value stays reserved.
- **Five adapters.** Witness files, EARS requirements in Markdown, Gherkin scenarios through a step table, Mermaid C4 container diagrams, and dependency facts. Scenarios are read, never executed. Anything else must arrive as claim sets in IR form, or it stays unliftable.
- **One test runner.** The probe's outcomes come from a reporter for Node's test runner; other runners have none ([Q-20](QUESTIONS.md), decided: the gate's probe is a second file checked against its unit tests).
- **Unknown is common.** A solver timeout, a missing binding or an unapproved binding all give unknown. That is a correct answer, not a malfunction.
- **Protection depends on keys.** It also depends on where the gate runs: CI should pin the root maintainers commit with `CSH_ROOT_COMMIT`, outside the repository ([A-28](ASSUMPTIONS.md)).
- **SSH signatures are untested.** Their verification is implemented through git but no fixture covers it ([Q-16](QUESTIONS.md)).
- **Choices made during the build are registered.** They are in [ASSUMPTIONS.md](ASSUMPTIONS.md). The owner decided every question in [QUESTIONS.md](QUESTIONS.md), Q-01 to Q-20, on 3 October 2026.

## Status of the build

Stages 1 to 19 are built; stage 20 of [the next layers](docs/spec/10-next-layers.md) is to come. All 84
golden fixtures of the built stages pass (F01 to F16, F20 to F24, F30 to F35, F40 to F46, F50 to F52, F60 to F64, F70
to F78, F80 to F112), as do the unit, property and fault-injection tests; F113 to F117 are written and pending. The composition fixtures
F70 to F78 were written by the implementer and accepted by the owner. [docs/stages](docs/stages) records what each
stage built and what its fixtures revealed.

```sh
pnpm typecheck
pnpm test
```

`pnpm typecheck` is strict TypeScript over every package and test; `pnpm test` runs every unit, property,
fault-injection, documentation and fixture test. `node packages/testkit/src/run-fixtures.ts` runs the fixtures alone,
with a summary.

## Repository

| Path | Contents |
| --- | --- |
| `packages/` | Twenty-three packages, each with a README: `kernel`, `csl`, `emit`, `print`, `solver`, `check`, `arch`, `witness`, `adapter-witness-files`, `adapter-ears-markdown`, `adapter-gherkin`, `adapter-c4-mermaid`, `facts`, `facts-imports`, `ledger`, `gate`, `component`, `run`, `review`, `harness`, `a3`, `cli`, `testkit` |
| `docs/guides/` | How to write a component manifest, a probe, a step table, an A3 and architecture rules, and the owner's runbook for authority |
| `csh/` | The `Workspace` component: the repository's own architecture rules, read against its container diagram and its imports ([examples/workspace](examples/workspace/README.md)) |
| `fixtures/` | Golden fixtures, one directory each, plus the shared bases and the test pack |
| `examples/lockout/` | Three practices on one behaviour, run in four stages, and its A3 |
| `examples/account/` | The first walkthrough example |
| `examples/workspace/` | The repository as a component: its diagram, its written rules and its imports, and the A3 its first run opened |
| `examples/starter/` | The smallest component, which installs and runs outside the repository |
| `docs/spec/` | The specification, read-only |
| `docs/architecture/` | C4 diagram sources (Mermaid) and rendered SVG |
| `docs/adr/` | Decision records |
| `docs/stages/` | Stage notes |
| `ASSUMPTIONS.md`, `QUESTIONS.md`, `DEPENDENCIES.md` | Assumptions register, open questions, dependencies and the verification checklist |

## Licence

MIT. See [LICENSE](LICENSE).
