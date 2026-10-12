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

## Modules of a codebase (stage 23)

A codebase that is one package has no packages to draw a rule between. Its layers are directories, so a rule selects
source files by glob, over paths from the repository root ([A-101](../../ASSUMPTIONS.md)):

```ts
import { forbid, only, modules, pkg } from "csl";

i.architecture("SdeImportsOnlyPortsAndPeers", only(modules("src/sde/**"), [modules("src/core/ports/**"), modules("node:*"), pkg("zod")]));
i.architecture("NothingImportsTheSde", forbid(modules("src/**", { except: "src/sde/**" }), modules("src/sde/**")));
```

| Builder | Says |
|---|---|
| `modules(globs, { except })` | Every source file or package whose name matches a glob and no exception. `**` spans directories; a built-in is `node:<name>`, so `modules("node:*")` is every built-in |

The facts come from a source of kind `Code`, read by `@csh/facts-ts` at the subject's commit with nothing installed
([A-100](../../ASSUMPTIONS.md); [the manifest guide](manifest.md#code-sources-stage-23)). No harness writes them, and
they are current for a subject at its pinned commit. A modules rule needs no diagram, and module facts never count as
`unplaced-package`. [`subjects/esi-ts`](../../subjects/esi-ts/csh/spec.csl.ts) states three of ESI.ts's layering
requirements this way.

## Claims about the code (stage 24)

Prose says things about code that are not layering: that a class extends another, that a module exports a name, that
the package has six entry points. A claim states one such sentence, true or false, and cites it
([A-104](../../ASSUMPTIONS.md)):

```ts
import { inherits, count, exportsName, field, same, constant, fileExists, atom } from "csl";

i.claim("CircuitOpenIsNoEsiError", inherits("CircuitOpenError", "EsiError"), { holds: false, at: "guides/CHARTER.md:190", cites: [{ source: Charter, id: "guides/CHARTER.md" }] });
i.claim("SixEntryPoints", count("package.json", "/exports", 6, { except: ["./package.json"] }), { at: "guides/CHARTER.md:235" });
```

| Builder | Says |
|---|---|
| `fileExists(path)` | The repository tracks the file |
| `declares(module, name)`, `exportsName(module, name)` | The module declares, or exports, the name |
| `inherits(cls, base)` | The class extends the base, through the classes the source declares |
| `field(file, pointer, value)` | A JSON file holds the value at the pointer |
| `count(file, pointer, n, { except })` | The object or array at the pointer has n entries, less the exceptions |
| `count(modules(globs), n)` | The selector selects n modules read; a matching file that was not read leaves it unknown (stage 39) |
| `script(name)` | `package.json` names the npm script |
| `same(constant(module, name), constant(module, name))` | Two constants hold the same literal |
| `atom(name)` | A sentence no fact decides; it stays `unknown`, and two atoms can still conflict |

A claim is looked up in the facts, never solved. One the facts refute is a `fact-conflict`, and its verdict is
`violated`. Two claims about the same thing that cannot both hold are a `claim-conflict`, and both are `conflicting`
([A-105](../../ASSUMPTIONS.md)). A claim whose fact was not read is `unknown`, with the reason. Some claims need no
writing: the Markdown adapter reads a backticked symbol beside its code file, and `npm run <name>`, as edges that trace
resolves against the facts, so a symbol that does not exist is a `dangling-reference` ([A-106](../../ASSUMPTIONS.md)).
An agent proposes a claim with `propose_claim`, into `csh/claims.json` ([A-107](../../ASSUMPTIONS.md)).

## Chains, value imports and cycles (stage 39)

```ts
import { forbid, acyclic, modules } from "csl";

i.architecture("PodsReachNoDatabase", forbid(modules("src/pods/**"), modules("src/db/**"), { reaches: true }));
i.architecture("FrontendImportsOnlyTypes", forbid(modules("apps/web/**", { values: true }), modules("packages/core/**")));
i.architecture("NoCycleBetweenPackages", acyclic(modules("packages/**"), { group: "packages/*" }));
```

| Form | Says |
|---|---|
| `forbid(a, b, { reaches: true })` | No module of `a` reaches `b` through any chain of dependencies. A violation names the chain step by step; a chain through a file that was not read leaves the rule unknown |
| `modules(globs, { values: true })` | As a rule's subject, a dependency that imports types alone does not count |
| `acyclic(sel)` | No cycle among the selected modules. Each cycle is reported once, as its dependencies |
| `acyclic(sel, { group })` | Modules are grouped by the directory the glob matches (`packages/a`), and only a cycle between groups counts |

A `forbid` whose target selects nothing the facts know holds, with the reason `target-selects-nothing`, so a mistyped
path shows in the assessment. `package.json`'s `packageManager`, `dependencies`, `devDependencies` and `workspaces`
are fields a claim can name, such as `field("package.json", "/packageManager", "pnpm@10.28.0")`
([13](../spec/13-from-real-runs.md), section 2).

## Limits

- Only imports and manifests are seen. A relation through a subprocess, a pipe or a file is invisible, and shows as
  `unobserved-relation`, a gap and not a failure.
- Only the container level is read; component diagrams are not.
- An import is resolved against the files of its own source, as a bundler would. A path alias from `tsconfig.json` is
  not read, so an aliased import is a bare package name.
- A claim reads what a sentence says only as a person writes it; nothing reads a claim out of prose but the two
  mechanical shapes of A-106.
- `inherits` follows declared names, not resolved imports: two classes of one name in different modules make the claim
  `unknown` (`ambiguous-class`).
- TypeScript and JavaScript only. Another language needs its own facts command; the adapter and the evaluation do not
  change.
