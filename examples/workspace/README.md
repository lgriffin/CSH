# Workspace example

The repository itself, as a component: `Workspace`, at the repository root
([10](../../docs/spec/10-next-layers.md), section 4.4). It reads three descriptions of how the packages may depend on
each other that had never been read together:

- `docs/architecture/containers.mmd`: the container diagram, read by the C4 Mermaid adapter (practice `c4`).
- `docs/architecture/rules.md`: the dependency rules written in the implementer's brief, as identified sentences (practice `rules`).
- `reports/facts.ndjson`: the imports and manifests of the code, written by `facts-imports` as the harness of practice `facts`.

The rules are in `csh/spec/workspace.csl.ts` and the manifest in `csh/component.json`; this directory holds only this
page, since the component is the repository. Every rule is candidate. The first run, and the A3 it opened, are in
[the stage 18 note](../../docs/stages/stage-18.md) and [csh/a3/layering](../../csh/a3/layering/a3.md). How to write
such rules for a project of your own is in [the architecture rules guide](../../docs/guides/architecture-rules.md).

From the repository root:

```sh
csh() { node packages/cli/bin/csh.js "$@"; }
csh run --root .
csh gaps --root .
csh a3 build layering --root . --check
```

## Containers it exercises

Checked against [the container diagram](../../docs/architecture/containers.mmd) and the commands this example runs
(`packages/testkit/test/triangle.test.ts`).

- `cli`: the `csh` command
- `kernel`: the model, the typed architecture rules, canonical JSON and digests
- `emission`: the emission of `csh/spec/workspace.csl.ts` inside every evaluation
- `adapters`: the C4 Mermaid, EARS and facts adapters, inside every evaluation
- `check`: findings, gaps and assessments, the diagram against the facts among them
- `arch`: the rules against the diagram and the facts
- `gate`: the gate decision, advisory
- `run`: `csh run`: the facts harness, sources, check, gate and the stored record
- `component`: `csh/component.json`, read by `csh run`
- `a3`: `csh a3 build` on the sheet the first run opened
