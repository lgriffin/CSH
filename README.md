# CSH: the Composable Specification Harness

CSH exists so that software changed quickly, including by AI agents, cannot be declared correct on evidence that
does not support the claim. Tests, formal models, structured requirements and design notes each protect something,
and each is usually judged alone. CSH replaces none of them. It reads what they already produce and reports where
they disagree. It also tracks which statements a person has approved, judges recorded test runs against those
statements, and gates delivery.

The output is a view for informed decisions, not a certificate. What the harness cannot establish, it reports as
unknown.

The design is in [docs/spec](docs/spec), a read-only export of the specification. Start with
[the main tab](docs/spec/00-main.md).

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
the intent is undecided. Claims in different units are reported as not comparable, never as a conflict.

## Five minutes on the account example

You need Node 22.18 or later, pnpm, git and GnuPG.

```sh
pnpm install
examples/account/walkthrough.sh
```

The script copies [examples/account](examples/account) to a scratch repository. It emits the specification, runs
the unit tests (which record witnesses), runs `csh check`, explains a finding, runs the gate, and drafts an approval.
[docs/walkthrough.md](docs/walkthrough.md) shows each step with its real output.

The example is the worked case of the main tab, section 6.6. The model says the balance never falls below the floor.
A passing unit test lets a premium account overdraw to minus 5,000. A design note mentions premium accounts in words
the model cannot express. The harness reports:

- Two cross-source example conflicts: the premium-overdraw test against `MinimumBalance`, and against `RejectInsufficientFunds`.
- The design note, held as unliftable with its original text.
- A test with no rule behind it, and a requirement sentence that nothing cites.
- Both obligations `candidate` and `conflicting`, because nobody has approved anything yet.

## Commands

```
csl emit <spec.csl.ts> [--out model.json]   Emit the model and print its digest. Non-zero on any rule or error.
csl print <model.json | spec.csl.ts>        Print the canonical TypeScript.
csl lock <spec.csl.ts>                      Write csh/lock.json from the packs the specification uses.

csh check [spec] [--json] [--budget ms] [--no-cache]
                                            Run every check; write reports/csh-report.json. Exits 0 when it completes.
csh gaps [spec]                             Print the gap view only.
csh explain <finding-id>                    Print one finding, members rendered through the printer.
csh approve | reject | retire <fragment> --actor <name> --rationale <text>
csh waive <fragment> --scope <finding|obligation> --expires <YYYY-MM-DD> --actor <name> --rationale <text>
csh countersign <seq> --actor <name> --rationale <text>
                                            Draft one ledger line. The tool never commits or signs.
csh gate [--mode advisory|enforcing]        Decide for the current snapshot. Non-zero only on block in enforcing mode.
csh gate --verify <decision.json>           Refuse a decision made for any other snapshot.
```

Run them as `node packages/cli/bin/csh.js` and `node packages/cli/bin/csl.js`. A project keeps its settings in
`csh/config.json`, its ledger in `csh/ledger.ndjson` and its maintainers in `csh/maintainers.json`.

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

## Limits

- **Predicates are limited.** Linear integer arithmetic, enumerations and booleans, over one state per event. No concurrency, no time, no quantifiers in specifications.
- **Reserved constructs.** Architectural and temporal obligations are carried and reported, but not evaluated.
- **Two adapters.** Version 1 ships adapters for witness files and EARS requirements in Markdown. Anything else must arrive as claim sets in IR form, or it stays unliftable.
- **Unknown is common.** A solver timeout, a missing binding or an unapproved binding all give unknown. That is a correct answer, not a malfunction.
- **Protection depends on keys.** It also depends on where the gate runs: CI should pin the root maintainers commit outside the repository.
- **SSH signatures are untested.** Their verification is implemented through git but no fixture covers it ([Q-16](QUESTIONS.md)).
- **Choices made during the build are provisional.** They are registered in [ASSUMPTIONS.md](ASSUMPTIONS.md), with open questions in [QUESTIONS.md](QUESTIONS.md).

## Status of the build

All nine stages are built. All 51 golden fixtures pass (F01 to F16, F20 to F24, F30 to F35, F40 to F46, F50 to
F52, F60 to F64, F70 to F78), as do the unit, property and fault-injection tests. The composition fixtures F70 to
F78 were written by the implementer and await owner review. [docs/stages](docs/stages) records what each stage
built and what its fixtures revealed.

```sh
pnpm typecheck                                  # strict TypeScript over every package and test
pnpm test                                       # every unit, property, fault-injection and fixture test
node packages/testkit/src/run-fixtures.ts       # the fixtures alone, with a summary
```

## Repository

| Path | Contents |
| --- | --- |
| `packages/` | Thirteen packages, each with a README: `kernel`, `csl`, `emit`, `print`, `solver`, `check`, `witness`, `adapter-witness-files`, `adapter-ears-markdown`, `ledger`, `gate`, `cli`, `testkit` |
| `fixtures/` | Golden fixtures, one directory each, plus the shared bases and the test pack |
| `examples/account/` | The walkthrough example |
| `docs/spec/` | The specification, read-only |
| `docs/architecture/` | C4 diagram sources (Mermaid) and rendered SVG |
| `docs/adr/` | Decision records |
| `docs/stages/` | Stage notes |
| `ASSUMPTIONS.md`, `QUESTIONS.md`, `DEPENDENCIES.md` | Assumptions register, open questions, dependencies and the verification checklist |

## Licence

MIT. See [LICENSE](LICENSE).
