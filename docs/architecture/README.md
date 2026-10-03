# Architecture (C4)

Diagram sources for the four C4 levels of the [Architecture tab](../spec/07-architecture-c4.md), written in
[Mermaid's C4 syntax](https://mermaid.js.org/syntax/c4.html), with rendered SVG beside each source. GitHub renders
the `.mmd` sources directly; the SVG files are for anywhere else.

| Level | Source | Shows |
| --- | --- | --- |
| 1 Context | [context.mmd](context.mmd) | Contributors, intent owners and agents; version control, existing practice, CI |
| 2 Containers | [containers.mmd](containers.mmd) | The ten runtime containers, with every package by name, and the development-only test kit |
| 3 Components | [components-cli.mmd](components-cli.mmd) | Command line |
| 3 Components | [components-run.mmd](components-run.mmd) | Run |
| 3 Components | [components-component.mmd](components-component.mmd) | Component |
| 3 Components | [components-harness.mmd](components-harness.mmd) | Harnesses |
| Sequence | [run-sequence.mmd](run-sequence.mmd) | One `csh run`: harness, sources, check, gate, store |
| 3 Components | [components-emission.mmd](components-emission.mmd) | Emission sandbox |
| 3 Components | [components-adapters.mmd](components-adapters.mmd) | Adapters |
| 3 Components | [components-ledger.mmd](components-ledger.mmd) | Ledger and authority |
| 3 Components | [components-check.mmd](components-check.mmd) | Check engine |
| 3 Components | [components-gate.mmd](components-gate.mmd) | Gate |
| 3 Components | [components-kernel.mmd](components-kernel.mmd) | Kernel |

Level 4 is the code: the types in `packages/kernel/src/model.ts`, `packages/check/src/types.ts`,
`packages/witness/src/witness.ts`, `packages/ledger/src/types.ts` and `packages/gate/src/gate.ts`. They are the single
source; no parallel definitions are generated.

`containers.mmd` must name every package under `packages/`. The docs test (`packages/testkit/test/docs.test.ts`)
fails if one is missing.

## Rendering

The SVG files were rendered with `@mermaid-js/mermaid-cli` 11, installed outside the repository. It is not a
workspace dependency. To re-render after changing a source:

```sh
npx -y @mermaid-js/mermaid-cli@11 -i docs/architecture/containers.mmd -o docs/architecture/containers.svg -b white
```
