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
  `AGPL`, `MIT`, `BSD`, `CC`). The pattern is `(?:A|B|...)-[0-9]+` over the families, most frequent first, at most
  eight. With no family, no pattern is proposed and each adapter keeps its default.
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
`coverage: all M tracked files read`. It is left out when the run is of another commit (`--at`) or the source root is
not a git repository.

## 2. Rules that can be stated (stage 39)

- **`reaches`.** `forbid(a, b, { reaches: true })` is violated when a module of `a` reaches a module of `b` through any
  chain of dependencies, each step a dependency the facts hold. The violation names the chain.
- **Value imports.** `modules(globs, { values: true })` selects the same modules, but only their dependencies that are
  not type-only count when the selector is the subject of a rule.
- **Cycles.** `acyclic(modules(globs), { across })` is violated by each cycle of dependencies among the selected
  modules; with `across: "package"` or `across: "workspace"` only a cycle that crosses that boundary counts.
- **Counts over modules.** `count(modules(globs))` is the number of modules selected, so a sentence such as "ten use
  cases" is a claim checked against the files.
- **Manifest fields.** `packageManager`, `dependencies`, `devDependencies` and `workspaces` of a `package.json` are
  fields, so a claim about a pinned tool version or a workspace list is decided.
- **A target that selects nothing.** A `forbid` whose target selects no module still holds, with an info diagnostic
  naming the selector, so a mistyped path is visible and a package that is legitimately absent is not an error.

## 3. Speed (stage 40)

- Git calls whose answer cannot change within one command (`rev-parse`, `--show-prefix`, `status --porcelain`) are
  asked once per command. The ignored-files status over a subject checkout is asked only by `csh subject fetch`.
- The built-in adapters of one run share one isolated process. A profile's own adapter keeps its own.
- `csh history` makes one clone per run and checks out each tag in it, rather than one clone per tag.
- Blame is prefetched for every document item, not only for those reached through a resolved edge.

## 4. Cross-platform correctness (stage 41)

- Text artefacts are hashed with their line endings normalised to LF, so a Windows checkout and CI agree on the A3
  `judgmentsDigest`.
- `.gitattributes` sets `eol=lf` for fixtures, READMEs and A3 sheets, and CI runs on `windows-latest` as well.
- When `--root` is outside the working tree the sandbox error names the path and says the root must be inside the
  current directory.
- `core.longpaths` is set for every `git worktree` and `checkout` CSH runs, as it is for `clone`.

## 5. Traceability past the file (stage 42)

- A Playwright test's `{ tag: "@id" }` option cites, as a title does.
- `csh results import` reads cucumber-js JSON and Playwright JSON as well as Jest and Vitest.
- A steps file that loads a feature (`loadFeature("path")`) is linked to it, and each scenario step is matched to a
  step definition: a step with no definition and a definition no step uses are each a gap.
- A feature's description can cite decisions (`decisionsField`, such as `Decisions` or `Specified by`).
- `fileId` is a pattern over a feature's path that gives its identity, so two files with the same identifier collide.
- A rule that cites an ADR does not verify it: the ADR is reported as cited and not verified, a gap.

## 6. Output (stage 43)

- The run summary counts `errors` and `warnings` apart.
- A claim finding prints the claim's sentence and the fact that decides it.
- A3 problems from a first run are summarised by kind.
- `placeholders` is a list of patterns for tokens a profile treats as examples, never as paths.
- A profile can list volatile files that `stale-prose` does not weigh.

## 7. Process and safety (stage 44)

- `csh subject fetch` warns when the subject repository is private (asked of `gh` when it is installed), since a
  profile for it should not be committed to a public CSH.
- A committed manifest whose `subject.repo` is a local path is warned about.
- The manifest guide documents keeping a local profile out of git with `.git/info/exclude`.
