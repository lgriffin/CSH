# Architecture rules

A container diagram, the dependency rules someone wrote down, and the imports in the code all describe how a
project's packages may depend on each other. The harness reads the three together: the diagram as a source, the rules
as obligations it evaluates, and the code as facts it judges them by ([10](../spec/10-next-layers.md), section 4).
The repository's own `Workspace` component is the worked example ([examples/workspace](../../examples/workspace/README.md)).

## Three sources

```ts
const Brief = s.source("Brief", { kind: "Requirements", at: "docs/architecture/rules.md" });
const C4 = s.source("C4", { kind: "Architecture", at: "docs/architecture/containers.mmd" });
s.source("Code", { kind: "Facts", at: "reports/facts.ndjson" });
```

| Kind | Read by | Gives |
|---|---|---|
| `Architecture` | `@csh/adapter-c4-mermaid` | Each element, the packages each `Container` holds (its third argument, separated by commas) and each `Rel`, with its line. A line it cannot read is unliftable, reason `unreadable-line` |
| `Requirements` | The EARS adapter | Identified sentences, which the rules cite. A person writes each rule; no sentence is translated |
| `Facts` | `@csh/facts` | One `csh-facts/v1` line per package and per dependency between packages, from an import or a manifest, with its file and line |

The facts are written by a harness. In `csh/component.json`, a practice of kind `facts` runs the scan, and
`harness.witnesses` names the file it writes ([A-83](../../ASSUMPTIONS.md)):

```json
{ "id": "facts", "name": "Code facts", "kind": "facts", "sources": ["Code"],
  "harness": { "run": ["node", "packages/facts-imports/bin/facts-imports.js"], "witnesses": "reports/facts.ndjson" } }
```

`facts-imports` reads each workspace package's `dependencies` and the import statements of its `src` and `bin`
directories, through the TypeScript parser. An import of types alone counts, and is flagged `typeOnly`
([A-74](../../ASSUMPTIONS.md)); a dynamic import of a computed specifier is written as `skipped`, never dropped. Facts
are current only when taken at the run's own commit ([A-80](../../ASSUMPTIONS.md)).

## Writing a rule

```ts
import { system, forbid, only, closed, pkg, container, anything } from "csl";

s.policy("Structural", { require: ["FactsCurrent"] });
s.intent("Layering", { owner: "Architect", value: "Dependencies point inward", assurance: "Structural" }, (i) => {
  i.architecture("KernelDependsOnNothing", forbid(pkg("kernel"), anything), { cites: [{ source: Brief, id: "ARCH-001" }] });
  i.architecture("AdaptersSeeKernelAndWitnessOnly", only(container("adapters"), [pkg("kernel"), pkg("witness")]));
  i.architecture("DiagramIsComplete", closed(C4));
});
```

| Builder | Says |
|---|---|
| `pkg(name)` | One package, by its full name or the name after its scope: `pkg("kernel")` is `@csh/kernel` ([A-79](../../ASSUMPTIONS.md)) |
| `container(id)` | Every package the diagram's container `id` holds |
| `anything` | Any package |
| `forbid(from, to)` | No package of `from` depends on a package of `to` |
| `only(from, [to, ...])` | Packages of `from` depend only on each other and on packages of the listed selections |
| `closed(source)` | Every dependency between containers is drawn in that diagram. A missing arrow is not a prohibition unless a person says so, by approving this rule |

The method `FactsCurrent` is met when the facts were taken at the snapshot's commit.

## What a run reports

| Compared | Result |
|---|---|
| A rule and the current facts | `violated`, each breaking dependency's file and line as a reason; `satisfied` when the facts are current and none breaks it; `unknown` with `no-current-facts` or `no-facts` otherwise |
| A rule and the diagram | The finding `arch-conflict`: the diagram draws a relation the rule forbids. It needs every package of each end inside what the rule names ([A-81](../../ASSUMPTIONS.md)) |
| The diagram and the facts | The gap `undrawn-dependency` (`core->db`), with each dependency's file and line |
| The diagram and the facts | The gap `unobserved-relation`: a relation drawn that no import or manifest shows, with its line |
| The diagram and the packages | The gap `unplaced-package`: a package no container holds |

Once a `closed` rule is approved, an undrawn dependency is no longer a gap: it is that rule's violation, and the
enforcing gate blocks it. Relations to people and external systems are never compared ([A-82](../../ASSUMPTIONS.md)).

A disagreement between the three is a result, not something to make go away. Run the component, then open an A3 on
it, and let the owner decide what each side should say:

```sh
csh run --root .
csh a3 open layering --root .
```

## Limits

- Only imports and manifests are seen. A relation through a subprocess, a pipe or a file is invisible, and shows as
  `unobserved-relation`, a gap and not a failure.
- Only the container level is read; component diagrams are not.
- TypeScript and JavaScript only. Another language needs its own facts command; the adapter and the evaluation do not
  change.
