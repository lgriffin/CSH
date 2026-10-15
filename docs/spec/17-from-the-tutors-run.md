# 17. What the tutors-mono-repo run asked for

`csh analyse` read [tutors-sdk/tutors-mono-repo](https://github.com/tutors-sdk/tutors-mono-repo) at `1279669` cold, on
15 October 2026. It reported 193 gaps, 1 indeterminate and 0 converged, and marked 20 of the gaps refuted. A check by
hand against the source found all 20 refuted findings and about 190 of the gaps to be false. The few real gaps were
found by reading the repository by hand, not by CSH ([tutors-mono-repo#488](https://github.com/tutors-sdk/tutors-mono-repo/issues/488)).
[Issue 85](https://github.com/lgriffin/CSH/issues/85) lists eight defects, D1 to D8. This document states the
behaviour that stage 61's golden fixtures are written from, one section per defect.

The repository checks itself heavily: dependency-cruiser rules, an EARS audit of its own, Playwright tests bound to
scenarios by title, and shrink-only baseline files of what it knows is still wrong. Every section below teaches CSH to
read one of those conventions as evidence, or stops CSH reading something as a claim that is not one. Nothing here
changes the three outcomes. Where CSH is unsure, a result becomes unchecked or indeterminate, never refuted. A false
refuted finding at the top of the report costs the most trust.

## 1. Rule tags are identifiers (D1)

**The problem.** A Gherkin `Rule:` tagged `@rule-0056` and a Playwright test tagged `{ tag: "@rule-0056" }` name the
same rule. The test's tag is upper-cased to `RULE-0056` (A-152). With no `idTag` proposed, the Rule's identifier was
a slug of its title, so the citation resolved to nothing and read as refuted danger.

**What changes.**

- **Fixtures do not decide the guess.** The proposal's `idTag` guess requires each tag of a family to name exactly
  one Rule or Scenario. Feature files under a `fixtures` or `__fixtures__` directory, or under a dot-directory, are no
  longer read for that guess (see section 3), so a fixture that repeats a tag on purpose no longer defeats it.
- **Case-insensitive resolution.** An identifier that names no item exactly resolves to the one item whose identifier
  matches it when case is ignored, when exactly one does (A-204). `RULE-0056` resolves to the Rule `rule-0056`. When
  two items differ only in case, nothing is guessed and the reference stays as it was.

## 2. Scenarios bound by a test's title (D2)

**The problem.** A scenario can be proved by a test that carries its title, not by step definitions. tutors-mono-repo
does this for every `@ui` Rule: "one test per scenario, titled and tagged to match". CSH matched each of those
scenarios' steps against the step definitions of other features, and reported 94 scenarios as undefined steps.

**What changes.**

- A test file item records the literal titles of the tests it declares: attribute `titles`, one per line, in
  TypeScript and JavaScript.
- A scenario whose title equals one of those titles, after trimming, is bound by that test. Its steps are not matched
  against step definitions, so they can be neither an `undefined-step` nor `steps-undecided` gap. The scenario is
  checked by the test file for its rung, as a citation would make it (A-205).
- A scenario no test names by title is matched against step definitions as before.

## 3. Test fixtures are not features (D3)

**The problem.** `tests/suite-health/fixtures/**.feature` are deliberately broken inputs for the subject's own audit.
CSH read them as the subject's features, and they produced 34 false gaps.

**What changes.** The proposed `Features` source excludes `**/fixtures/**`, `**/__fixtures__/**` and files under a
dot-directory, as the `Tests` and `Code` sources already do. The guess says so (A-206).

## 4. Matching follows the step library (D4, D5)

**The problem.** The subject uses `@amiceli/vitest-cucumber`, which is not cucumber-js:

- In vitest-cucumber, `/` is literal. Read as Cucumber Expression alternation, a definition
  `the SLO file committed at release/slo.yaml` failed to match the identical step.
- A `ScenarioOutline` is defined with the outline's own step text, placeholders included
  (`generator "<release>" wrote`). CSH expanded the Examples first and then matched only the expanded text.
- A step's text held in a `const` in the same file (`const seedStep = "…"; Given(seedStep, …)`) was not read at all.

**What changes.**

- **The library decides the dialect.** A step definition file that imports `@amiceli/vitest-cucumber` has its string
  definitions read in that library's dialect (A-207):
  - `{string}` matches a quoted string; `{int}`, `{float}` and `{number}` match a number; `{boolean}` matches `true`
    or `false`; `{word}` matches a run with no white space; `{char}` matches one character.
  - Any other `{name}` (`{any}`, `{list}`, `{date}` and so on) matches anything.
  - Every other character is literal: `/`, parentheses and `<name>` included.
- **Outline steps match unexpanded too.** A scenario outline's step is matched when a definition matches either its
  expanded text (one per row of its examples, as now) or its text as written, with its `<placeholders>` (A-208). This
  holds in every dialect. A cucumber-js definition that names a placeholder literally is rare, and it is what such a
  definition means.
- **A literal is read as its value.** A step string's escapes are read as JavaScript reads them: `'the course\'s'` is
  `the course's`.
- **A const step text is read.** When a step function's first argument is a bare name, and the same file declares
  `const <name> = "<literal>"` or `'…'` with no interpolation, the definition is that literal (A-209). Any other name
  is a definition CSH cannot read, which makes the steps it could match undecided.

## 5. File mentions that are not claims about this tree (D6)

**The problem.** Ten prose lines were reported as refuted danger, naming files that do not exist. None of them claimed
those files exist in this tree:

- placeholders with an ellipsis (`tests/bdd/steps/...`);
- a path relative to the document's own directory (`apps/reader/README.md` naming `tests/e2e/`);
- a path in another repository ("`scripts/fetch-migrations.sh` in tutors-sdk/tutors-release-harness");
- a branch name (`release/16.3.0`);
- a file the sentence says is absent ("which was retired whole", "none is committed", "delete any leftover files such
  as `apps/reader/.env`").

**What changes** (A-210):

- **Not paths.** A backticked token with a segment of three or more dots, or that ends in `...` or `…`, is not a path.
  Neither is a token whose last segment is a version, such as `16.3.0` or `v16.2.2`.
- **Relative paths.** A mentioned path that names nothing from the repository root is resolved from the directory of
  the file that mentions it. It names a file when it resolves there.
- **Another repository.** The sentence a path is mentioned in is read. If the sentence names another repository, the
  path is unchecked: neither a gap nor evidence. A sentence names another repository when it holds an `owner/repo`
  token (backticked or not, exactly two segments, no file extension, not a MIME type) whose first segment is not a
  top-level entry of this repository.
- **Sentences, not lines.** A sentence is read whole, even when it runs over a line break in its paragraph.
- **Absence.** A path mentioned in a sentence that says it is absent is unchecked when it names nothing. Such a
  sentence holds `retired`, `removed`, `deleted`, `delete`, `no longer`, `leftover`, `optional`, `none is`,
  `formerly`, `used to` or `absent`. When the file does exist, the mention is read as any other.

## 6. Mechanisms the repository names, and the gaps it records (D7)

**The problem.** Three things were missed:

- Told rules naming their own mechanism were reported as naming none. `guides/SHARED-TYPES.md:4` names the
  `tutors-types-self-contained` dependency-cruiser rule.
- The dependency-cruiser configuration that enforces the layering was not read.
- The repository's shrink-only baseline files, which record the violations it already knows about, were not read.

**What changes.**

- **A dependency-cruiser configuration is read.** A tracked `.dependency-cruiser.cjs`, `.js`, `.mjs` or `.json` at any
  depth joins the proposed `Documents` source. The guess names it. The Markdown adapter reads each `name: "…"` of the
  file's text as a check the configuration defines. It reads the text and never runs it.
- **A told rule can name its check.** A told rule that names one of those checks in backticks is verified by the
  configuration file: a `verified-by` edge to it. It is checked, at L3, and is not `unverified` (A-211).
- **Baselines are read.** A tracked `.txt` file at any depth is a baseline when one of the comment lines (`#`) before
  its first entry says the file "may only shrink". The proposal reads each one in a source `Baselines` of the
  documents practice, apart from `Documents` because baselines usually sit in test directories, which `Documents`
  leaves out. A baseline is an item
  whose entries are its other lines that are not blank. A baseline with entries is a gap, `baselined`: the repository
  records them as known and still open. The gap's detail gives the count and the first five entries, and its next step
  is to shrink the file. An empty baseline is no gap (A-212).

## 7. Specification prose in Gherkin (D8)

**The problem.** `guides/specifications/*.md` hold about 43 scenarios in fenced `gherkin` blocks, marked
"specification prose, not executed". These are specified behaviour that nothing runs, which is exactly a gap. CSH read
fenced blocks as code and said nothing.

**What changes.** A Markdown file read with told sentences may say, in its prose outside fences and headings, that its
scenarios are "not executed", "specification prose", or "are not run". In such a file, each `Scenario:`,
`Scenario Outline:` or `Example:` line inside a fence whose info string is `gherkin` or `feature` is a requirement item
of its own (A-213). Elsewhere a gherkin fence is an example of the form, such as one in a guide to writing features,
and is not read:

- its identifier is `<file>#<slug of its title>`, its text is its title, and it carries `gherkin: prose`;
- like any requirement, it is `unverified` when nothing verifies it and no test cites it;
- a test file whose title equals the scenario's title cites it, as in section 2.

## 8. Limits kept

These stay as they are, each recorded:

- **Told-rule lifting reads words, not meaning.** It still lifts some dependency sentences that are about data or
  tools rather than code, such as "Edits in the collaboration room are independent of the source `.excalidraw` file"
  ([Q-57](../../QUESTIONS.md)). A narrower vocabulary would drop sentences the stage 60 calibration showed to be true,
  such as "Independent of Database."
- **A rule named in prose as "Rule 0130"** does not cite `rule-0130`: only an identifier as the identifier pattern
  writes it does.
- **Claims about runtime behaviour** stay unread, such as "Only `@tutors/realtime-supabase` drives Supabase Realtime
  channels", which the whiteboard's static HTML breaks. They need a reading of what code calls, not what it imports.
- **dependency-cruiser rules are not translated.** CSH does not check them itself. They are mechanisms the repository
  names, and the report says so.

## 9. Stage 61

**Exit:** fixtures F179 to F183 pass, written from this document before the code. Every subject in CI still meets
both its expected results and its `analysis-expected.json`. A cold read of tutors-mono-repo at `1279669` reports none
of the false findings of issue 85, and reports the baselined, unverified and specification-prose gaps of
tutors-mono-repo#488.

- F179: rule tags and fixtures (sections 1 and 3), and scenarios bound by title (section 2).
- F180: vitest-cucumber matching, outline templates and a const step text (section 4).
- F181: file mentions (section 5).
- F182: a dependency-cruiser check named by a told rule, and a baseline (section 6).
- F183: specification prose in Gherkin (section 7).
