# The component manifest

`csh/component.json` names one component, the practices that describe it, the sources each practice feeds and the
command that runs each practice's tests. `csh init` writes it by asking for each field, at the git repository's top level unless `--root` names another directory, the same root every other command reads. It says what is evaluated,
never what is right: it holds no judgment and no authority ([09](../spec/09-anchor-harness-a3.md), section 2.1).

For a repository evaluated from outside, `csh init --subject <checkout>` proposes a version 2 manifest instead: sources
by directory and extension, an identifier pattern from the documents, tag and test settings, and a results file when
`package.json` names Vitest or Jest. It prints every guess with what it was read from, and what the proposal leaves
unread, so the manifest can be corrected before its first run ([13](../spec/13-from-real-runs.md), section 1).

```json
{
  "schema": "csh-component/v1",
  "name": "SignInService",
  "spec": "spec/lockout.csl.ts",
  "implementation": ["src"],
  "practices": [
    { "id": "ears", "name": "EARS", "kind": "requirements", "sources": ["Product"], "author": "Product owner", "unit": "the sentence" },
    { "id": "tdd", "name": "TDD", "kind": "tests", "sources": ["UnitTests"], "cites": "Product",
      "harness": { "run": ["node", "--test", "test/lockout.test.ts"], "witnesses": "reports/witnesses.ndjson" } }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `schema` | Always `csh-component/v1` |
| `name` | The system name in the specification; a difference is the error `component-name-mismatch` |
| `spec` | The CSL module, relative to the component root |
| `implementation` | Paths whose change makes a witness stale |
| `practices[].id` | A lane on the A3: lower case letters, digits and hyphens |
| `practices[].kind` | `requirements`, `scenarios`, `tests`, `design-notes`, `architecture` (a container diagram) or `facts` (dependency facts, whose harness writes the file `harness.witnesses` names; [architecture rules](architecture-rules.md)) |
| `practices[].sources` | The `s.source(...)` names this practice feeds. A source has one owner; one no practice names is the gap `unowned-source` |
| `practices[].adapter` | A package or a path; the built-in adapter for the source kind when absent. A Scenarios source with none, whose every file is JSON declaring `"schema": "csh-ir/v1"`, is read as claims already lifted |
| `practices[].harness.run` | An argument vector, never a shell string. It runs with the project's own permissions |
| `practices[].harness.witnesses` | The witness file the command writes; one of the practice's sources must read it |
| `practices[].harness.executions` | The file the reporter writes; `reports/executions.ndjson` when absent |
| `practices[].harness.timeoutMs` | Milliseconds the command may run, a positive whole number; 600000 (ten minutes) when absent. On timeout its process tree is killed and the run records `exitCode: null`, `error: "timed out after N ms"` |
| `practices[].executions` | For a practice without a harness: the file a reporter run by hand writes. An executions file is joined to a practice's Witnesses sources only when its harness or this field names one. On a practice that owns a TestFiles source it names a test runner's results instead: Jest's `--json` report, Vitest's `json` reporter, or `csh-execution/v1` lines, counted per test file and per item a test cites and never deciding a verdict ([A-115](../../ASSUMPTIONS.md)), or a `csh-results/v1` file `csh results import` writes, which names no test and is joined only at its commit ([A-124](../../ASSUMPTIONS.md)) |
| `practices[].cites` | The source this practice's citations refer to |
| `practices[].steps` | For scenarios only: the project's step table |
| `practices[].author`, `unit` | Shown on the A3: who writes it, and what one artefact is |

With a manifest, `csh/config.json` keeps only `mode`, `budgetMs`, `specPaths` and the settings no manifest field covers.
Setting `spec`, `implementationPaths`, `adapters` or `executions` there as well is the problem `config-superseded`, and the run is
refused rather than choosing between them.

## Version 2: a subject, and no specification

`csh-component/v2` adds two things ([11](../spec/11-ingesting-a-codebase.md), stage 21). A version 1 manifest is read
unchanged.

- **A subject.** This is a repository evaluated from outside, at a pinned commit. The profile lives in another repository and the subject is only read. Source paths and `implementation` are relative to the subject's checkout. `csh subject fetch` clones the subject under `.csh-cache/subjects/<commit>/` of the component root. `--subject <dir>` names another checkout instead. Either way, the checkout must be at the pinned commit with no uncommitted changes, or the run is refused (`subject-missing`, `subject-commit-differs`, `subject-dirty`). A practice with a harness is refused on a subject (`harness-on-subject`), since a harness would run in its checkout.
- **No specification.** `spec` may be left out. The manifest then declares the sources itself, as `s.source(name, { kind, at })` would. The model of the run is the system name and those sources, with no vocabulary, obligation or binding. What such a run reports comes from its sources alone: items, unliftable content, adapter diagnostics and the gaps they give.

```json
{
  "schema": "csh-component/v2",
  "name": "ESI.ts",
  "subject": { "repo": "https://github.com/lgriffin/ESI.ts", "commit": "2a2da8a626821bef77ad8726da2c8018e2961236" },
  "implementation": ["src"],
  "sources": [{ "name": "Charter", "kind": "Requirements", "at": "guides/CHARTER.md" }],
  "practices": [{ "id": "charter", "name": "Charter", "kind": "requirements", "sources": ["Charter"] }]
}
```

| Field | Meaning |
| --- | --- |
| `subject.repo` | Where the subject is fetched from: a URL, or a path to a local clone relative to the component root (warned about once the manifest is committed) |
| `subject.commit` | The full commit, 40 hexadecimal digits. It joins the snapshot, beside the profile's own commit |
| `spec` | Optional in version 2 |
| `sources[]` | Each source's `name`, `kind` and `at`. Without `spec` they are the model's only sources; beside a `spec` they join its sources, and a name both declare is `duplicate-source` ([A-102](../../ASSUMPTIONS.md)). A practice naming a source declared in neither is `practice-unknown-source` |

### Profiles of private repositories (stage 44)

A profile names its subject's repository, so committing it says where that repository is and what it holds. `csh
subject fetch` warns when GitHub says the subject is private or internal (it asks `gh repo view`, when `gh` is
installed and signed in), and `csh subject fetch` and `csh run` warn when a committed manifest names its subject by a
local path, which works only on the machine that wrote it. Neither warning stops anything ([A-159](../../ASSUMPTIONS.md)).

To keep a local profile out of git without a `.gitignore` entry everyone sees, list it in the repository's own
`.git/info/exclude`, which is never committed:

```text
# .git/info/exclude
subjects/my-private-app/
```

## Inventory sources (stage 22)

A source can be read as an inventory: each requirement, rule, scenario, test file, document or issue becomes an
item, and the references between them become edges ([11](../spec/11-ingesting-a-codebase.md), stage 22). Five source
kinds have built-in inventory adapters from `@csh/adapter-items`:

| Kind | Adapter | Items | Edges |
| --- | --- | --- | --- |
| `Documents` | `@csh/adapter-items/markdown` | one `document` per file; a heading that opens with an identifier is a `requirement` | `verified-by`, `implements`, `mentions-file` |
| `Features` | `@csh/adapter-items/gherkin` | `feature`, `rule`, `scenario`, with synthetic identifiers ([A-99](../../ASSUMPTIONS.md)) | `exemplifies`, and `cites` from tags |
| `TestFiles` | `@csh/adapter-items/tests` | one `test-file` per file, with its test count | `cites`, from test titles only ([A-98](../../ASSUMPTIONS.md)) |
| `Issues` | `@csh/adapter-items/jsonl` | one `issue` per JSON line | `mentions` |
| `Traces` | `@csh/adapter-items/yaml` | one `property` per entry of a YAML or JSON list, such as a security model (stage 28, [A-122](../../ASSUMPTIONS.md)) | the relations its `edges` setting maps |
| `Outputs` | `@csh/adapter-items/outputs` | one `suite` per directory of accepted outputs: baselines, golden, approved and snapshot files, paired with their cases by path (stage 70, [A-263](../../ASSUMPTIONS.md)) | none: the check reports `accepted-outputs`, `unaccepted-case`, `orphan-output`, `shared-stem` and `unpaired-outputs` |

A requirements source can use the Markdown adapter by naming it as its practice's `adapter`. Two more fields shape what
is read:

| Field | Meaning |
| --- | --- |
| `sources[].include`, `sources[].exclude` | Globs over paths below the source's `at`. `**` spans directories. A file is read when it matches an include (or there is none) and no exclude |
| `sources[].names` | Globs over paths below the source's `at` of files read by name: the adapter is handed the path and no bytes ([A-261](../../ASSUMPTIONS.md)). An `Outputs` source pairs by name, so a tree of baselines is read without opening it |
| `practices[].settings` | Names to strings, handed to the adapter of each source the practice owns. The Markdown adapter takes `idPattern`, `placeholders` (one pattern a whole backticked token must match to be read as an example, never a path, such as `src/x\.ts|<[^>]+>`), `headingFields` (names for the parts of an identifier heading, such as `form,status`), `verifiedField` (default `Verified by`) and `headings: "references"` (an identifier heading is a section about an item defined elsewhere). The Gherkin adapter takes `tagCites`, a pattern whose first group is the identifier a tag cites, and `idTag`, a pattern for a tag that is the rule's own identifier (`rule-([0-9]+)`): the rule keeps that identifier and the tag cites nothing. It also takes `decisionsField` (description lines, such as `Decisions|Specified by`, that link a feature or rule to the decisions they name, shown as cited and not verified) and `fileId` (a pattern over a feature file's path whose first group is the file's identity; two files with one identity are the warning `duplicate-file-id`). With `executions`, a scenarios practice joins a cucumber-js report by feature file. The test and issue adapters take `idPattern` and `citePattern`; the test adapter also takes `style: "cucumber"` and `citeBodies: "true"` (an identifier in any string literal of a test file cites, not only one in a title), the first of which reads Cucumber step definitions (Given, When, Then, And, But, Step) as steps: a file of them declares no test but is not empty, and an identifier in a step's text cites. In that style a `loadFeature("path")` links the file to the feature, jest-cucumber's lower-case step functions are read in a file that loads one, and each scenario step is matched to the definitions: `undefined-step`, `unused-step-definition` and `steps-undecided` ([A-154](../../ASSUMPTIONS.md)). A Playwright `{ tag }` option cites, and a practice's `executions` may be a Jest, Vitest, JUnit, `go test -json`, cucumber-js or Playwright report. The trace adapter takes `collection` (the list, default `properties`), `idField` and `textField`, `edges` (field and relation pairs, such as `tests=verified-by charter=implements`), `fields` (kept as attributes) and `silence` (`rule=none:rule_reason`: the field that records a silence, its value, and the field holding why; a silence with a reason is a `justified-gap`, [A-123](../../ASSUMPTIONS.md)). A practice of kind `traces` owns a `Traces` source |

What nothing verifies and what names nothing are gaps: `unverified` ([A-97](../../ASSUMPTIONS.md)) and
`dangling-reference` ([A-96](../../ASSUMPTIONS.md)). An inventory item is never `uncited`.

## Code sources (stage 23)

A source of kind `Code` is read by `@csh/facts-ts` into `csh-facts/v2` facts: one `module` per source file, one
`depends` per import, re-export, import type and literal dynamic import or require, one `export` per exported name, and
the `field`s of a `package.json` that say what the package is ([A-100](../../ASSUMPTIONS.md)). Nothing is installed or
built. A profile with rules over the code declares the source beside its specification, so that it can carry globs:

```json
{
  "spec": "csh/spec.csl.ts",
  "sources": [{ "name": "Code", "kind": "Code", "at": ".", "include": ["src/**/*.ts", "package.json"] }],
  "practices": [{ "id": "code", "name": "Code facts", "kind": "facts", "sources": ["Code"] }]
}
```

Since stage 24, `facts-ts` also reads each top-level declaration and every value of any other JSON file the source
includes, such as a metrics file ([A-108](../../ASSUMPTIONS.md)). A source the manifest declares with the same name,
kind and place as one the specification declares narrows it with the manifest's globs, so a claim can cite it.
Proposed claims sit beside the manifest in `csh/claims.json`:

```json
{ "schema": "csh-claims/v1", "claims": [{ "name": "ErrorsSubpathLacksIsCircuitOpen", "intent": "ProseAboutCode", "claim": { "k": "claim", "holds": false, "p": { "k": "exports", "module": "src/errors.ts", "symbol": "isCircuitOpen" } }, "cites": [{ "source": "Charter", "id": "ARCH-07" }] }] }
```

The rules themselves are in the specification, written with `modules(...)` ([the architecture rules
guide](architecture-rules.md#modules-of-a-codebase-stage-23)).

## History (stage 25)

`history` asks for the repository's history to be read, in the checkout the sources are read from
([11](../spec/11-ingesting-a-codebase.md), stage 25). Without it no history is read.

```json
{ "history": { "since": "previous-tag" } }
```

| Field | Meaning |
| --- | --- |
| `history` | Read git history. Prose that names a file changed since the line was last edited is `stale-prose`, and so is a refuted claim whose sentence is older than the code that refutes it ([A-111](../../ASSUMPTIONS.md)). A requirement whose status is `Enforced` while no mechanism it names resolves is `status-unsupported` ([A-112](../../ASSUMPTIONS.md)) |
| `history.since` | A tag or commit, or `previous-tag` for the newest tag before the commit evaluated. Each later commit that changes an `implementation` path with no test and no `Refs:` trailer is an `untraced-change`, marked when an agent co-authored it ([A-113](../../ASSUMPTIONS.md)). A start that names nothing is the warning `history-since-unknown` |
| `history.frozen` | Path globs of documents that record a moment, such as release notes and decisions. Prose in them is never `stale-prose`: a later change to a file they name is expected |
| `history.volatile` | Path globs of files that change all the time, such as `package.json` or a composition root. Prose naming them is never `stale-prose` for their changes |
| `history.tests` | Path globs of places that hold tests beside the usual conventions (`test/`, `tests/`, `*.test.*`), such as a feature directory. A change that touches one is not an `untraced-change` |

A backticked bare file name, such as `security.test.ts`, names the one tracked file with that name
([A-110](../../ASSUMPTIONS.md)). Only commit hashes, dates and counts from history enter a report.

`csh history <slug> --from <tag> --to <tag>` runs a subject at each release tag in the range and records each run as a
stage of the A3 `<slug>`, opening it when needed ([A-114](../../ASSUMPTIONS.md)). Each tag's checkout is cloned beside
the pinned one; `csh subject fetch --at <tag>` makes one by hand. `csh a3 verify <slug>` runs each stage again at its
own tag.
