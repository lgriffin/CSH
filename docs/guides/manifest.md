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
| `practices[].kind` | `requirements`, `scenarios`, `tests` or `design-notes` |
| `practices[].sources` | The `s.source(...)` names this practice feeds. A source has one owner; one no practice names is the gap `unowned-source` |
| `practices[].adapter` | A package or a path; the built-in adapter for the source kind when absent |
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
