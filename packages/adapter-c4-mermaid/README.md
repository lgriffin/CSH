# @csh/adapter-c4-mermaid

## Purpose

This adapter reads a container diagram written in Mermaid's `C4Container` text into elements, the packages each container holds, and drawn relations, each with its line ([10](../../docs/spec/10-next-layers.md), section 4.2). It covers the subset of the notation the repository uses. A line it cannot read is kept as unliftable with the reason `unreadable-line` and its span, never dropped.

## Where it sits

It belongs to the "Adapters" container of the [containers diagram](../../docs/architecture/containers.mmd) and is the diagram reader in [components-adapters.mmd](../../docs/architecture/components-adapters.mmd). The command line runs it in an isolated subprocess for sources of kind `Architecture`.

## Public interface

- `adapter`, `manifest`: id `csh.adapter.c4-mermaid`, produces `diagram`, input kind `Architecture`.
- `run(input)`: reads each file and returns the diagram, the unliftable lines as unliftable claims of the source, and an `unknown-element` warning for a relation naming no element.
- `readDiagram(text, path)`: one file. Read: comments, the `C4Container` header, `title`, `Person`, `Person_Ext`, `System`, `System_Ext`, `Container`, the boundaries (`System_Boundary`, `Container_Boundary`, `Enterprise_Boundary`, `Boundary`) with their braces, and `Rel`. A `Container`'s third argument lists its packages, separated by commas.
- `splitArgs(text)`: the arguments of one call, bare or double-quoted.

## Depends on and used by

- Depends on: `@csh/kernel` (`ClaimSet`) and `@csh/witness` (adapter contract and diagram types). No external packages.
- Used by: no package imports it directly. `@csh/run` names it in `BUILTIN_ADAPTERS`.

## Invariants it protects

- Every line is read or kept as unliftable with its span (P4, CSH-002); the repository's own `containers.mmd` reads with nothing unliftable (`test/adapter.test.ts`).
- A diagram states structure only; the adapter lifts no claim and no rule from it (P1).

## Rationale

Only the notation the repository uses is read, as section 10 allows; anything else, `ContainerDb` and `BiRel` among them, is unliftable rather than half-read ([DEPENDENCIES.md](../../DEPENDENCIES.md), checklist of section 11.1).

## How it is tested

- `test/adapter.test.ts`: argument splitting, every line of `docs/architecture/containers.mmd` read, unreadable lines kept with their spans, and nothing read before the header.
- Fixture F106 (an unreadable line), and F100 to F107 read their diagrams through it.

## Known limits

- Only the container level; the component diagrams are not read ([10](../../docs/spec/10-next-layers.md), section 4.5).
- Element kinds outside the list above, relation variants such as `Rel_U` and `BiRel`, and styling lines are unliftable.
