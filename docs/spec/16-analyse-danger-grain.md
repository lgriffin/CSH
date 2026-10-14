# 16. Analyse: danger, granularity and the standalone static analysis mode

Written by Leigh on 14 October 2026 against `lgriffin/CSH` at PR #77 (12 October 2026). This tab is a read-only
export of that document; the stage notes ([55](../stages/stage-55.md) onwards) record what was built from it, and the
choices made while building are in [ASSUMPTIONS.md](../../ASSUMPTIONS.md).

CSH becomes a static analysis tool a person can point at any repository, in any of five languages, and get back three
things: where the code and its words align, where its words conflict, and where it is in danger. The distance is
shorter than it looks: the polyglot readers are built; what is missing is a zero-configuration entry and a name for
danger.

**The decision on danger.** A green result gives reassurance. CSH's job is to catch the contradiction that sits beyond
the granularity of that green. A test that passes observes one thing at one grain; a sentence in a README states
something at another. When the sentence is finer than anything the evidence observes, the green is reassurance the
repository has not earned, and CSH flags it. This is the point of the tool, so masked danger counts, and a passing
test can be reported as dangerous.

**What does not change.** Nothing is scored. Converged, gap and indeterminate stay the three outcomes. The four axes
(authority, verdict, applicability, disposition) are never merged. The gate alone decides disposition. "We should not
assume" holds: unmentioned state is unconstrained, and a danger CSH cannot establish is reported as indeterminate,
with what would decide it.

**What the tool is for.** Software changed quickly, including by agents, must not be declared correct on evidence that
does not support the claim. Analyse mode is that sentence made into one command.

## 1. Where CSH stands

The reading layer is done in five languages; the rule layer is hand-written in every one of them. Stages 1 to 54 are
built, 109 golden fixtures pass, and eight subject profiles run in CI. The table is what the code does at PR #77.

| Capability | TypeScript | Python | Java | Go | Rust |
| --- | --- | --- | --- | --- | --- |
| Modules, imports, declarations, exports (`facts-code`, tree-sitter) | yes (`facts-ts`) | yes | yes | yes | yes |
| Manifest fields | package.json | pyproject only | pom.xml only | go.mod, go.work | Cargo.toml |
| `forbid`, `only`, `acyclic` over modules | yes | yes | yes | yes | yes |
| `container(...)`, `closed`, `undrawn-dependency`, `unplaced-package` | yes | no | no | no | no |
| `total` (rung L5) | yes | unknown | yes | unknown | yes |
| `inherits` | classes | classes | classes only, not interfaces | no | no, not traits |
| Test identification and citations | yes | pytest | JUnit | `TestXxx`, `t.Run` | `#[test]` |
| Test results import | Jest, Vitest, Node runner | none | JUnit XML | `go test -json` | none |
| Gherkin step definitions | JS/TS | no | no | no | no |
| `uncited`, `unverified`, L2/L3 | yes | yes | yes | yes | yes |

Container rules are TypeScript-only because `package` facts come only from `facts-imports`, which reads npm
workspaces. That one gap blocks diagram-based rules everywhere else.

**What a human writes today.** `csh init --subject` infers the manifest: sources, test globs, code extensions,
root-level manifests only. Every rule, claim, citation and expected result in the seven polyglot profiles is
hand-written in `csh/spec.csl.ts` and `csh/expected.json`. No polyglot subject has a diagram, a step table or committed
results, and none runs its tests.

**What a stranger gets.** Nothing is published ([ADR-32](../adr/ADR-32-local-only-distribution.md)); the install needs
Node 22.18, pnpm, git and GnuPG. Pointed at a repository with no profile, CSH returns an inventory: sentences nothing
cites, tests under no rule, coverage by extension. Useful, but it is the quiet end of what the engine can say.

## 2. The analyse mode

`csh analyse <path>` is one command: propose a manifest, lift what the repository's own words say, read its code and
tests, check, and place every result, with danger first. It writes `reports/csh-analysis.html` and `.json` and exits 0
when it completes. It is advisory only.

```
csh analyse <path> [--at <commit>] [--json] [--out <dir>] [--profile <dir>] [--budget ms]
```

**What it reads, with no profile present.**

1. The manifest `init --subject` proposes, including nested `pom.xml`, `go.mod`, `Cargo.toml` and `pyproject.toml`,
   and prints every guess.
2. Told rules lifted by the adapters that already exist: EARS sentences in Markdown, Gherkin scenarios, Mermaid C4
   container diagrams, and layering sentences in READMEs and guides (stage 36 wrote these by hand; analyse lifts them).
3. Code facts in all five languages, test inventories and citations, and committed results where the repository holds
   them (JUnit XML, `go test -json`, Vitest and Jest reports).
4. History, when `--at` is given or the checkout has it: prose older than the code it names, statuses nothing supports.

**What it reports, in this order.** Danger (refuted, then masked), joint conflicts, gaps, indeterminate with what would
decide each, converged, then counts. Each finding carries the finding id, the source line, the evidence, and the one
input that would move it. The Assertion Ladder stays a second axis on every told rule.

**What it never does.** It never runs the subject's tests or build, never writes into the subject, never approves,
never scores, never reads a ledger or a key. GnuPG is not required. A rule it lifts is a candidate with the subject as
its author, so a profile's rules never raise a rung (Q-42 holds).

**When a profile exists.** `--profile <dir>` (or `csh/` beside the subject) adds the hand-written rules and expected
results on top, and `csh expect` still compares. The four doors of the README gain nothing new; analyse is what the
Analyse door now opens onto.

## 3. Danger

Danger is a view across the three outcomes, not a fourth outcome and not a score. A result keeps its outcome (gap,
say) and is also marked dangerous when it has one of two structures. The semantic contract gains a selector and a
rendering; it loses nothing.

**Refuted.** A statement and the code cannot both hold. In the shared context C:

```
SAT(C ∧ S)    SAT(C ∧ K)    UNSAT(C ∧ S ∧ K)
```

where S is one told statement (an EARS sentence, a layering rule, a stated version, a claim) and K is the code facts,
the model's transitions, or a counterexample from the solver. It is the single-source twin of a joint conflict: there
the two members are both statements; here one member is the code. Today these sit inside gaps as "prose the code
refutes" and `not-met`; analyse lifts them out and names them.

**Masked.** A signal reads as assurance and the evidence does not support the assurance at the grain the statement
has. The canonical case is the lockout regression: the tests stay green and an approved rule is now violated. Masked
danger is established, never inferred, by one of these shapes:

| Shape | What reads green | What the grain misses | Exists today as |
| --- | --- | --- | --- |
| Test under no rule | a passing test | no statement constrains what it observes | gap `no-rule-behind` |
| Citation without observation | a test cites R-12 | the test's observed terms do not cover R-12's terms | new |
| Rung claimed above rung established | prose says "covered by tests" or "enforced" | the ladder finds L2 | new, from `ladder` and `claimEvidence` |
| Stale evidence | results committed at commit X | the file is newer than X | applicability `stale` |
| Silence beside a rule | an approved rule | no boundary example exercises it | gap view |
| Authority that is not authority | an approval line | self-approved, waived, or an agent key | ledger marks |

Each row is a finding with its own id, its source, the green it names, and the one input that would close it (a
citation, a boundary example, a fresh run, a second maintainer).

**What danger is not.** Not indeterminate: unknown is an honest answer, and a solver timeout is never dangerous on its
own. Not disposition: the gate alone blocks. Not severity: findings are ordered by what costs a reviewer a decision, as
`csh diff` already orders them, and never summed. Not a reading of intent: CSH offers the three readings and chooses
none.

## 4. Granularity

Every statement and every piece of evidence has a grain: the set of terms it constrains or observes, and the range it
covers on each. A green is reassurance exactly over its grain and silence beyond it. Masked danger is the case where a
statement's grain is finer than the grain of everything green that is taken to support it.

**Grain of a statement.** For a predicate in CSL it is the terms it mentions and, per term, the values its guards
bound; the emitter already has this (the collision terms of a conflict are its intersection). For a told rule in prose
it is the identifiers and quantities the sentence states; the EARS adapter keeps the sentence and cites it, so the
grain is the sentence's own terms, never a translation.

**Grain of evidence.** For a probe outcome it is the state and event the witness recorded. For a test in the inventory
it is the identifiers it cites plus the symbols its body mentions (`mentions-symbol` already reads the body in all five
languages). For a scenario it is the step table's bound terms. For a committed results file it is the test ids and the
commit it was taken at.

**The comparison.** For a statement S with grain g(S) and the set E of green evidence that cites or sits under S:

```
masked(S)  ⇔  g(S) ⊄ ⋃_{e ∈ E} g(e)
```

The report names the terms in the difference: "R-12 constrains `attempts` and `window`; the three tests citing it
observe `attempts` only." That difference is the input that would close the finding. Where g(e) cannot be read (a test
body CSH cannot parse, an unknown runner), the term set is unknown and the finding is indeterminate, with the file
named.

**Grain on the ladder.** A rung says how strongly a rule is asserted; grain says over what. A rule at L3 with a grain
gap is still L3 and dangerous: the check exists and does not reach the rule's terms. The two axes stay apart, as the
four do.

**Grain per language.** The term set of a test is read as far as the reader goes: TypeScript and Java furthest (types,
enums, `total`), Python and Go by identifiers only. A coarse reading over-reports danger, never under-reports it, and
the report says which reader produced the grain, so a user can see when the finding is the reader's limit rather than
the repository's.

## 5. Closing polyglot

The readers are done; the work is to let every language reach the rules and evidence TypeScript already reaches. In
priority order, by what each unlocks:

| Gap | Change | Unlocks | Languages |
| --- | --- | --- | --- |
| `package` facts are npm-only | `facts-code` writes a `package` fact per Maven module, Go module, Cargo crate and Python distribution; `init --subject` matches nested manifests | `container(...)`, `closed`, `undrawn-dependency`, `unplaced-package`; C4 diagram rules | all four |
| Results readers | pytest `--junitxml` (reads today, needs the join), `cargo nextest --junit`, Surefire phrased names | masked danger from committed results; applicability `stale` | Python, Rust, Java |
| Step definitions | behave, cucumber-jvm, godog, cucumber-rs readers in `adapter-gherkin` | scenarios as a second practice; divergences | all four |
| Manifests | Gradle (Kotlin and Groovy DSL), `requirements.txt`, `setup.cfg`, `module-info.java` | `field` claims, version refutations | Java, Python |
| `inherits` | follow Java interfaces, Rust supertraits, Go embedded structs | base claims, layering by type | Java, Rust, Go |
| Grain readers | test body term sets per language (identifiers mentioned, enum members compared) | masked danger with named terms | all five |
| `total` | `assert_never` under mypy or pyright as a configured prevention; Go `exhaustive` lint output as a fact | L5 in Python and Go, only when the repository runs the checker | Python, Go |
| Collection | pytest `python_functions`, JUnit composed annotations, `#[test_case]`, camel-case citations | fewer uncited tests that are cited | all four |

Everything lands as facts first, then a claim or check over them, then a fixture per language: the shape stages 29 to
36 used. Doc comments stay Markdown-only for now (Rust `///` and `package-info.java` are a later Documents source).

**Docs that disagree with the code**, fixed in the same stages: README.md Limits (the stage 30 sentence on skipped
facts and TS-only imports), `docs/guides/architecture-rules.md` Limits, `packages/facts-code/README.md` on Java nested
types, spec 12 §3 on Go local imports, README's "one test runner". The iron triangle holds only when these say what the
fixtures prove.

## 6. Stages

Six stages from hand-written profiles to a cold analysis of any repository, each gated by its fixtures:

| Stage | Name | Exit | Gate |
| --- | --- | --- | --- |
| 55 | Analyse command | One zero-config command lifts rules from the repo's own words; GnuPG optional | F160: cold run on go-clean-arch, no profile |
| 56 | Danger view | Refuted and masked, a view across the three outcomes, reported first, never scored | F161 to F164: the lockout regression reads as masked |
| 57 | Grain | Term sets per statement and per test; the difference is named in every finding | F165: the missing terms are named, per language |
| 58 | Polyglot containers | `package` facts from Maven, Go, Cargo, Python; nested manifests proposed by init | F170 to F173: closed and container rules in 4 languages |
| 59 | Evidence per ecosystem | JUnit XML join, nextest, behave, cucumber-jvm, godog steps; inherits over traits | F174 to F178: one masked finding from results, each |
| 60 | Calibrate and ship | Five cold subjects with expected.json; tarball and Action; docs reconciled | No false gap on the corpus; README runs in CI |

Each stage keeps the shape of stages 29 to 54: an exit in one sentence, fixtures that prove it, a stage note, and the
docs it touches. Stage 56 is the one that changes what CSH says; 55 and 57 give it a door and a reason; 58 and 59 let
every language reach it; 60 is where a stranger can run it.

Stage 55 reuses `init --subject`, the adapters and `overview`, so its new code is the command and the lifting of README
layering sentences into told rules. Stage 56 adds the danger selector to `check` and the rendering to `overview` and
`a3`, with the lockout and account walkthroughs re-recorded as its evidence. Stage 57 adds grain to the emitter
(statement terms) and to `adapter-items` (test term sets). Stages 58 and 59 are facts first, then claims, then a
fixture per language. Stage 60 adds the calibration subjects, revisits ADR-32, and makes the README's Limits say what
the fixtures prove.

## 7. Decisions for the owner

Decided in this document: masked danger counts (the point of the tool); danger is a view, not an outcome; nothing is
scored. These remain, numbered to follow Q-47, and are in [QUESTIONS.md](../../QUESTIONS.md):

- **Q-48** Does a danger finding carry its own fragment digest, so it can be waived like a violation, or is it waived
  through the gap or obligation beneath it? Proposed: through what is beneath it; a view never gains authority of its
  own.
- **Q-49** When a test cites a rule but the test body cannot be read (unknown runner, unparsed language), is the
  citation masked or indeterminate? Proposed: indeterminate, naming the file; a reader's limit is never reported as the
  repository's fault.
- **Q-50** Does a told rule lifted from a README by analyse become a candidate in `csh/claims.json` of the profile, or
  stay in the run? Proposed: in the run only, unless `--profile` is given; analyse writes nothing into a subject.
- **Q-51** Distribution: publish to npm under a scope, or a tarball release on GitHub plus an Action? ADR-32 is
  revisited either way. Proposed: a tagged tarball release first, npm when a second maintainer joins.
- **Q-52** Rung claimed above rung established: which prose phrases count as a claim of L3 or above ("tested",
  "enforced", "guaranteed", "cannot")? Proposed: a short list in the EARS adapter's vocabulary, cited never
  translated, extended by fixture.
- **Q-53** Do the three taskboard receivers gain a masked case each, so the paper's violation seeding (Q-45) becomes a
  danger fixture? Proposed: yes, in stage 56.

## 8. Limits

This document changes no semantic contract, no outcome, no axis and no ledger rule. Analyse mode is advisory; a
repository is protected only by the eight steps of the authority runbook, as before.

- Danger is established from what CSH reads. A grain CSH cannot read is indeterminate, not safe; the report says which
  reader produced each grain.
- Masked danger over-reports when a reader is coarse. The remedy is a finer reader, never a lower bar; the calibration
  corpus in stage 60 measures the over-report per language.
- Lifting layering sentences from prose is a reading, so lifted rules never raise a rung (Q-42) and are cited as the
  sentence, never translated to a predicate.
- Predicates stay linear integers, enumerations and booleans over one state per event; temporal obligations stay
  carried and unevaluated.
- Python and Go `total` stay unknown unless the repository runs a checker CSH can read as a fact.
- Doc comments in Rust and Java stay outside the Documents source until a later stage.
- Nothing in this document is approved until the owner approves it; the stages become implementation when their
  questions are decided and the decision is in QUESTIONS.md.

Sources: lgriffin/CSH at PR #77 (12 October 2026): README.md, docs/spec/12, 13, 14 and 15, docs/stages/stage-29 to
stage-54, packages/facts-code, packages/arch, packages/adapter-items, packages/run/src/propose.ts, the eight subject
profiles, ASSUMPTIONS.md and QUESTIONS.md; the formal specification, the anchor design and the next-layers design in
this series.
