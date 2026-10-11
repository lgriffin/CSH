# The component manifest

`csh/component.json` names one component, the practices that describe it, the sources each practice feeds and the
command that runs each practice's tests. `csh init` writes it by asking for each field, at the git repository's top level unless `--root` names another directory, the same root every other command reads. It says what is evaluated,
never what is right: it holds no judgment and no authority ([09](../spec/09-anchor-harness-a3.md), section 2.1).

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
| `practices[].executions` | For a practice without a harness: the file a reporter run by hand writes. An executions file is joined to a practice's Witnesses sources only when its harness or this field names one |
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
| `subject.repo` | Where the subject is fetched from: a URL, or a path to a local clone relative to the component root |
| `subject.commit` | The full commit, 40 hexadecimal digits. It joins the snapshot, beside the profile's own commit |
| `spec` | Optional in version 2 |
| `sources[]` | Each source's `name`, `kind` and `at`. Without `spec` they are the model's only sources; beside a `spec` they join its sources, and a name both declare is `duplicate-source` ([A-102](../../ASSUMPTIONS.md)). A practice naming a source declared in neither is `practice-unknown-source` |

## Inventory sources (stage 22)

A source can be read as an inventory: each requirement, rule, scenario, test file, document or issue becomes an
item, and the references between them become edges ([11](../spec/11-ingesting-a-codebase.md), stage 22). Four source
kinds have built-in inventory adapters from `@csh/adapter-items`:

| Kind | Adapter | Items | Edges |
| --- | --- | --- | --- |
| `Documents` | `@csh/adapter-items/markdown` | one `document` per file; a heading that opens with an identifier is a `requirement` | `verified-by`, `implements`, `mentions-file` |
| `Features` | `@csh/adapter-items/gherkin` | `feature`, `rule`, `scenario`, with synthetic identifiers ([A-99](../../ASSUMPTIONS.md)) | `exemplifies`, and `cites` from tags |
| `TestFiles` | `@csh/adapter-items/tests` | one `test-file` per file, with its test count | `cites`, from test titles only ([A-98](../../ASSUMPTIONS.md)) |
| `Issues` | `@csh/adapter-items/jsonl` | one `issue` per JSON line | `mentions` |

A requirements source can use the Markdown adapter by naming it as its practice's `adapter`. Two more fields shape what
is read:

| Field | Meaning |
| --- | --- |
| `sources[].include`, `sources[].exclude` | Globs over paths below the source's `at`. `**` spans directories. A file is read when it matches an include (or there is none) and no exclude |
| `practices[].settings` | Names to strings, handed to the adapter of each source the practice owns. The Markdown adapter takes `idPattern`, `headingFields` (names for the parts of an identifier heading, such as `form,status`), `verifiedField` (default `Verified by`) and `headings: "references"` (an identifier heading is a section about an item defined elsewhere). The Gherkin adapter takes `tagCites`, a pattern whose first group is the identifier a tag cites. The test and issue adapters take `idPattern` and `citePattern` |

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
