# Stage 18: Checked C4

**Exit:** F100 to F107 pass, and `csh run` completes on the `Workspace` component; what it reports is not specified in
advance ([10](../spec/10-next-layers.md), section 9). Every earlier fixture and both walkthroughs stay green.

**Status:** exit reached. The first run disagreed with the diagram, so, by rule 21, it is recorded and an A3 is opened
as a skeleton for the owner: [csh/a3/layering](../../csh/a3/layering/a3.md). Nothing in the diagram, the written rules
or the code was changed to make the disagreement go away. Every rule is candidate; `DiagramIsComplete` waits for the
owner's decision on the closed world ([A-73](../../ASSUMPTIONS.md)).

## Built

- `kernel`: `ArchRule` and `ArchSel`, the method `FactsCurrent`. An architecture obligation whose value is a typed rule is evaluated; any other value stays reserved ([A-79](../../ASSUMPTIONS.md)).
- `csl`: the builders `forbid`, `only`, `closed`, `pkg`, `container`, `anything`.
- `arch` (new, trusted): selectors and the set comparisons of section 4.3; no solver.
- `adapter-c4-mermaid` (new): the container diagram as a source of kind `Architecture`.
- `facts` (new): the fact format's reader and the adapter for sources of kind `Facts`; the format itself sits in `witness`, beside the witness format.
- `facts-imports` (new): the TypeScript-parser scan of manifests and imports, run as a `facts` practice's harness ([A-83](../../ASSUMPTIONS.md)).
- `check`: the finding `arch-conflict`; the gaps `undrawn-dependency`, `unobserved-relation`, `unplaced-package`; architecture assessments ([A-80](../../ASSUMPTIONS.md) to [A-82](../../ASSUMPTIONS.md)).
- `component`: practice kinds `architecture` and `facts`. `run`: the two adapters built in.
- The `Workspace` component at the repository root: [csh/component.json](../../csh/component.json), [csh/spec/workspace.csl.ts](../../csh/spec/workspace.csl.ts) and the written rules [docs/architecture/rules.md](../architecture/rules.md), quoted from the implementer's brief.
- `testkit`: `BUILT_THROUGH_STAGE` is 18; fixture ids of three digits in the round-trip test; the triangle knows the `arch` container.

## Fixtures

All eight pass: F100 (a `forbid` rule broken by an import, with its file and line), F101 (`arch-conflict` between a
rule and a drawn relation, cross-source), F102 (`undrawn-dependency`), F103 (`unobserved-relation`), F104 (an approved
`closed` rule turns the gap into a violation), F105 (facts from another commit give `unknown`, `stale`), F106 (an
unreadable diagram line is unliftable), F107 (a type-only import counts and is flagged).

## What the first run reported

`csh run --root .` at the commit that added the component, as the stage record `first` of the A3 holds it. What it
means is for the owner's judgments; this note does not interpret it.

| Count | Value |
| --- | --- |
| Facts | 22 packages, 197 dependencies, 6 skipped (dynamic imports and `require` of computed specifiers) |
| Obligations | 3, all candidate: `KernelDependsOnNothing` satisfied, `AdaptersSeeKernelAndWitnessOnly` satisfied, `DiagramIsComplete` violated |
| Findings | 0; no rule conflicts with the diagram |
| Gaps | 18: 17 `undrawn-dependency`, 1 `unobserved-relation` |
| Unliftable diagram lines, errors | 0, 0 |
| Gate | allow, advisory |
| Signals on the sheet | 19, all unclassified |

The 17 undrawn dependencies between containers, each with its files and lines in the report:

| From | To |
| --- | --- |
| `cli` | `check`, `emission`, `gate`, `kernel`, `ledger` |
| `testkit` | `a3`, `adapters`, `check`, `component`, `emission`, `gate`, `kernel`, `ledger` |
| `a3`, `gate`, `run` | `kernel` |
| `check` | `adapters` |

The one unobserved relation is `run -> harness` (`containers.mmd`, the line `Rel(run, harness, ...)`): no import or
manifest of `run` names `harness`.

## The three corners

- C4: the container diagram draws `arch` as its own container and names `adapter-c4-mermaid`, `facts` and `facts-imports`, with the two relations the new code adds (`check -> arch`, `arch -> kernel`). It is now a checked source. New component diagrams: [arch](../architecture/components-arch.mmd) and [facts](../architecture/components-facts.mmd); the adapters, check and harness diagrams gain the new components.
- Docs: [the architecture rules guide](../guides/architecture-rules.md); READMEs for `arch`, `facts`, `facts-imports` and `adapter-c4-mermaid`; [A-79 to A-83](../../ASSUMPTIONS.md).
- Examples: [examples/workspace](../../examples/workspace/README.md), the repository as a component, and its A3, checked by `packages/cli/test/a3.test.ts`.

## What proved wrong or costly in the documents

- A diagram relation is not a fragment, yet F101 names it as a finding member (`Store/@C4/web->db`). It is a member that cannot be approved, so by A-10 the finding never makes an approved rule conflicting ([A-81](../../ASSUMPTIONS.md)).
- Section 4.4 gives `Workspace` three practices; the harness runner has only a witness file to name, so the facts practice names its facts file there ([A-83](../../ASSUMPTIONS.md)).
- The A3 lanes count signals by source, and a diagram gap's subject (`cli->kernel`) names no source, so every lane shows 0 at the first stage while the 19 signals are listed in full.
