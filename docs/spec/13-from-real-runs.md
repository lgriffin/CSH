# 13. What real runs asked for

Leigh ran CSH over six TypeScript repositories (astrorepo, iomha, tutors-mono-repo, tutors-release-harness, hermes and
ESI.ts) as a diagnostic of CSH itself, and wrote up what remains in
[issue 66](https://github.com/lgriffin/CSH/issues/66). This document turns that issue into stages 38 to 44, in the
issue's suggested order. Each section states the behaviour that a stage's golden fixtures are written from. Where the
issue leaves a choice open, the choice taken is named here and recorded in `ASSUMPTIONS.md`.

Nothing here changes the outcome CSH reports: every rule, claim and trace still lands converged, gap or
indeterminate, and what CSH cannot read is said, never silently passed.

## 1. Proposing a profile (stage 38)

Every profile in the runs was written by hand after surveying the repository, and the first run of each was wrong in
the same few ways. `csh init --subject <dir>` proposes one.

### 1.1 What it reads

`<dir>` is a git checkout of the subject. Only its tracked files are read (`git ls-files`), so what a profile could
read and what `csh coverage` counts are the same list. A path with a segment `node_modules`, `dist`, `build`, `out`,
`coverage`, `vendor` or `target` is never proposed for any source.

### 1.2 What it proposes

Plain `csh init` guesses nothing (P10). `csh init --subject` guesses, and so every guess is elevated: it is printed
with what it was read from, and nothing is written over an existing `csh/component.json`. The manifest it writes is a
`csh-component/v2` manifest with no specification, so `csh run` reads it with no model.

- **Subject.** `repo` is the checkout's `origin` remote; with no remote it is the checkout's absolute path, and the guess says the
  manifest is then not portable. `commit` is the checkout's `HEAD`.
- **Identifier pattern.** In the Markdown and Gherkin files, every token `[A-Z]{2,5}-[0-9]+` is counted by its prefix.
  A prefix is an identifier family when it names at least two different identifiers and is not a well-known external
  one (`UTF`, `SHA`, `ISO`, `RFC`, `CVE`, `AES`, `RSA`, `TLS`, `SSL`, `HTTP`, `ES`, `ECMA`, `PEP`, `JSR`, `GPL`, `LGPL`,
  `AGPL`, `MIT`, `BSD`, `CC`). The pattern is `(?:A|B|...)-[0-9]+` over the families, most frequent first, every
  family named; the printed guess lists the first eight. With no family, no pattern is proposed and each adapter keeps its default.
- **Requirements.** A Markdown file with a heading that begins with an identifier is a requirements document. They
  form a `Requirements` source of kind `Documents`, read by `@csh/adapter-items/markdown`, in a practice of kind
  `requirements`.
- **Documents.** Every other Markdown file, except a changelog (`CHANGELOG*`, `HISTORY*`) and files in test
  directories, forms a `Documents` source in a practice of kind `documents`.
- **Features.** Every `.feature` file forms a `Features` source in a practice of kind `scenarios`. Tags are read by
  family (`@` then letters, a hyphen and digits, compared without case):
    - a family whose identifiers each tag exactly one Rule or Scenario, and which is not an identifier family of the
      documents, is the rules' own identifier: `idTag`;
    - a tag family that is an identifier family of the documents cites: `tagCites`.
- **Tests.** A file named by a runner's convention (`*.test.*` and `*.spec.*` in TypeScript and JavaScript,
  `test_*.py` and `*_test.py`, `*Test.java` and `*Tests.java`, `*_test.go`, and `.rs` files under a `tests`
  directory) forms a `Tests` source of kind `TestFiles` in a practice of kind `tests`, one include glob per convention
  found. A test-named file under a `fixtures` or `__fixtures__` directory is excluded. Where the repository holds
  `.feature` files and step definition files (TypeScript or JavaScript under a `step_definitions` or `steps`
  directory, or named `*.steps.*`), the step definitions join the `Tests` source and the practice is `style: cucumber`.
- **Code.** Files in a language CSH reads (section 3 of [12](12-polyglot-code.md)) that are not tests or step
  definitions form a `Code` source in a practice of kind `facts`, as one include glob per top-level directory and
  extension (`src/**/*.ts`), plus the language manifests at the root (`package.json`, `pyproject.toml`, `pom.xml`,
  `go.mod`, `Cargo.toml`). `implementation` is those top-level directories.
- **Issues.** A tracked `.beads/issues.jsonl` forms an `Issues` source in a practice of kind `issues`.
- **Results.** When a `package.json` names `vitest` or `jest` among its dependencies, the tests practice gets
  `executions: "csh/results.json"`, and the output gives the commands that produce it: the runner with its JSON
  reporter, then `csh results import`.

The identifier pattern, when there is one, is the `idPattern` setting of the requirements, documents, tests and issues
practices.

### 1.3 What it prints

The manifest it wrote, then each guess on its own line with what it was read from, then the coverage of the proposal
as `csh coverage` prints it, so the files no source reads are listed before the first run.

### 1.4 Coverage in every run

`csh run` adds one line after its counts: `coverage: N of M tracked files read; csh coverage lists the rest`, or
`coverage: all M tracked files read`. It is left out when the run is of another commit (`--at`), the source root is
not a git repository, or the component manifest declares no sources (a specification that declares its own sources is
not counted, and would read as nothing read; stage 43).

## 2. Rules that can be stated (stage 39)

Each form below is judged, like every rule, only over facts current at the commit, and lands violated, satisfied or
unknown.

- **`reaches`.** `forbid(a, b, { reaches: true })` is violated when a module of `a` reaches a module or package of `b`
  through a chain of one or more dependencies, each a dependency the facts hold. Each violation names its chain, one
  dependency per step with its file and line, shortest chain first. A chain through a module that could not be read
  cannot be followed: when such a module is reachable and nothing is violated, the rule is unknown (`not-read`).
- **Value imports.** `modules(globs, { values: true })` selects the same modules, and when it is the subject of a rule
  (the first argument of `forbid` or `only`, or of `acyclic`), a dependency that imports types alone does not count.
  With `reaches`, no step of a chain may be type-only.
- **Cycles.** `acyclic(sel)` is violated by each cycle of dependencies among the modules `sel` selects, named by its
  dependencies. `acyclic(sel, { group: "packages/*" })` groups each module under the directory the glob matches at
  the start of its path (`packages/a/src/x.ts` is in `packages/a`): a dependency between two groups is an edge, and
  only a cycle between groups counts. A module the glob does not match is in no group and makes no edge. Each cycle is
  reported once, starting from its least member in code point order. A relative import that crosses a workspace
  boundary is not stated: the facts keep where an import resolves, not how it was written.
- **Counts over modules.** `count(modules(globs), n)` is a claim that the selector selects exactly `n` modules read, so
  a sentence such as "ten use cases" is checked against the files. A file the selector matches that could not be
  read leaves it unknown. Two such claims over the same selector with different counts are a claim-conflict.
- **Manifest fields.** `packageManager`, `dependencies`, `devDependencies` and `workspaces` of a `package.json` are
  fields, beside those read before (`/dependencies/zod`, `/workspaces/0`), so a claim about a pinned tool version or a
  workspace list is decided, and `count("package.json", "/workspaces", n)` counts the workspace globs.
- **A target that selects nothing.** A `forbid` whose target selects no module, package or dependency the facts know
  still holds, since nothing can depend on what is not there, and its assessment carries the reason
  `target-selects-nothing` naming the selector, so a mistyped path is visible while a package that is legitimately
  absent is not an error.

## 3. Speed (stage 40)

Nothing here changes what a run reports; it changes what a run asks git and how many processes it starts.

- `csh run` loads the project once, not once for the command and again for the run.
- A subject checkout that `csh subject fetch` made is not walked for ignored files on each command: only `csh subject
  fetch` and a checkout named by `--subject` are asked in full. In its place, a file a source would read from a
  subject that the subject's commit does not track (an ignored or untracked file) is left out of the run and reported
  as the warning `untracked-file`, so it can never enter a run unseen.
- The tool's own adapters for one run share one isolated process, run in turn. A project's own adapter, and one handed
  a step table, keep their own. One adapter's failure is reported as its own; when the shared process fails as a
  whole, each adapter is run again alone.
- The history cache keeps, beside blame, the commits that changed each file and whether a path was ever held, so a
  warm run asks git almost nothing.
- Prefetching resolves a bare file name to the one tracked file of that name, as trace does, so it is asked for with
  the others rather than one at a time later.
- `csh history` makes each release's checkout a `git worktree` of the pinned checkout, so the subject is cloned once
  however many tags are read.

## 4. Cross-platform correctness (stage 41)

- Text artefacts are hashed with their line endings normalised to LF, so a Windows checkout and CI agree on the A3
  `judgmentsDigest`.
- `.gitattributes` sets `eol=lf` for fixtures, READMEs and A3 sheets, and CI runs on `windows-latest` as well.
- When `--root` is outside the working tree the sandbox error names the path and says the root must be inside the
  current directory.
- `core.longpaths` is set for every `git worktree` and `checkout` CSH runs, as it is for `clone`.

## 5. Traceability past the file (stage 42)

Each form below adds items, edges or results; what they resolve to, or fail to, lands as every edge does: converged,
a gap, or not decided.

- **Tag options.** A `test`, `it` or `describe` call (Playwright's `test.describe` among them) whose second argument is
  an object literal with a `tag` of one string or an array of strings cites each identifier its tags name, as a title
  does. A tag is matched as written and, when that finds nothing, upper-cased, so `@rule-0001` cites `RULE-0001` where
  the pattern is upper case. A `test.describe` call is a describe, not a test.
- **Cucumber and Playwright reports.** `csh results import` and a practice's `executions` read cucumber-js JSON (an
  array of features with `uri` and `elements`) and Playwright JSON (an object with `suites`).
    - cucumber-js: each scenario of each feature is one result in the feature's file. Its name is the feature's name,
      the scenario's name and its tags, so a tag cites. Its outcome is failed when a step failed, skipped when a step
      was skipped, pending or undefined and none failed, errored when a step was ambiguous, and passed otherwise. A
      background is not a result.
    - Playwright: each test of each spec is one result in the spec's file, read from the directory the report names
      as `config.rootDir`. Its name is the titles of the suites around it, the spec's title and its tags. `expected`
      and `flaky` are passed, `unexpected` is failed, `skipped` is skipped.
    - A scenarios practice joins results too: a result in a feature file joins that feature, and its citations resolve
      as a test's do.
- **Steps and the features they load.** In a test file a scenarios practice can read (`style: cucumber`), a call
  `loadFeature("path")` links the file to the feature at that path: from the repository root, or from the file's own
  directory when the path begins with `../`. A path that names no feature item is a dangling reference. Such a file's
  `given`, `when`, `then`, `and` and `but` calls are step definitions as well as the capitalised ones.
- **Steps matched to definitions.** When a run reads both scenario steps and step definitions, each step of each
  scenario (its background's steps first, an outline's once per row of its examples) is matched against every
  definition: a string is a Cucumber expression (`{int}`, `{float}`, `{word}`, `{string}`, `{}`, optional `(text)`,
  alternatives `a/b`), and a regular expression is itself.
    - A step no definition matches is an `undefined-step` gap of its scenario.
    - A definition no step matches is an `unused-step-definition` gap of its file.
    - A definition CSH cannot read (a template with `${}`, a regular expression it cannot compile) could match any
      step: then no step is undefined, and each step no readable definition matches is listed in a `steps-undecided`
      gap of its scenario, naming the unreadable definitions.
- **Decisions in descriptions.** A scenarios practice's `decisionsField` names description lines, such as
  `Decisions|Specified by`. A line of a feature's or rule's description that begins with one of them and a colon
  links that feature or rule, by a `decided-by` edge, to each identifier the practice's identifier pattern finds in
  the rest of the line, and to each path in it that ends in `.md`.
- **Feature identity by path.** A scenarios practice's `fileId` is a pattern over a feature file's path whose first
  group is the file's identity (`(?:^|/)([0-9]{4})-[^/]*\.feature$`). Each feature item keeps it as `fileId`, and two
  files with the same identity are the warning `duplicate-file-id`, naming both.
- **Decisions do not verify.** A rule or requirement that nothing verifies stays `unverified` when it is linked to a
  decision; the gap's detail names the decision as cited and not verified.

## 6. Output (stage 43)

- **Errors and warnings apart.** The run summary's count of report problems reads `N errors, M warnings`, with
  `K notes` when any is of severity info, never `errors` for all of them.
- **Claims as sentences.** For each claim the facts refute (`fact-conflict`) and each pair of claims that disagree
  (`claim-conflict`), `csh run` prints the finding's reason, which holds what the claim says and the fact that
  decides it, and the line of the source tree at each span the reason names (`docs/x.md:12 says: "..."`), up to five
  findings, then how many more. `csh check` prints the same line under each such finding.
- **A3 problems by kind.** When a sheet has more than ten problems with its judgments, `csh a3 build` and
  `csh history` count them by kind, with the first two of each kind; `a3.md` and `a3.html` still list each.
- **Placeholders.** The Markdown adapter's `placeholders` setting is one pattern; a backticked token that matches it
  whole is an example, and names no file.
- **Volatile files.** `history.volatile` lists path globs of files that change all the time; prose that names one is
  never `stale-prose` because of its changes.

## 7. Process and safety (stage 44)

Each is a warning: nothing is refused, since the profile is its owner's to keep or commit.

- `csh subject fetch` asks `gh repo view <owner>/<name> --json visibility` when the subject is a GitHub repository and
  `gh` is installed; a subject that is `PRIVATE` or `INTERNAL` is the warning that its profile should not be committed
  to a public repository. When `gh` is missing or cannot answer, nothing is said.
- When `subject.repo` names a path (no URL scheme and not `user@host:path`) and `csh/component.json` is tracked in the
  component's repository, `csh subject fetch` and `csh run` warn that the profile works only on this machine.
- The manifest guide documents keeping a local profile out of git with `.git/info/exclude`.

## 8. The second round (stage 46)

Leigh re-ran the six repositories on Windows after stages 38 to 44. These are the problems that still showed:

- `csh init --subject`, and every run of a subject, walks only directories that hold a tracked file. Before this, a
  working checkout's `node_modules` was walked in full, which on the three largest repositories never finished, and a
  link that loops there crashed the walk.
- A claim's sentence is the line that holds what the claim states. When the span names the first line of a table or
  list, the line shown is the first one below it, before a blank line, that holds one of the claim's numbers or
  versions, matched whole. The line's own `path:line` is printed.
- The run's coverage line names the three largest unread kinds.
- A subject named by a local path is asked for its checkout's `origin`. A GitHub origin is checked for visibility like
  a URL subject.
- `undefined-step` and `unused-step-definition` are gaps, each with what would close it. `steps-undecided` is
  indeterminate and says to check it by hand.
- `csh init --subject` names every identifier prefix in the pattern, however many; a shape such as
  `[A-Z]{2,4}-[0-9]{3}` would also match `UTF-8` and `RFC-2119`. The guess lists the first eight. It takes no test or step definition under a `fixtures` directory or a
  dot-directory.
- `csh init --subject` proposes nothing under `.venv`, `venv`, `site-packages` or `__pycache__`, even when they are
  tracked.
- `csh subject fetch` retries the final move of a fresh checkout for a few seconds while Windows reports the files
  busy. If the move still fails, the fetch fails with that reason and leaves nothing half-moved.

## 9. The third round (stage 53)

Leigh's re-check of stage 46 on Windows found these:

- A claim finding's headline cites the line shown below it. When the line holding the claim's value is below the
  span, both the headline and the sentence cite that line.
- A value is stated by a line that has it in digits, or, for a version, without its trailing zeros (`18.0.0` as `18`),
  or, for a whole number from 2 to 20, as a word (`13` as `thirteen`). Before this, a row holding 13 further down
  was cited over the line that says "thirteen".
- When no line from the span to the next blank line states the claim's value, which is how a count of a list's
  entries reads, the span's line is shown with `(no line from here to the next blank line states 5)` in place of
  `says`.
- A negated claim reads `it is false that ...`, and a claim conflict reads `one says ..., the other says ...`.
- `csh subject fetch` records the visibility GitHub gives in `.csh-cache/subject-visibility.json`. `csh run` warns
  about a private or internal subject from that record, never asking GitHub, and only while `csh/component.json` is
  tracked, which is when committing would publish the profile.
- On Windows, when gpg is not on PATH, the test kit puts Git for Windows' `usr/bin` on its own PATH when it holds
  `gpg.exe`. From PowerShell, gpg is otherwise on Git Bash's PATH alone.

Two findings need no change to CSH:

- A claim citing `.beads/issues.jsonl` comes from the profile's `csh/claims.json`; a tracker item is a proposal, not a
  statement about the code, so the claim belongs on a document.
- `no practice has a harness` is the run saying that no practice of the profile declares a `harness` command. The
  tests practices read `executions` from a results file instead, so no test runs during `csh run`.

