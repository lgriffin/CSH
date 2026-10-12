# 15. The Assertion Ladder

[The Assertion Ladder](https://github.com/lgriffin/AI-Reference-Projects/tree/master/paper) (Griffin, Power, Carroll,
Dunphy, Taylor and de Leastar, submitted to the *Journal of Object Technology* on 2 October 2026) grades how strongly a
repository asserts each of its domain rules, from a rule that is only implied to one that cannot be written wrongly:

| Rung | Name | The rule is |
| --- | --- | --- |
| L0 | Implied | in someone's head, or a habit |
| L1 | Shown | embodied by one worked example, a vertical slice |
| L2 | Told | stated in prose the contributor reads |
| L3 | Checked | enforced by an executable check that fails the build |
| L4 | Explained | enforced by a check whose failure names the rule, the offender and the fix |
| L5 | Prevented | unrepresentable: the wrong form does not compile |

The paper prescribes: place each rule on a rung on purpose, high enough to cover its risk and no higher. CSH is a
static analysis tool that reports, for what a repository asserts, what converges, what is a gap, and what it cannot
decide. This document brings the ladder into CSH as a second axis beside that outcome, without changing the outcome.

## 1. Two axes

- **The outcome** stays what CSH is for: every rule, claim and trace lands converged, gap or indeterminate, with what
  would move it ([11](11-ingesting-a-codebase.md), stage 27). Nothing in this document adds a fourth outcome, and
  nothing here changes which outcome any result lands in.
- **The rung** says how strongly the repository asserts a told rule: the highest rung CSH can establish from the
  evidence it reads. It is a floor, never a guess: where CSH cannot see a mechanism (a test's failure message, a
  linter's configuration), the rung stays at what it can see.

A rule can be well asserted and wrong (L3, and a failing test: a gap), or weakly asserted and right (L2, and nothing
contradicts it). The two together say what a reviewer most needs: which rules hold, and which rules nothing would stop
an agent from breaking.

**What counts towards a rung.** Only a mechanism that stops a wrong change in the repository itself: its own tests and
scenarios, its own compiler, and the obligations of its own CSH specification that a person has approved, since the
enforcing gate stops a change that breaks one ([10](10-next-layers.md)). A candidate obligation, and every rule of a
subject profile, is CSH's reading of the repository, not the repository's own assertion, and never raises a rung.

## 2. Names

The word *ladder* means the Assertion Ladder, and *rung* means one of its six levels. The root README's former "ladder"
of seven things to add (inventory to A3) is renamed **adoption steps**; [09](09-anchor-harness-a3.md), section 10.2, and
[11](11-ingesting-a-codebase.md) keep their wording as written, and read "ladder" there as "adoption steps".

## 3. Rungs per rule (stage 47)

A **told rule** is an item of kind `requirement`, `rule` or `property`, the kinds trace already holds to verification
([11](11-ingesting-a-codebase.md), stage 22), or an item with no kind: a sentence the EARS adapter read. Each told rule is given exactly one rung, the highest whose condition
holds:

- **L5 Prevented**: a structural claim `total(...)` (section 4) that holds cites the rule. The claim may be a
  candidate: what it establishes is the repository's own compiler, which stops the change whoever wrote the claim.
- **L4 Explained**: an approved obligation of the specification that the run assessed (an architecture rule, a
  structural claim, an invariant or a requirement of the model) cites the rule. A violation of it names the rule, the
  offender with its file and line, and what would close it, and the enforcing gate stops on it.
- **L3 Checked**: a test file cites the rule; or a scenario sits under it (a rule) or cites it; or what its
  "Verified by" names resolves to a file, a script or an item; or an example in the pool cites it.
- **L2 Told**: none of the above. Such a rule is also a gap that says what would close it: `unverified`, or `uncited`
  for an EARS sentence, or `dangling-reference` when what its "Verified by" names does not exist.

Each rung carries the mechanisms that establish it, each with the rung it supports, so a reader sees *why* a rule is
L3 and what would take it to L4 or L5.

L0 and L1 are not assigned. A rule at L0 is by definition not in the repository; what CSH can see of one is behaviour
with no rule behind it, which is already the gap `no-rule`, or a test that cites nothing. L1 is a worked slice: a
shape, not one rule's evidence.

## 4. Prevention: the `total` claim (stage 48)

`total(module, symbol, over)` is a structural claim ([11](11-ingesting-a-codebase.md), stage 24): the declaration
`symbol` of `module` maps every member of the closed type `over`, in a construct the language's compiler checks for
completeness, so that adding a member to `over` without mapping it does not compile. It is judged from facts alone.
Nothing is compiled.

The facts gain two optional fields on a `declare` fact, so `csh-facts/v2` keeps its shape:

- `members`: for a closed type, its members, in source order;
- `total`: the closed types this declaration maps completely in a compiler-checked construct, by name as written.

| Language | Closed type (`members`) | Complete mapping (`total`) | Compiler |
| --- | --- | --- | --- |
| TypeScript | a type alias that is a union of string or number literal types; an `enum` | a `const` annotated `Record<K, V>` (also inside `Readonly<...>`), or initialised with `satisfies Record<K, V>`, where `K` names a closed type | `tsc` |
| Java | an `enum` (its constants); a `sealed` class or interface (its `permits` list, else the classes nested in it that extend it) | a top-level type with a `switch` that has no `default` and whose labels name every member of one closed type: type patterns for a sealed type, constants for an enum. Old-style enum switch statements count only when they use arrows and are used as an expression | `javac` |
| Rust | an `enum` (its variants) | a top-level `fn`, or the type of an `impl` block declared in the same module, with a `match` that has no wildcard or binding arm and whose arms name every variant of one enum as `Enum::Variant` | `rustc` |
| Python | none recorded | none recorded | none: the claim is unknown, `no-compiler: python` |
| Go | none: Go has no closed types | none | none: the claim is unknown, `no-closed-types: go` |

The claim holds when the declaration's `total` names `over` and a closed type `over` is declared among the facts read;
it is refuted when the module was read, and the declaration is absent or maps no such type; it is unknown when the
module, or the type `over`, was not read, or the module's language has no such compiler. A refuted `total` claim is a
`fact-conflict` like any refuted claim: the gap says the prose (or profile) names a prevention the code does not have.

## 5. Told: instruction files and two-part identifiers (stage 49)

- **Instruction files.** `csh init --subject` proposes the files an agent reads at the start of every session
  (`AGENTS.md`, `CLAUDE.md` and `GEMINI.md` anywhere in the tree, and `.github/copilot-instructions.md`) as their own
  source, `Instructions`, of kind `Documents`, in a practice of the new kind `instructions`. They are read as every
  document is: the files, symbols and scripts they name resolve or are gaps, and lines naming code changed since are
  stale prose. This is the paper's gap G2 (instruction files are prose with no link to enforcement) made visible, one
  line at a time.
- **Two-part identifiers.** In the Markdown and Gherkin files, a token `X-YYY-n` (one to five capitals, a hyphen, two
  to eight capitals, a hyphen, digits, such as `R-FLOW-1`) is a two-part identifier, counted before one-part tokens
  so that `FLOW-1` inside it is not counted again. Its family is `X-` with any second part, written `X-[A-Z]+` in the
  identifier pattern, and it is a family under the same rules as before (two different identifiers, not a well-known
  external prefix).

## 6. Output

- **Report.** `rungs`: one entry per told rule, `{ item, rung, by }`, where `by` lists each mechanism with the rung
  it supports. Present when the run read a told rule.
- **Overview.** `ladder`: the count of told rules at each rung; `rungs`: each told rule's rung; and `rung` on each
  entry whose subject is a told rule. The text adds one line after the counts:
  `Assertion Ladder: N told (L2), N checked (L3), N explained (L4), N prevented (L5)`; the HTML sheet shows the same
  counts and the rung beside each entry.
- **`csh ladder [--run <dir|commit>] [--json]`.** Every told rule, weakest first, with its rung, the mechanisms that
  establish it, and the kinds of the overview entries about it. It decides nothing new; it reads the report.
- **Expected results.** A profile's `expected.json` may hold `rungs`, a map from told rule to rung; `csh expect`
  reports each rung that differs as a mismatch.

## 7. The taskboard profiles (stage 50)

The paper's greenfield receivers, `taskboard` in TypeScript, Java and Python (repository
[AI-Reference-Projects](https://github.com/lgriffin/AI-Reference-Projects), directories `typescript`, `java` and
`python`), are three subjects with known answers. Each profile pins the same commit, reads the receiver's
`REQUIREMENTS.md`, `AGENTS.md`, tests and code, states the layer table of `AGENTS.md` ("Where things go") as
architecture rules, and states the receiver's prevention of an unmapped error (the paper's V6) as a `total` claim
citing `R-ERR-1`. The expected results are written from the paper and the receivers' documents before the first run:

- every rule of `REQUIREMENTS.md` is at least L3, since each receiver's requirement check makes every rule have a
  scenario (the paper, Table 2 and seeds V13 and V14);
- `R-ERR-1` is L5 in TypeScript and Java, where V6 is caught by the compiler, and stays L3 in Python, where the
  `total` claim is unknown (`no-compiler: python`) and V6 is caught by an architecture rule;
- the layer rules converge, since the receivers' gate is green.

CSH copies none of the subject's text; each rule cites the file and line it reads. The repository states no licence.

## 8. Not decided by CSH

Each was a question, not a guess: [QUESTIONS.md](../../QUESTIONS.md), Q-42 to Q-47. The owner decided all six on 12 October
2026 as built: none of them is read or counted.

- Whether a subject's own check *explains* its failure (L4 for a test): the failure text is not read statically.
- Fading: whether prose restates a rule a check already enforces cannot be told from text without reading meaning.
- The paper's violation seeding needs the subject run and mutated; CSH reads, and does not run.
- EARS as a placement oracle (the paper, Table 4) is a hypothesis in the paper, not a rule CSH can assert.
- TypeScript exhaustive `switch` checks through `never`, and type checkers for Python, are not read.
- Whether a subject profile's own rules should raise a rung (they do not), and paths that a document in a subdirectory
  writes relative to its own directory.

## 9. Stages

1. **Stage 46: the name.** Spec 15; the README's adoption steps and its Assertion Ladder section; the starter's README;
   [docs/guides/ladder.md](../guides/ladder.md).
2. **Stage 47: rungs.** `rungs` in the report, the overview's `ladder`, `csh ladder`, `rungs` in expected results.
   *Exit:* F150.
3. **Stage 48: prevention.** `total`, `members` and `total` facts in TypeScript, Java and Rust; unknown in Python and
   Go. *Exit:* F151 to F154.
4. **Stage 49: told.** Instruction files, the `instructions` practice and two-part identifiers in
   `csh init --subject`. *Exit:* F155.
5. **Stage 50: the taskboard profiles**, one per receiver language, run in CI against their expected results.
6. **Stage 51: diagrams and the deck.** The C4 diagrams brought up to date, and a Marp deck on what CSH is, how it
   works, how it is designed and what it reports.
