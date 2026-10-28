# CSH: the Composable Specification Harness

CSH exists so that software changed quickly, including by AI agents, cannot be declared correct on evidence that
does not support the claim. Tests, formal models, structured requirements and design notes each protect something,
and each is usually judged alone. CSH replaces none of them. It reads what they already produce and reports where
they disagree. It also tracks which statements a person has approved, judges recorded test runs against those
statements, and gates delivery.

The output is a view for informed decisions, not a certificate. What the harness cannot establish, it reports as
unknown.

## Four doors

| You want to | Go to |
| --- | --- |
| See what it does | [See it](#see-it): the lockout A3, then the walkthrough that makes it |
| Run it on your own code | [Use it](#use-it): the starter, then the adoption steps |
| Know how it is built, and why | [Understand it](#understand-it): context, containers, a package, a decision |
| Find the gaps in a codebase you already have | [Analyse it](#analyse-it): `csh analyse <path>`, cold, on any repository |

To use CSH on your own repositories, install it from npm. It needs Node 22.18 or later and git, and nothing else:

```text
npm install --global @lgriffin/csh
csh analyse path/to/repo
```

`npx @lgriffin/csh analyse .` runs it once without installing. A global `csh` can shadow the C shell, so the same
command is also installed as `cshx`. [The release guide](docs/guides/release.md) says how a version reaches npm.

To work on CSH itself from this clone, you also need pnpm and GnuPG (`csh analyse` needs no GnuPG). Every `sh` block in
this file is executed in continuous integration (`node packages/testkit/src/triangle.ts readme`), so the commands
below run as written.

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
Copy it out of the repository and install the tool beside it. Outside this clone, `npm install --save-dev @lgriffin/csh`
does that ([ADR-36](docs/adr/ADR-36-npm-package.md)); here, the block below installs tarballs packed from the clone, so
that it tests the code you have.

```sh
packs=$(mktemp -d) project=$(mktemp -d)
node packages/testkit/src/pack.ts "$packs"
cp -r examples/starter/. "$project"
cd "$project"
npm install --save-dev --no-audit --no-fund "$packs"/*.tgz
npx csh run
```

Then replace the function with yours, as [the starter's README](examples/starter/README.md) says.

### Adoption steps

Each step is one thing you add and one result you get back. No step requires the next, so you can stop where the
value stops. (These were once called a ladder; that word now means [the Assertion Ladder](#the-assertion-ladder).)

| Step | You add | You get back |
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
2. [The container diagram](docs/architecture/containers.mmd): the fourteen runtime containers and every package by name, with [a component diagram for each](docs/architecture/README.md).
3. A package README, such as [run](packages/run/README.md), [check](packages/check/README.md) or [a3](packages/a3/README.md): purpose, interface, invariants, tests and limits, in the same eight sections for every package.
4. [The deck](docs/deck/csh.md): twenty-two Marp slides on what CSH is, how it works, how it is designed and what it reports.
5. The decision records in [docs/adr](docs/adr), such as [ADR-15](docs/adr/ADR-15-ledger-of-signed-commits.md) on authority.

The design is in [docs/spec](docs/spec), a read-only export of the specification: start with
[the main tab](docs/spec/00-main.md), and read [09](docs/spec/09-anchor-harness-a3.md) for components, harnesses
and the A3. The harness also evaluates part of itself: [the gate](packages/gate/README.md) is a component, with an A3
whose candidate judgments an agent wrote at the owner's request.

## Analyse it

CSH is a static analysis tool. It reads what a codebase already holds (requirements, guides, scenarios, tests, issues,
structured traces, the code and its history) without running or changing it, and places every result in one of three
outcomes:

- **Converged:** the claim and the code agree, with evidence: a satisfied rule, a requirement whose tests pass, a silence
  recorded with its reason.
- **Gaps:** suggestions that can be addressed, each with where it is and what would close it: prose the code refutes,
  two documents that disagree, a line older than the file it names, a requirement nothing verifies.
- **Indeterminate:** what CSH could not decide, with the input that would decide it.

Across the three outcomes, CSH marks danger, and reports it first: **refuted**, where a statement and the code cannot
both hold, and **masked**, where something reads as assurance the evidence does not bear out, such as a passing test
whose own observation breaks a rule, a rule the code breaks while the tests citing it pass in the committed results,
or prose claiming "enforced" for a rule nothing checks. Each names what reads green
and the one input that would close it. Danger keeps each result's outcome, decides nothing and is never scored
([16](docs/spec/16-analyse-danger-grain.md), section 3).

A test that cites a rule is reassurance over what it observes and silence beyond it. CSH compares the terms a told rule
writes in backticks with the identifiers each citing test's body mentions, in every language it reads, and names the
terms no citing test observes: a gap, and masked danger ([16](docs/spec/16-analyse-danger-grain.md), section 4).

`csh analyse <path>` reads any git repository cold, with no profile: it proposes one, lifts the layering and EARS
sentences of its documents as told rules, reads its code and tests, checks, and reports danger, then conflicts, gaps,
indeterminate and converged, then counts ([16](docs/spec/16-analyse-danger-grain.md)). It writes
`reports/csh-analysis.html` and `.json`, and beside them an A3 (`csh-a3.html` and `.md`) that reads the results as one
problem: where it concentrates, why, a proposed goal and the countermeasures that close the most, with the first three
printed last. It never writes into the repository, never runs its tests and reads no ledger.
`--profile <dir>` reads a hand-written profile instead, `--at <commit>` another commit, and `--expected <file>` compares the analysis with a `csh-expected/v1` file, exiting 1 when it does not meet it. On a scratch copy of
[F160](fixtures/F160)'s small Go service:

```sh
subject=$(mktemp -d)
cp -r fixtures/F160/inputs/subject/. "$subject"
git -C "$subject" init -q -b main && git -C "$subject" add -A
git -C "$subject" -c user.name=you -c user.email=you@example.invalid -c commit.gpgsign=false commit -qm "the subject"
node packages/cli/bin/csh.js analyse "$subject" --out reports/analysis
```

A repository that checks itself is read as it checks itself ([17](docs/spec/17-from-the-tutors-run.md)):
- A scenario a test carries the title of is bound by that test.
- A `@amiceli/vitest-cucumber` step file is matched in that library's dialect.
- A told rule that names a dependency-cruiser check is verified by the configuration.
- A file that says it "may only shrink" is a baseline, and each of its entries is a `baselined` gap the repository already records.
- Gherkin in a document that says its scenarios are not executed is specified behaviour that nothing runs.
- A path in a sentence that names another repository, or says the file is retired or optional, is not read as a claim about this tree.

A Python repository that checks itself is read the same way ([18](docs/spec/18-from-the-toads-run.md)):
- A path the repository's `.gitignore` ignores is local to a checkout, not a dangling reference.
- pytest-bdd's `scenarios()` and `@scenario` bind scenarios. A bound scenario with no steps passes having checked nothing, a scenario nothing binds never runs, and one bound by a title CSH cannot read is indeterminate.
- pytest-bdd's step definitions are matched as pytest-bdd matches them.
- A told rule that names an import-linter contract, by its name, its modules or its configuration file, is verified by it.
- A quotation, "import" meaning a data import, and a restriction in another clause make no told rule.

From the cold read of microsoft/TypeScript ([19](docs/spec/19-from-the-typescript-run.md)):
- A file the reader is told to create, or that a tool writes, is not a dangling reference.
- With no identifier scheme, a test title cites nothing: `WTF-8` and `JIRA-123` are not requirements.
- A relative Markdown link names a file, resolved from the document's directory.
- A code-shaped name in a package's own document is checked against the package's code, methods included; a name no
  code declares is indeterminate, since it may be another library's ([20](docs/spec/20-symbols-and-task-runners.md)).
- A `hereby`, `make` or `just` command names a task of the runner's file at the root, as `npm run x` names a script.
- A code read that fails is reported, and a repository of hundreds of thousands of facts is read whole.

A repository's test suites are read as evidence ([21](docs/spec/21-test-suites-as-evidence.md)):
- Each case is paired with the outputs a person accepted for it, by path: TypeScript's reference baselines, golden files, Rust UI outputs, Jest, Vitest and syrupy snapshot directories, and approved files. A suite whose cases have outputs converges, a case with none and an output with none are gaps, and what no convention pairs is indeterminate.
- The pairing needs only the files' names, so a tree of baselines is read by name, its bytes never opened.
- Test data is not code: a case is never read as the program's own module, nor a baseline in Markdown as a document.
- Each entry of a Jest or Vitest snapshot file is matched with a test of the file it names, by the full name the runner gives it. An entry no test names is a gap when every title is a literal, and indeterminate when a title CSH cannot read might name it.
- An output named after a test file is that test's, as TypeScript's fourslash baselines are.

[subjects/esi-ts](subjects/esi-ts) evaluates [ESI.ts](https://github.com/lgriffin/ESI.ts), a mature TypeScript client, from
outside. At its pinned commit CSH reports 113 gaps, 8 indeterminate and 43 converged, and each of the eleven
disagreements in [11](docs/spec/11-ingesting-a-codebase.md) is reported or listed as unknown with a reason
([expected.json](subjects/esi-ts/csh/expected.json)). [The prose-drift A3](subjects/esi-ts/csh/a3/prose-drift/a3.md) follows
the gaps across twelve releases. CI runs it all in the job `Subject (ESI.ts)`; by hand, with network access:

```
node packages/cli/bin/csh.js subject fetch --root subjects/esi-ts   # clone ESI.ts at the pinned commit
node packages/cli/bin/csh.js run --root subjects/esi-ts             # read and check it
node packages/cli/bin/csh.js overview --root subjects/esi-ts        # converged, gaps and indeterminate
node packages/cli/bin/csh.js expect --root subjects/esi-ts          # compare with the expected results
```

Four smaller profiles read one public codebase per language at a pinned commit: [fastapi-clean-example](subjects/fastapi-clean-example) (Python), [spring-hexagonal-poc](subjects/spring-hexagonal-poc) (Java), [go-clean-arch](subjects/go-clean-arch) (Go) and [hexarch](subjects/hexarch) (Rust). Each states what the subject's own documents say about its layering as rules and claims, and CI runs each in the job `Subject (<name>)`, comparing it with its expected results ([stage 36](docs/stages/stage-36.md)). The same job reads each of them, and the taskboard repository, cold, with no profile, and that analysis must meet the subject's `analysis-expected.json`: every gap it reports was checked against the subject's source, so a new one is a false gap until shown otherwise ([stage 60](docs/stages/stage-60.md)).

In another repository's workflow, the Action runs the same read, from a release tag or any ref, and adds the analysis to the job summary:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- uses: lgriffin/CSH@main   # or a release tag, once one is cut
  with:
    path: .
```

The A3 and the Lean foundations serve this outcome: the A3 reads the gaps as one problem with candidate causes and
countermeasures, and the solver decides which rules hold. Nothing a run finds is approved until a person approves it.

## The Assertion Ladder

[The Assertion Ladder](https://github.com/lgriffin/AI-Reference-Projects/tree/master/paper) grades how strongly a
repository asserts each rule, from L0 Implied to L5 Prevented. CSH reports it as a second axis beside the outcome
([15](docs/spec/15-assertion-ladder.md)): every told rule (a requirement, a Gherkin rule, an EARS sentence) gets the
highest rung its evidence establishes, and the outcome stays converged, gap or indeterminate.

| Rung | The rule is | CSH sees it when |
| --- | --- | --- |
| L2 Told | stated in prose | a source states it, and nothing checks it (also a gap: `unverified` or `uncited`) |
| L3 Checked | enforced by a check | a test or scenario cites it or sits under it, or what its "Verified by" names resolves |
| L4 Explained | enforced by a check that names the rule, the offender and the fix | an approved obligation of the specification cites it |
| L5 Prevented | impossible to write wrongly | a holding `total` claim cites it: a mapping the compiler checks is complete |

A rung counts only what stops a wrong change in the repository itself, so a subject profile's rules, which are CSH's
reading, never raise one. `total` is read in TypeScript (`Record<K, V>`), Java (a `switch` with no `default` over an
enum or sealed type) and Rust (a `match` with no catch-all); in Python and Go it is unknown, since no compiler checks it.
`csh ladder` lists every told rule, weakest first, with why it sits there:

```sh
node packages/cli/bin/csh.js ladder --run csh/a3/three-practices/stages/approved --root .csh-cache/walkthrough/lockout
```

The paper's own receivers are three profiles with known answers: [taskboard-typescript](subjects/taskboard-typescript),
[taskboard-java](subjects/taskboard-java) and [taskboard-python](subjects/taskboard-python). Every requirement is L3,
and R-ERR-1 is L5 in TypeScript and Java and L3 in Python, where the paper's compiler-caught mistake V6 needs an
architecture rule instead. [docs/guides/ladder.md](docs/guides/ladder.md) says how to climb.

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

## Using the command line

CSH is two commands: `csh` reads, checks, decides and reports, and `csl` emits and prints a specification. In a clone,
run them as `node packages/cli/bin/csh.js` and `node packages/cli/bin/csl.js`; installed from npm (`@lgriffin/csh`),
the packed tarballs or a release, as `csh` and `csl`, or `npx csh` and `npx csl` in a project. Below, `csh` stands for either. Every command explains itself:

```sh
node packages/cli/bin/csh.js --version
node packages/cli/bin/csh.js help overview
```

A first session on a repository you already have needs one command, and nothing in the repository changes:

```
csh analyse ../my-service              # read it cold; writes reports/csh-analysis.* and csh-a3.* here
```

A component you keep checking, with its own `csh/component.json`, goes round this loop:

```
csh init                               # write csh/component.json by answering one question per field
csh run                                # run each practice's tests, check, decide, and store the run
csh overview                           # every result as a gap, indeterminate or converged
csh explain <id>                       # one finding or entry in full
csh queue                              # what awaits your decision
csh approve <fragment> --actor <you> --rationale <why>
git add csh/ledger.ndjson && git commit -S -m "approve <fragment>"
csh run --mode enforcing               # in CI: exit 1 when an approved rule is broken
```

Options take their value as `--name value` or `--name=value`. `--root <dir>` names the component's directory (by
default the git repository's top level), and `--json` gives most reading commands' output to scripts. A misspelt
command or option is named with the nearest one, never ignored. Results go to standard output, problems and test
output to standard error.

| Exit code | Meaning |
| --- | --- |
| 0 | The command did its work, whatever it found: a report full of gaps still exits 0 |
| 1 | It could not do its work, or an enforcing gate blocked, or results did not meet what was expected |
| 2 | A usage error, named on standard error with the command's usage |
| 3 | A decision refused by `csh gate --verify`, or a past commit that needs other dependencies (`csh run --at`) |

[The command line guide](docs/guides/cli.md) has every option, the files each command writes, the environment
variables and the full reference. The commands, by what they are for:

| For | Commands |
| --- | --- |
| Reading a repository cold | `csh analyse <path>` |
| Describing a component | `csh init`, `csh init --subject <dir>`, `csh subject fetch`, `csh results import` |
| Running and checking | `csh run`, `csh check`, `csh gaps`, `csh coverage` |
| Reading the results | `csh overview`, `csh explain <id>`, `csh ladder`, `csh expect`, `csh status`, `csh queue` |
| Deciding | `csh approve`, `csh reject`, `csh retire`, `csh waive`, `csh countersign` |
| Gating and reviewing a change | `csh gate`, `csh gate --verify <decision.json>`, `csh diff <base> <head>` |
| Following a problem | `csh a3 open \| stage \| build \| verify`, `csh history <slug>` |
| The specification | `csl emit`, `csl print`, `csl lock` |
| Agents | `csh-agent --root <component>`, a tool server over the Model Context Protocol ([Agents](#agents)) |

A component is described by `csh/component.json`: its practices, the sources each owns and the command that runs each
practice's tests. A project keeps its other settings in `csh/config.json`, its ledger in `csh/ledger.ndjson` and its
maintainers in `csh/maintainers.json`.

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

What awaits the owner? `csh queue` lists every candidate rule, binding and A3, with who wrote it, how long it has
waited and what approving it would unlock, and warns when the list outgrows `queueLimit`. For the lockout example as
written, the bindings come first, since each holds back a rule:

```sh
node packages/cli/bin/csh.js queue --root examples/lockout
```

## Agents

An agent works through `csh-agent --root <component>`, a tool server over the Model Context Protocol with nine tools:
`status`, `run`, `gaps`, `explain`, `diff`, `queue`, `print`, `a3_open` and `propose_claim`, which writes a candidate
claim to `csh/claims.json`. None approves, rejects, retires, waives or
countersigns. Text from the component's sources reaches the agent only under keys named `quoted`, to be reported and
never followed. [The agent guide](docs/guides/agents.md) is the protocol to load as a standing instruction, with a
scripted session on the lockout regression that ends at "stop".

## Subjects

A component can evaluate a repository it does not hold. A `csh-component/v2` manifest names the subject and a pinned
commit, and may leave out the specification ([the manifest guide](docs/guides/manifest.md)). [subjects/esi-ts](subjects/esi-ts)
does this for ESI.ts, the first codebase CSH is being refactored to ingest ([11](docs/spec/11-ingesting-a-codebase.md)). It reads
ESI.ts's charter, guides, feature files, tests and issues as an inventory: what each requirement is verified by, which
rule each scenario sits under, and what refers to nothing. It also reads ESI.ts's history: prose older than the code
it names, statuses nothing supports, changes with no test and no reference, and how each moved across its releases.
Its security model is read as a structured trace, its test results are committed reduced to identifiers and paths, and
[Analyse it](#analyse-it) shows the outcome.

## Limits

- **Predicates are limited.** Linear integer arithmetic, enumerations and booleans, over one state per event. No concurrency, no time, no quantifiers in specifications.
- **Reserved constructs.** Temporal obligations are carried and reported, but not evaluated. Architectural obligations are evaluated when written with the `forbid`, `only` and `closed` builders, against a container diagram and the imports of TypeScript, JavaScript, Python, Java, Go and Rust code, and the packages their manifests declare ([architecture rules](docs/guides/architecture-rules.md)); a file in a language with no reader is a skipped fact ([12](docs/spec/12-polyglot-code.md)); any other value stays reserved.
- **Five lifting adapters.** Witness files, EARS requirements in Markdown, Gherkin scenarios through a step table, Mermaid C4 container diagrams, and dependency facts. Scenarios are read, never executed. Anything else must arrive as claim sets in IR form, or it stays unliftable. Documents, feature files, test files and issue exports can also be read as an inventory of items and edges, which gives gaps and no claims.
- **Test outcomes are read, never produced.** CSH runs no test. The probe's outcomes come from a reporter for Node's test runner ([Q-20](QUESTIONS.md)); the committed results of Vitest, of JUnit XML (Maven Surefire, Gradle, pytest, cargo-nextest) and of `go test -json` are joined to the tests that cite each item, and never enter a verdict. Results committed at another commit are joined to nothing.
- **Told rules are a reading.** `csh analyse` lifts a sentence that names a dependency with a restriction beside it, or an EARS sentence, on the words alone ([A-190](ASSUMPTIONS.md), [A-203](ASSUMPTIONS.md)); it is cited as the sentence, never checked as a predicate, and never raises a rung, unless it names a dependency-cruiser check its repository defines ([A-211](ASSUMPTIONS.md)). Some sentences about data rather than code are lifted too ([Q-57](QUESTIONS.md)). Five subjects, one per language, hold the expected results of their cold reads, and CI checks each.
- **Unknown is common.** A solver timeout, a missing binding or an unapproved binding all give unknown. That is a correct answer, not a malfunction.
- **Protection depends on keys.** It also depends on where the gate runs: CI should pin the root maintainers commit with `CSH_ROOT_COMMIT`, outside the repository ([A-28](ASSUMPTIONS.md)).
- **SSH signatures are untested.** Their verification is implemented through git but no fixture covers it ([Q-16](QUESTIONS.md)).
- **Choices made during the build are registered.** They are in [ASSUMPTIONS.md](ASSUMPTIONS.md). The owner decided Q-01 to Q-20 in [QUESTIONS.md](QUESTIONS.md) on 3 October 2026; each later question records the option the build took.

## Status of the build

Stages 1 to 65, 67, 68 and 70 to 80 are built, including the four of [the next layers](docs/spec/10-next-layers.md). All 161 golden
fixtures pass (F01 to F16, F20 to F24, F30 to F35, F40 to F46, F50 to F52, F60 to F64, F70 to F78, F80 to F125, F130 to F132, F140 to F142, F150 to F155, F160 to F165, F170 to F194, F210 to F230), as do
the unit, property and fault-injection tests; F118 to F125 cover [polyglot code](docs/spec/12-polyglot-code.md),
stages 29 to 35, F130 to F132 [what real runs asked for](docs/spec/13-from-real-runs.md), stages 38 to 44, F140
to F142 [what the Java and Python runs asked for](docs/spec/14-from-the-java-and-python-runs.md), stage 45, and F150 to F155
[the Assertion Ladder](docs/spec/15-assertion-ladder.md), stages 47 to 52, and F160 to F165 and F170 to F178 [the analyse command, danger, grain and polyglot evidence](docs/spec/16-analyse-danger-grain.md), stages 55 to 59; stage 60 calibrated it on five subjects and added the release and the Action; F179 to F183 [what the tutors-mono-repo run asked for](docs/spec/17-from-the-tutors-run.md), stage 61; F184 to F188 [what the Toads run asked for](docs/spec/18-from-the-toads-run.md), stage 62; F189 to F191 [what the TypeScript run asked for](docs/spec/19-from-the-typescript-run.md), stage 63; F192 to F194 [symbols in prose and task runners](docs/spec/20-symbols-and-task-runners.md), stages 67 and 68; F210 to F216 [accepted outputs paired by path](docs/spec/21-test-suites-as-evidence.md), stage 70; F217 to F219 [snapshot entries and outputs named after a test](docs/spec/21-test-suites-as-evidence.md), stage 71; F223 to F225 [what prose names, tests exercise](docs/spec/21-test-suites-as-evidence.md), stage 72; F220 to F222 [snapshot entries and outputs named after a test, beyond TypeScript](docs/spec/21-test-suites-as-evidence.md), stage 74; F226 [what a run read, parsed and skipped](docs/spec/21-test-suites-as-evidence.md), stage 75; F227 to F230 [the analysis A3 and the 1.0 evaluation](docs/spec/22-analysis-a3-and-1.0.md), stages 77 to 80. The composition fixtures
F70 to F78 were written by the implementer and accepted by the owner. [docs/stages](docs/stages) records what each
stage built and what its fixtures revealed.

```sh
pnpm typecheck
pnpm test
```

`pnpm typecheck` is strict TypeScript over every package and test; `pnpm test` runs every unit, property,
fault-injection, documentation and fixture test. `pnpm test:coverage` runs the same suite with coverage and fails when the workspace or
any package falls below its floor in [coverage-floors.json](coverage-floors.json); CI runs it in the job `Coverage`
([stage 65](docs/stages/stage-65.md)). `node packages/testkit/src/run-fixtures.ts` runs the fixtures alone,
with a summary.

## Repository

| Path | Contents |
| --- | --- |
| `packages/` | Twenty-seven packages, each with a README: `kernel`, `csl`, `emit`, `print`, `solver`, `check`, `arch`, `witness`, `adapter-witness-files`, `adapter-ears-markdown`, `adapter-gherkin`, `adapter-c4-mermaid`, `adapter-items`, `facts`, `facts-ts`, `facts-code`, `facts-imports`, `ledger`, `gate`, `component`, `run`, `review`, `agent`, `harness`, `a3`, `cli`, `testkit` |
| `docs/guides/` | How to use [the command line](docs/guides/cli.md); how to write a component manifest, a probe, a step table, an A3 and architecture rules; how to review a change, climb the Assertion Ladder and work as an agent; and the owner's runbook for authority |
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
