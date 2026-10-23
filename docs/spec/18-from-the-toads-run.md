# 18. What the Toads run asked for

`csh analyse` read [lgriffin/toads](https://github.com/lgriffin/toads) at `6f7256e` cold, on 23 October 2026. Toads is
a guild hub: a FastAPI service, a worker, a Discord bot and a SvelteKit app. Its requirements are 294 Gherkin
scenarios. pytest-bdd binds them, and import-linter enforces its layering. CSH reported 18 gaps, 1 indeterminate and
0 converged, with 10 of the gaps refuted and no item checked.

A check by hand found all 10 refuted findings false, and 4 of the 8 `unverified` told rules false too. The bindings
were checked against pytest's own collection. CSH had read none of the mechanisms Toads uses to check itself. The three
real gaps were found by hand: lgriffin/toads#127, #128 and #129.
[Issue 87](https://github.com/lgriffin/CSH/issues/87) lists the defects, D1 to D5. This document states the behaviour
that stage 62's golden fixtures are written from.

This is the Python counterpart of [17](17-from-the-tutors-run.md). What stage 61 taught CSH to read in a TypeScript
repository that checks itself, this stage teaches it to read in a Python one: how tests bind scenarios, how step
definitions are written, and which configuration enforces the layering. Every language stack is held to the same
standard. Nothing here changes the three outcomes. Where CSH cannot read a binding, the result is indeterminate, never
a gap.

## 1. A file the repository ignores is not missing (D1)

**The problem.** Each refuted finding named a file the operator creates from a template: `config/raid_days.yaml`
beside `config/raid_days.example.yaml`, and `services/api/.env` beside `services/api/.env.example`. The committed
`.gitignore` lists every one of them. Ten documents were reported as prose the code refutes.

**What changes** (A-214). Before tracing, the run asks git which of the missing paths prose names the repository
ignores (`git check-ignore`, with the repository's own ignore files). A missing path the repository ignores is local to
a checkout, so it is unchecked, never dangling. A path that is missing and not ignored is still a dangling reference.
The same holds for a path resolved from the mentioning file's directory.

## 2. pytest-bdd binds scenarios (D2)

**The problem.** pytest-bdd runs a scenario only when a test module binds it. `scenarios("x.feature")` binds every
scenario of a file. `@scenario(file, "title")` binds one, by its title. CSH read neither, so:

- No scenario was bound.
- 14 step-definition modules were said to declare no test, although pytest-bdd generates their tests.
- Two real gaps went unseen. 22 scenarios with no steps are bound by `scenarios()`, so pytest reports them passed
  having checked nothing. One scenario with steps is bound by nothing, so its steps never run.

**What changes** (A-215, A-216). A Python test file that imports `pytest_bdd` is read for its bindings:

- **`scenarios(...)`** binds each feature file one of its string arguments names: a literal ending in `.feature`,
  joined to any other path parts, as `str(FEATURES / "orders.feature")` writes it. A feature file is named when its
  path, or its path from the test file's directory, ends with the literal. An argument with no such literal is
  computed. For a computed call, such as `scenarios(str(FEATURES / f"{name}.feature"))` in a loop, each string literal
  of the file that is the base name of a feature file, with or without `.feature`, names that file.
- **`@scenario(file, title)`** binds the scenario whose title equals the literal title: one string, or adjacent
  strings joined, as Python joins them. The title must be shared by no other scenario. A title that is not a literal
  (`_title(feature, 3)`), and any `scenario(` call whose title is computed, binds by a title CSH cannot read. Every
  feature file a literal of that test file names is then only possibly bound.
- A file that binds a scenario declares tests. It is not reported as declaring none.

What the bindings decide, for each scenario of a `.feature` file, when the Tests source reads a pytest-bdd module:

| The scenario | Signal | Outcome |
|---|---|---|
| Bound, with steps | none: its steps are matched to definitions (section 3) | |
| Bound, with no steps | `stepless-scenario`: the test passes having checked nothing | gap |
| Not bound, and no test file binds its feature by a title CSH cannot read | `unbound-scenario`: says whether it has steps that never run, or none | gap |
| Not bound, in a feature file a test file binds by a title CSH cannot read | `binding-undecided`, naming that file | indeterminate |

Toads computes most of its `@scenario` titles in helpers, so 73 of its scenarios are `binding-undecided`, each naming the file whose helper would decide it ([Q-61](../../QUESTIONS.md)). A scenario's tags are named in the detail, so `@pending` is visible. The repository's own word that a scenario is
pending does not close the gap: the scenario is specified behaviour that nothing checks. This is the same reading as
specification prose ([17](17-from-the-tutors-run.md), section 7).

A pytest-bdd binding is not a title binding in the sense of stage 61 (A-205). A Playwright test titled as a scenario
does the scenario's work itself. A pytest-bdd test runs the scenario's steps. So a bound scenario's steps are still
matched against step definitions, and an unmatched step is still an `undefined-step` gap.

## 3. pytest-bdd step definitions (D2)

**The problem.** pytest-bdd's step decorators were not read. The proposal only sets `style: cucumber` when JavaScript
step files sit beside the features, so behave's and pytest-bdd's definitions were never read in a cold analysis.

**What changes** (A-217).

- **The decorators.** In a Python file that imports `pytest_bdd`, a decorator named `given`, `when`, `then` or `step`,
  as imported from `pytest_bdd` (with `as` aliases followed), is a step definition. Hypothesis's `@given` in another
  file, or in a file that does not import it from pytest_bdd, is not.
- **Plain text.** A literal string argument (adjacent literals joined) is matched exactly. So is
  `parsers.string("…")`.
- **parse and cfparse.** `parsers.parse("…")` and `parsers.cfparse("…")` are read as behave's `parse` format (A-202):
  a `{field}` or `{field:type}` matches anything, and every other character is literal.
- **Regular expressions.** `parsers.re(r"…")` is a regular expression that must match the whole step, as pytest-bdd
  matches it. Python's `(?P<name>…)` and `(?P=name)` are read as their JavaScript forms.
- **Anything else** (a computed pattern, a custom parser) is a definition CSH cannot read, so the steps it could match
  are undecided.
- **The proposal.** When feature files exist and a Python test file imports `pytest_bdd`, the Tests practice gets
  `style: cucumber`. The proposed Tests source also reads each `conftest.py` beside a test file, where pytest-bdd step
  definitions often sit. A behave step file (`**/steps/**/*.py`) beside features is proposed as a step file, as a
  JavaScript one is.

pytest-bdd scopes a step definition to its module and the `conftest.py` files above it. CSH matches a step against
every definition the Tests source reads, as it does for cucumber-js, so a step defined only in another module is not
reported. That can hide an undefined step, never invent one.

## 4. import-linter contracts are mechanisms (D3)

**The problem.** Toads states its layering in 31 import-linter contracts in `pyproject.toml`, and CI runs
`lint-imports`. Three told rules are enforced by those contracts. One names a contract by its name, one names the
module a contract forbids, and one says "an import contract in `pyproject.toml` forbids it". CSH reported all three as
`unverified`. The TypeScript counterpart, a dependency-cruiser check named in backticks, has been read since stage 61
(A-211).

**What changes** (A-218).

- **The configuration.** The import-linter configuration in a tracked `pyproject.toml` (`[tool.importlinter]`), or in
  `.importlinter` or `setup.cfg` (`[importlinter]`), joins each proposed Markdown source, as a dependency-cruiser
  configuration does. Its contracts are read, never run: each one's `name`, `type`, `source_modules` and
  `forbidden_modules` (TOML arrays, or INI lines).
- **When a told rule is verified.** A told rule is verified by the configuration file when its sentence meets one of
  three tests:
  - **By name.** The sentence contains a contract's name up to its first parenthesis or colon, with case and runs of
    white space ignored.
  - **By modules.** The sentence names in backticks a module that a `forbidden` contract forbids, and contains a word of
    one of that contract's source modules. The words are the module's last dotted part split at `_`, less the words of
    the forbidden module. `toads_bot` gives `bot` when `toads_api` is forbidden. A `-` in a backticked name reads as
    `_`, as pip reads it.
  - **By mention.** The sentence says "import contract", "import-linter" or "lint-imports", and names the configuration
    file in backticks.
- **Translation.** CSH does not translate or run the contracts. As with dependency-cruiser, they are mechanisms the
  repository names.

## 5. What a told rule is not (D4)

**The problem.** Four of the eight told rules were not about code dependencies:

- "Anyone else gets "Only that night's officers can import its sign-ups."" quotes a message the bot sends.
- "no later import touches them" and "The import keeps only what the hub uses today" are about a data import.
- "A generic guild site … cannot show that, because it depends on the guild's own analysis" puts its "cannot" in
  another clause.

**What changes** (A-219).

- **A quotation is not read.** Text in double quotes (straight or curly) of three or more words is not read for a
  dependency or a restriction: it is something said, not something stated.
- **"import" as a noun.** "import" right after a determiner or an adjective (`the`, `a`, `an`, `this`, `that`, `each`,
  `every`, `no`, `any`, `its`, `their`, `same`, `later`, `next`, `first`, `last`, `one`) names a data import, not a
  dependency. The exception is when the next word is `contract`, `contracts`, `rule`, `rules`, `boundary`,
  `boundaries`, `linter`, `graph`, `of` or `from`, as in "any import of the global logger". "imports" after such a word is a noun too.
- **A restriction stays in its clause.** The five words before a dependency phrase are cut at the last subordinating
  word (`because`, `since`, `whereas`, `although`, `though`, `so`), so a restriction in the clause before it restricts
  nothing that clause names.

## 6. Limits kept

- **The executions guess** still names vitest or jest only ([Q-60](../../QUESTIONS.md)). Toads runs pytest. A results
  file from pytest is read through `csh results import`, but the proposal does not suggest the command.
- **Prose against a contract.** lgriffin/toads#129 is a sentence that says the API reads through `wcl-store`, while an
  import-linter contract forbids exactly that import. CSH reads the contract as a mechanism for a restricting sentence.
  It does not compare an enabling sentence with it, so this stays a gap found by hand.
- **Access-control prose** such as "the token can act for a member on this one route" stays `unverified` when no test
  cites it, although Toads tests the behaviour. Binding a told rule to a test that does not cite it would be a guess.
- **Identifiers with three parts** such as `REQ-HUB-BANK-001` are proposed as the family `HUB-[A-Z]+`, matching the
  last two parts. That is enough to resolve them, so it is left as it is.

## 7. Stage 62

**Exit:** fixtures F184 to F188 pass, written from this document before the code. Every subject in CI still meets both
its expected results and its `analysis-expected.json`. A cold read of Toads at `6f7256e` reports none of the false
findings of issue 87. It reports the 22 scenarios of lgriffin/toads#127 as `stepless-scenario` gaps. It reports the
scenario of #128 as `binding-undecided`, naming `tests/step_defs/test_hub_identity.py`, whose `@_bind` helper computes
its titles. Every scenario it calls bound or unbound agrees with pytest's collection.

- F184: ignored files (section 1).
- F185: pytest-bdd bindings and what they decide (section 2).
- F186: pytest-bdd step definitions (section 3).
- F187: import-linter contracts (section 4).
- F188: quotations, "import" as a noun, and the clause of a restriction (section 5).
