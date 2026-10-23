# Questions for the owner

Places where the documents are silent, ambiguous or contradictory (Implementer's brief, rule 2). Each entry gives
the options, what each implies, and the answer chosen, registered in [ASSUMPTIONS.md](ASSUMPTIONS.md).

**Q-01 to Q-20 are decided.** On 3 October 2026 the owner accepted the answer the build had taken for each of Q-01 to
Q-17, including the composition fixtures F70 to F78 as written, and later that day the cautious answer for each of Q-18
to Q-20 ([#5](https://github.com/lgriffin/CSH/issues/5), [#9](https://github.com/lgriffin/CSH/issues/9),
[#12](https://github.com/lgriffin/CSH/issues/12)). A new question gets the next number and stays open until the owner
answers it.

## Q-01 Which Node release is "the current long-term-support release"?

On 3 October 2026, Node 24 is the active LTS line and Node 22 is in maintenance LTS. The build container has Node 22.22.

- **Node 24 only.** This matches the wording, but the tool could not be run in the build environment.
- **Node 22.18 or later (chosen).** Type stripping is on by default and the permission model is stable. The tool runs on both lines, and CI tests both.

Decided on 3 October 2026: the chosen option. Recorded as A-25.

## Q-02 How is a strengthening accepted by "recorded review" (composition rule 4)?

The main tab, section 6.3, allows a local obligation to strengthen an inherited one "through a refinement check or a
recorded review". No document defines the review record.

- **Solver check only (chosen).** When the check cannot show strengthening, emission fails with `E-WEAKEN`. The profile can relax the obligation explicitly. This rejects more, which is conservative.
- **A new ledger decision kind**, such as `refine`, signed by a domain reviewer. This needs a schema change in the Authority tab.

Decided on 3 October 2026: the chosen option. Recorded as A-23.

## Q-03 F21 produces two findings the document does not list

The Semantic contract, section 7.3, expects one joint conflict for F21: the two requirements under Q-FEAS. The
query definitions also produce two more findings. Q-EX gives an `example-conflict` between the base example
`RejectAtBoundary` and the new requirement. Q-MEET gives a `not-met` finding: the model rejects a withdrawal of at
most 10,000 that would cross the floor, so the transition does not meet the new requirement.

- **Report them (chosen).** They follow from the definitions, and hiding them would be a silent filter. The fixture expects all three.
- **Report only the Q-FEAS finding.** That would need a rule that suppresses findings once a joint conflict exists, and no document gives one.

Decided on 3 October 2026: report all three. Recorded in `fixtures/F21/README.md`.

## Q-04 How are cycles of mutual assumptions detected?

The main tab, section 6.3, says that "a cycle of mutual assumptions is reported as unresolved". Version 1 packs carry
obligations and vocabulary but no assume–guarantee pairs, so no cycle can form.

- **Not implemented (chosen)**, until packs gain assume–guarantee contracts.
- **Implement a dependency graph over assumptions now.** It would have nothing to run on.

Decided on 3 October 2026: the chosen option. Recorded as A-24.

## Q-05 Can stale evidence ever be refreshed without re-running the test?

The Authority tab, section 5, makes evidence stale when a dependency changes. It does not say whether evidence can
return to current.

- **Never (chosen).** A new witness must be recorded at the new snapshot.
- **Re-judge when only the obligation's digest changed.** The witness values are unchanged, so the new obligation could be evaluated on them. But a change in meaning may need a different test.

Decided on 3 October 2026: the chosen option. Recorded as A-15.

## Q-06 Which assumptions apply to which query, and which source do transitions belong to?

The Semantic contract defines the queries "in a shared context C" without saying which assumptions make up C. It also
does not say which source transitions and bindings belong to.

- **By scope (chosen).** An assumption applies when it speaks about the state of the query, or about the event of the query. Transitions and bindings belong to a pseudo-source `model`.
- **All assumptions everywhere.** This could make unrelated queries vacuous.

Decided on 3 October 2026: the chosen option. Recorded as A-04, A-05.

## Q-07 What is the verdict of an approved obligation with no policy?

- **unknown, reason `no-policy` (chosen).** No method says what evidence would satisfy it (P3).
- **satisfied when no finding involves it.** This would be a silent pass.

Decided on 3 October 2026: the chosen option. Recorded as A-02.

## Q-08 Is a witness for another event inapplicable, or simply not evidence?

- **Not evidence (chosen).** It is left out of the obligation's evidence list. It still appears in the report's `executions`.
- **Inapplicable with reason `event-mismatch`.** Every witness would be listed under every obligation, which makes reports long.

Decided on 3 October 2026: the chosen option. Recorded as A-06.

## Q-09 Which queries run for a state that Q-STATE finds inconsistent?

Every formula is satisfied vacuously in an inconsistent state, so downstream queries would report noise.

- **Skip them (chosen).** Obligations on the state are marked skipped with reason `state-conflict`.
- **Run them all.** Every vacuity and feasibility answer on that state would be meaningless.

Decided on 3 October 2026: the chosen option. Recorded as A-07; fixture F13.

## Q-10 Do candidate fragments affect the verdict of an approved obligation?

The Semantic contract's verdict order says an obligation is conflicting when it is in a finding. It does not say
whether a finding with a candidate member counts against an approved obligation.

- **Only all-approved findings count (chosen).** A candidate, which an agent can write, cannot make an approved obligation conflicting or block the gate. The finding is still reported, with its members' authority.
- **Every finding counts.** An agent could then block delivery by writing one conflicting candidate.

Decided on 3 October 2026: the chosen option. Recorded as A-10.

## Q-11 What exactly is a single-source gap?

The Joint evaluation tab lists a gap where one practice asserts something the others are silent on, but gives no
precise test.

- **Every term the obligation constrains is asserted by one source only (chosen).**
- **The obligation itself is cited by no other source.**

Decided on 3 October 2026: the chosen option. Recorded as A-12.

## Q-12 What is the snapshot of a working tree with uncommitted changes?

- **`HEAD-dirty` (chosen).** Witnesses are never current against it, and the gate refuses to decide for it unless its report has the same snapshot.
- **HEAD.** A decision would be bound to a commit that does not hold what was checked (CSH-010).

Decided on 3 October 2026: the chosen option. Recorded as A-16.

## Q-13 Which files count as "implementation" for staleness?

The Authority tab, section 5, makes evidence stale when the implementation changes, without saying which files.

- **Everything outside `csh/` unless configured (chosen).** Evidence becomes stale more often, which is conservative.
- **Nothing unless configured.** Evidence would stay current after any code change.

Decided on 3 October 2026: the chosen option. Recorded as A-17.

## Q-14 Which git signature statuses count, and who authored an unsigned change?

- **`G` or `U`, with trust from `csh/maintainers.json` (chosen).** An unsigned or unknown author is `unattributed` and never ends a self-approval.
- **`G` only.** This needs every maintainer key marked trusted in each CI keyring, which duplicates the maintainers file.

Decided on 3 October 2026: the chosen option. Recorded as A-18, A-19.

## Q-15 Can the report carry fields the documents do not list?

- **Yes, marked as extensions (chosen).**
- **No.** Unliftable content, harness errors and executions would then have no place in the report, against P2 and P4.

Decided on 3 October 2026: the chosen option. Recorded as A-01.

## Q-16 How should SSH-signed commits be verified?

The owner may sign with OpenPGP or SSH keys. Git verifies SSH signatures only against an allowed-signers file. That
file would be a second list of trusted keys beside `csh/maintainers.json`.

- **Use git's verification for both (chosen).** CI configures `gpg.ssh.allowedSignersFile` from the maintainers file. Only the OpenPGP path is tested by fixtures.
- **Verify SSH signatures in the harness** with `ssh-keygen -Y verify` against keys taken from `csh/maintainers.json` directly.

Decided on 3 October 2026: the chosen option. Recorded as A-26.

## Q-17 Do the composition fixtures F70 to F78 express the owner's intent?

The brief asks for these fixtures to be written first and flagged for owner review. They are in `fixtures/F70` to
`fixtures/F78`. The owner accepted them as written, and their review flags were removed. They cover: pinned packs, lock mismatch, missing lock, vocabulary
disagreement, strengthening, silent weakening, explicit relaxation, a second unrelated domain, and a conflict between
local and inherited obligations.

Decided on 3 October 2026: the chosen option. Recorded as A-32.

## Q-18 How does a packed package run from `node_modules`?

The anchor design (09, section 10.4) installs the harness from tarballs made by `pnpm pack`. Verified on 3 October 2026
with Node 22.22: `pnpm pack` packs a package marked private, and Node refuses to strip types from a file under
`node_modules` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`). A packed package whose exports point at TypeScript
source therefore cannot run. [ADR-18](docs/adr/ADR-18-no-build-step.md) says the tool runs TypeScript directly, with no
build step.

- **Compile only when packing (chosen).** The workspace keeps running TypeScript directly, as ADR-18 says. Packing compiles each package to JavaScript with `tsc` and points the packed package's exports at the compiled files (`publishConfig`). The tarballs are the only place compiled code exists, and fixture F96 tests them.
- **Compile always.** Every package exports compiled JavaScript, and the workspace builds before it runs. This reverses ADR-18.
- **Ship source and require a loader.** Users would run Node with a TypeScript loader; nothing in Node supports this under `node_modules` without a third-party dependency.

Decided on 3 October 2026: the chosen option ([#5](https://github.com/lgriffin/CSH/issues/5)). Recorded as A-40; stage 16 built it, and F96 installs the starter from those tarballs.

## Q-19 Do tabs 00 to 08 take the amendments of 09, section 6.5?

Raised in stage 13. Tracked as [issue #9](https://github.com/lgriffin/CSH/issues/9).

Section 6.5 lists amendments to the semantic contract, joint evaluation, evidence, ledger and architecture tabs: Q-DIV,
`deterministic`, the new finding and gap kinds, witness version 2 and `cites`, `componentDigest`, and three
containers. The implementer may not edit tabs 00 to 08.

- **Record them in 09 and the decision records (chosen).** The tabs are unchanged; 09, ADR-33, ADR-34 and A-36 to A-44 are the record.
- **The owner amends the tabs.** The tabs stay the single source, and 09 becomes history.

Decided on 3 October 2026: the chosen option ([#9](https://github.com/lgriffin/CSH/issues/9)). Tabs 00 to 08 stay as they are, and 09 with its decision records is the record of the anchor design. Nothing in the code depends on the answer.

## Q-20 How should the gate's own unit tests feed the harness?

Raised in stage 15. Tracked as [issue #12](https://github.com/lgriffin/CSH/issues/12).

The gate component's test practice is its unit tests with a probe around `gate` (09, section 8). Those tests run under
vitest, and `@csh/harness` has a reporter for Node's test runner only, without which no witness becomes a claim.

- **A separate probe file (chosen).** `packages/gate/test/gate.probe.ts` repeats the cases of `gate.test.ts` under `node --test`. The two copies could drift apart; `packages/gate/test/probe-agrees.test.ts` checks that they state the same table and that every probe case is a unit test.
- **A vitest reporter in `@csh/harness`.** The repository's tests are probed where they are; a second reporter keeps to the identity rules of A-39.
- **The gate's tests move to Node's test runner.** One copy, outside the vitest suite.

Decided on 3 October 2026: the chosen option, with the agreement check ([#12](https://github.com/lgriffin/CSH/issues/12)). Recorded as A-49.

## Q-21 How does `csh diff` run the merge base of a pull request?

Raised before stage 17, while verifying section 10 of [10](docs/spec/10-next-layers.md).

Section 5.1 has `csh diff <base> <head>` run either side that has no stored run. A run at a past commit (`csh run --at`)
uses the working tree's installation and refuses a commit whose dependencies or workspace packages differ from it
(A-38, A-55). A pull request that changes a package the component resolves is exactly that case, so the merge base
would always be refused in CI.

- **The CI job runs the base in a checkout of its own (chosen).** A second worktree at the merge base, installed with `pnpm install --frozen-lockfile`, runs its own `csh run`; `csh diff` takes that stored run's directory as the base. A side that cannot be installed or run is `base-unavailable`, and the diff shows the head alone. `csh diff` given a commit still runs it with `csh run --at`, and reports `base-unavailable` with the refusal's reason when that is refused.
- **`csh run --at` installs the commit's dependencies.** One mechanism for every caller, but the harness would then run package installs, which A-38 rules out.

Taken provisionally as A-77, the option that installs nothing inside the harness.

## Q-22 Where is the gate's regression commit kept?

Raised before stage 17. Section 3.2 of [10](docs/spec/10-next-layers.md) keeps the regression on the gate's A3 as "a
commit, kept under a tag and never merged" that edits `gate.ts` and its probe together.

- **As files in the repository, applied in a scratch copy (chosen).** `packages/gate/regression/` holds the edited `src/gate.ts` and `test/gate.probe.ts`, as `examples/lockout/regression/` does for the lockout. The test of stage 17's exit copies the gate component into a scratch repository, signs approvals with a test-only key, commits the regression there, and records that the enforcing gate job blocks it. No tag is pushed, and `gate.ts` in the repository is never changed.
- **A tagged commit.** Exactly what section 3.2 says, but a tag is a ref outside the branch every change is reviewed on, and a stage recorded at it in the real gate A3 would show an allow until the owner approves anything, since candidates never block.

Taken provisionally as A-78. The regression stage of the gate's own A3 is recorded once the owner's approvals exist;
until then the scratch copy is where the block is shown.

## Q-23 Does a local Go import depend on its package directory or on the package's files?

Raised in stage 33. Section 3 of [12](docs/spec/12-polyglot-code.md) says a local Go import "is the package
directory". A dependency fact names a module, and a module is a file; a rule's `modules("internal/db/**")` selects the
files under a directory, not the directory itself, so a dependency on `internal/db` would match no rule.

- **Each non-test file of the package directory (chosen).** A rule over `internal/db/**` sees the import, and an
  import of a package whose directory holds no file read is a `skipped` fact. One import line becomes several facts.
- **The directory, as section 3 says, with module globs widened to select a directory.** One fact per import, but
  the glob semantics of A-101 change for every language.

Taken provisionally as A-132. Section 3 of 12 disagrees with it until the owner decides.

## Q-24 Which directories are a Python project's source roots?

Raised in stage 31. Section 3 of [12](docs/spec/12-polyglot-code.md) names the root, `src` and the parent of every
top-level package. A test directory without `__init__.py`, which pytest puts on `sys.path` itself, is none of these,
so `import conftest` or `import helpers` from a test reads as an external package, and a rule about local modules
does not see it.

- **Section 3's roots only (chosen for now).** No configuration is read; such an import is named as an external
  package.
- **Also every directory holding a `.py` file that a sibling imports by a bare name, and `tool.setuptools`/`tool.pytest`
  paths in `pyproject.toml`.** Closer to how pytest runs, at the cost of reading tool configuration.
- **A bare import whose name is a `.py` file anywhere in the source is a `skipped` fact.** The cautious option: an
  ambiguous import is unknown rather than external.

Taken provisionally as A-130. The cautious option is recommended; it is not yet built.

## Q-25 Are Python's `ABC` and `Protocol` built-in bases?

Raised in stage 31. `BUILT_IN_BASES` in `packages/arch` lists Python's built-in exception and object classes, so an
`inherits` chain ends at `Exception`. A class whose base is a bare `ABC` or `Protocol` (imported from `abc` or
`typing`) reads as `base-not-read: ABC`, which is unknown.

- **Leave them out (chosen).** Unknown is a correct answer: the base is imported, not built in.
- **Add `ABC` and `Protocol` as roots.** A chain through them is refuted or holds, but a local class of the same name
  would be misread.

Taken provisionally as A-130.

## Q-26 How does a profile expect a disagreement between a subject's documents and its code?

Raised in stage 36. A subject's documents state its layering, and its code may not follow them.

- **Expect what CSH should report, decided before the run from the documents and a reading of the code (chosen).** The
  spring-hexagonal-poc core imports Spring and Lombok though its Readme says it has no external dependencies, so the
  profile expects that rule `violated`.
- **Expect each document's statement as satisfied.** CI then fails whenever CSH correctly reports the disagreement.
- **Expect nothing for such a rule.** It is listed as unknown, and a regression in it goes unseen.

Decided on 12 October 2026: the chosen option. Recorded as A-135.

## Q-27 May a profile's expected results leave out counts?

Raised in stage 36. The ESI.ts profile records the counts of converged, gaps and indeterminate (A-125). A count cannot
be derived from documents before a run (brief, rule 4).

- **Rows only (chosen).** Every expectation comes from the documents; drift in what is not expected goes unseen.
- **Counts recorded after the first run, labelled as a snapshot.** Catches drift, but they are output, not expectations.

Decided on 12 October 2026: rows only. Recorded as A-135.

## Q-28 What the stage 36 subjects' documents mean

Raised in stage 36. Each profile takes one reading where its subject's documents allow two; each is recorded in
[docs/stages/stage-36.md](docs/stages/stage-36.md).

- **spring-hexagonal-poc** (Readme.md:42): "business doesn't have any external dependencies" is read strictly, no
  third-party library (`violated`), not as no adapter (which `BusinessImportsNoAdapter` covers, and holds).
- **fastapi-clean-example**: the README's dependency rule constrains only the core (README.md:205), while the
  `pyproject.toml` import-linter contract orders every layer. The profile follows the contract; both hold today.
- **go-clean-arch**: the README's four layers (models, repository, usecase, delivery) belong to v1; the profile maps them
  to `domain`, `internal/repository`, `article` and `internal/rest`.
- **hexarch**: the README calls `Service` a trait; in the code it is a struct implementing `BlogService`. Claims cannot
  name a declaration's kind, so this stays unknown. Its design is stated in `///` doc comments, which no `Documents`
  source reads as citable items; whether doc comments should become citable is open.

Acknowledged on 12 October 2026: the profiles keep these readings.

## Q-40 How does a claim name a nested type?

Raised in stage 45, from the owner's Java run (B1). A nested interface `StreamingCallback` inside `ClaudeCliService`
was not declared at all; nested types are now declared ([14](docs/spec/14-from-the-java-and-python-runs.md), section 1).

- **By its dotted name from the top-level type, `ClaudeCliService.StreamingCallback` (chosen).** Unique within a file,
  Java's own source name for it, and the form Go methods and Java constants are already declared in.
- **By its simple name, `StreamingCallback`.** As documents usually say it; two nested types of one name in one file
  would collide.

Decided on 12 October 2026: the dotted name. Recorded as A-170.

## Q-41 Does `java.sql.*` select the dependency `java.sql`?

Raised in stage 45, from the owner's Java and Python runs (B2, B3). An external dependency is named by its package
(`java.sql`, `PySide6`), so a rule forbidding `java.sql.*` or `PySide6.*` selected nothing and held.

- **A package covers its members (chosen).** A glob ending in `.*` or `.**` also selects the dotted name before it; a
  glob naming something under a recorded name is indeterminate ([14](docs/spec/14-from-the-java-and-python-runs.md),
  section 2).
- **Documentation only.** Matching stays literal; the guide says externals are recorded as packages, and the overview
  shows `target-selects-nothing` on the rule.

Decided on 12 October 2026: a package covers its members. Recorded as A-171 and A-172.

## Q-42 Should a subject profile's rules count towards a rung?

Raised in stage 48 ([15](docs/spec/15-assertion-ladder.md), section 1). A profile states a subject's documents as rules
CSH judges, but nothing in the subject runs them.

- **Never (chosen).** A rung counts only what stops a wrong change in the repository itself; CSH's reading of a subject
  is the inspection, not the subject's assertion. A rule a profile states stays at the rung the subject's own tests give.
- **Count a holding profile rule as L3.** The ladder would then report what CSH checks rather than what the repository
  does, and a subject would climb by being profiled.

Decided by Leigh on 12 October 2026: never. Recorded as A-175.

## Q-43 Can CSH tell that a subject's own check explains its failure?

Raised in stage 48. L4 needs a failure that names the rule, the offender and the fix. CSH reads tests without running
them, so it cannot read what a failing test prints. A test's title names the rule (the receivers' titles open with the
requirement's identifier) but not the offender or the fix.

- **Not established (chosen).** A subject's test raises a rule to L3 only; L4 comes from an approved CSH obligation.
- **Read assertion messages statically** (`expect(x, "message")`, `assert x, "message"`, AssertJ's `.as(...)`), per
  language, and count a message that names a remedy. A heuristic over meaning.
- **Read failure messages from test results** (JUnit XML, vitest JSON) when a run failed. Only seen when a test fails.

Decided by Leigh on 12 October 2026: not established; L4 comes only from an approved CSH obligation. Recorded as A-175.

## Q-44 Fading: should prose that repeats a checked rule be a gap?

Raised in stage 48. The paper removes a rule from the prose once a check covers it. Telling whether a sentence restates
a rule needs its meaning, which CSH does not read; an identifier in the sentence only says the sentence refers to it.

- **Not reported (chosen).**
- **Report an instruction-file line that cites an identifier at L3 or above** as a suggestion to fade. It would also
  flag sentences that only point to the rule.

Decided by Leigh on 12 October 2026: not reported.

## Q-45 Should CSH read the paper's violation seeding results?

Raised in stage 48. The paper benchmarks a repository by planting canonical mistakes and running its gate. CSH reads and
never runs, so it cannot seed; it could read a seeding run's results (the receivers' `evaluation/results.json`) as
evidence of which mechanism caught each mistake, as it reads test results.

- **Not read (chosen).** No format is shared yet.
- **Read them**, as converged where the mechanism that caught a seed matches the rung CSH finds, a gap where it does not.

Decided by Leigh on 12 October 2026: not read.

## Q-46 Prevention CSH does not read

Raised in stage 49. TypeScript can prevent an unmapped member with an exhaustive `switch` that assigns to `never`;
Python can with `assert_never` under a type checker; Go linters can demand a complete `switch`. None is read: the first
needs control flow, the others a tool's configuration and verdict.

- **Not read (chosen).** Such a rule stays at the rung its tests give; a `total` claim is refuted (TypeScript) or
  unknown (Python, Go).
- **Read each one**, at the cost of a reader per form.

Decided by Leigh on 12 October 2026: not read. Recorded as A-177 and A-180.

## Q-47 Paths in a document of a subdirectory

Raised in stage 51. The taskboard receivers each sit in a directory of one repository, and their `AGENTS.md` names
`src/domain/` meaning `typescript/src/domain/`. Paths are resolved from the repository root, so these are not checked
(neither resolved nor dangling).

- **Leave them unchecked (chosen).**
- **Resolve a path against the document's own directory as well**, so a receiver's instructions are checked against its
  own tree. Could resolve a path the author did not mean.

Decided by Leigh on 12 October 2026: leave them unchecked.

## Q-48 Waiving a danger finding

Raised in [16](docs/spec/16-analyse-danger-grain.md), section 7. A danger finding is a view over a gap, a finding or an
obligation that already has its own id and, for an obligation, its own digest.

- **Through what is beneath it (chosen).** A view never gains authority of its own.
- **Its own fragment digest**, so that it can be waived like a violation.

Built as proposed on 14 October 2026, when Leigh asked for spec 16 to be realised; [issue 78](https://github.com/lgriffin/CSH/issues/78)
asks the owner to confirm.

## Q-49 A citation whose test body cannot be read

Raised in 16, section 7. A test cites a rule, and CSH cannot read the test's body (an unknown runner, a language it does
not parse), so the test's grain is unknown.

- **Indeterminate, naming the file (chosen).** A reader's limit is never reported as the repository's fault.
- **Masked**, since nothing shows the test observes the rule's terms.

Built as proposed on 14 October 2026; issue 78 asks the owner to confirm.

## Q-50 Where a told rule lifted by analyse lives

Raised in 16, section 7. `csh analyse` lifts layering and EARS sentences from a repository's documents as told rules.

- **In the run only, unless `--profile` is given (chosen).** Analyse writes nothing into a subject.
- **A candidate in the profile's `csh/claims.json`.**

Built as proposed on 14 October 2026; issue 78 asks the owner to confirm.

## Q-51 Distribution

Raised in 16, section 7. Nothing is published ([ADR-32](docs/adr/ADR-32-local-only-distribution.md)), so a stranger
needs a clone, pnpm and Node 22.18 to run CSH.

- **A tagged tarball release on GitHub, plus an Action, first (chosen);** npm when a second maintainer joins.
- **Publish to npm under a scope.**

Built as proposed on 14 October 2026; issue 78 asks the owner to confirm. Cutting a release tag is the owner's. Stage 60
built it: `.github/workflows/release.yml` packs every package on a tag `v*`, installs the bundle outside the repository,
runs `csh analyse` from it and attaches the tarballs to the tag's release; `action.yml` runs `csh analyse` from the
Action's own source. [ADR-32](docs/adr/ADR-32-local-only-distribution.md) records it.

## Q-52 Which phrases claim a rung

Raised in 16, section 7. The masked shape "rung claimed above rung established" needs to know when prose claims that a
rule is checked or prevented.

- **A short list in the EARS adapter's vocabulary (chosen):** "tested", "enforced", "guaranteed", "cannot", and their
  forms; cited, never translated; extended by fixture.
- **Any modal of necessity.** Would read every "must" as a claim of enforcement.

Built as proposed on 14 October 2026; issue 78 asks the owner to confirm. Stage 56 left "cannot" out of the list: on its
own it states the rule ("the domain cannot import the store") rather than claiming that something checks it, so it
would mark every such rule. The list is "tested", "covered by tests", "enforced", "guaranteed", "verified", "checked
by", "asserted by" ([A-192](ASSUMPTIONS.md)).

## Q-53 A masked case for each taskboard receiver

Raised in 16, section 7. Q-45 decided not to read the paper's violation seeding. A seeded mistake that the receivers'
tests stay green on is the canonical masked case.

- **Yes, in stage 56 (chosen):** one masked case per receiver, as a danger fixture.
- **No.**

Built as proposed on 14 October 2026; issue 78 asks the owner to confirm. The cases moved to stage 59: a receiver's
masked case comes from its own test results, so they are F174 (Vitest), F175 (Surefire JUnit XML) and F176 (pytest's
JUnit XML), each a rule or claim the code refutes whose citing test passed.

## Q-54 Self-approval in a repository with one maintainer

Raised in stage 56. The masked shape "authority that is not authority" marks an approved rule that converges when its
approval is self-approved. In a repository whose maintainers file names one person, every approval is self-approved,
so every convergence is masked (the lockout walkthrough shows three).

- **Mark it whatever the maintainers file says (chosen):** the authority runbook asks for a second maintainer, and the
  close line says so; a single-maintainer repository sees the cost of having one.
- **Mark it only when the maintainers file names two or more people.** Quieter, and silent about the case the shape
  exists for.

Built as the first on 14 October 2026; issue 78 asks the owner to confirm.

## Q-55 A citation whose grain CSH cannot read

Raised in stage 57. Spec 16, section 4, says that where a citing test's grain cannot be read the finding is
indeterminate, with the file named. A citation with no grain arises where a practice sets `citeBodies` (an identifier in
any string of the file cites, so no one test body is the citation's) or where an adapter has no reader for the file.

- **Skip the comparison for that rule (chosen):** no entry; the rule keeps whatever else is said of it. No subject in
  CI has such a citation beside a rule with terms, so nothing is hidden today.
- **An indeterminate entry naming the file.** What the spec says; it adds an entry per such rule in profiles that set
  `citeBodies`; no profile in this repository sets it today.

Built as the first on 14 October 2026; the issue for the stage 55 to 60 decisions asks the owner to confirm.

## Q-56 A repository that builds one package

Raised in stage 58. A `Code` source holding a single Maven module, Go module, crate or distribution could write a
`package` fact for it as an npm workspace of one package does. A container diagram of such a repository usually names its
directories, not the package, so the package would read as `unplaced-package` on every such subject, and there is no
dependency between packages to judge.

- **Write package facts only when the source holds two or more (chosen):** a single-module repository is ruled by
  `modules(...)`, as it is today.
- **Always write them.** Every single-module repository with a diagram gains a gap naming its one package.

Built as the first on 14 October 2026; the issue for the stage 55 to 60 decisions asks the owner to confirm.

## Q-57 Told rules about data rather than code

Raised in stage 61. The cold read of tutors-mono-repo lifted dependency sentences about data and tools, such as "Edits in
the collaboration room are independent of the source `.excalidraw` file" and "nothing is tied to localhost", as told
rules, each an `unverified` gap.

- **Keep reading words, not meaning (chosen):** a narrower vocabulary (only sentences that name a layer, a package or a
  path) would drop "Independent of Database." and "Your business rules are not bound to the database.", which the
  stage 60 calibration showed to be true.
- **Lift only sentences naming a part of the code.** Quieter on documents like tutors-mono-repo's, and silent on the
  clean-architecture READMEs.

Built as the first on 15 October 2026.

## Q-58 vitest-cucumber parameters CSH does not know

Raised in stage 61. vitest-cucumber defines more parameter types than the six A-207 reads (`{any}`, `{list}`, `{date}`
and others), and a project can add its own.

- **Any other `{name}` matches anything (chosen):** a step is never undefined because CSH does not know a type; a
  definition can match more than the library would, so an unused definition can be missed.
- **An unknown parameter makes the definition unreadable.** Its steps become undecided rather than matched.

Built as the first on 15 October 2026.

## Q-59 How a sentence says a file is elsewhere or absent

Raised in stage 61. A-210 leaves a missing path unchecked when its sentence holds an absence word or an `owner/repo` that
names no top-level entry. The words are a fixed list, and a sentence such as "`docs/x.md` was moved from old/place" also
reads as naming another repository.

- **The fixed lists (chosen):** each false refuted finding of the tutors run is gone, and what is left unchecked is
  said nowhere as a gap; a real missing file mentioned beside such a word is missed.
- **Report such a path as indeterminate.** Every one stays visible, at the cost of an entry per mention.

Built as the first on 15 October 2026.

## Q-60 Which runner the executions guess names

Raised in stage 62. The proposal's `executions` guess names vitest or jest when a `package.json` lists either one. Toads lists vitest in `apps/web`, but its requirements are run by pytest (`[tool.pytest.ini_options]`), so the guess points at the smaller runner.

- **Leave the guess as it is (chosen for now):** it is a guess, listed as one, and no outcome depends on it.
- **Name every runner the repository configures,** pytest among them, with the command that writes each one's results file.

Built as the first on 23 October 2026.

## Q-61 How a computed pytest-bdd binding is read

Raised in stage 62. Toads binds 52 scenarios through helpers that compute each title from the feature file (`@_bind("hub_claim.feature", 1)`). CSH cannot read which scenario such a call binds, so every scenario of the features those files name that is not otherwise bound is `binding-undecided`. There are 73 of them. A `scenarios()` call computed in a loop over literal names is read as binding each name (A-215).

- **Indeterminate, naming the file (chosen):** nothing is called a gap that pytest might run, and each entry says what would decide it.
- **Read the helper's idiom,** a number or identifier passed beside a feature name. That decides more, at the cost of a reading specific to one repository.

Built as the first on 23 October 2026.

## Q-62 What a test title cites when the repository has no identifier scheme

Raised in stage 63. The cold read of microsoft/TypeScript found no identifier scheme, and read "WTF-8" in a test title as a citation of a requirement nothing defines. The default pattern already leaves out `UTF`, `SHA`, `ISO` and a few other names by listing them.

- **Cite nothing when there is no scheme (chosen):** with no scheme, an identifier names nothing the repository defines, so nothing can be refuted. A test that cites a tracker key, such as `JIRA-123`, is no longer a dangling reference either.
- **Grow the list of names left out:** each new encoding, standard or tracker key would be another false refutation until it was listed.

Built as the first on 23 October 2026.

## Q-63 What a name a package's document gives, and its code does not declare, is

Raised in stage 67. `tsc/internal/format/README.md` names `createRulesMap`, which the Go port renamed `buildRulesMap`. Its sibling `tsc/internal/fswatch/README.md` names `ReadDirectoryChangesW`, a Windows API. Nothing in the text tells the two apart, and a measure over TypeScript, Toads, tutors-mono-repo and CSH found most undeclared names in backticks are of code outside the repository: OS APIs, JSON keys, framework types, other repositories' classes.

- **Indeterminate, listing each name (chosen):** the renamed function is shown with what would decide it, and nothing outside the repository is called a gap.
- **A gap, as a dangling reference:** finds the rename with the same weight as a missing file, at the cost of false refutations wherever a document names an API it calls.
- **Read only a name with a code verb nearby** ("calls", "via", "returns"): fewer names, but the rule would be a guess at English, and `ReadDirectoryChangesW` sits in a table with none.

Built as the first on 23 October 2026.
