# @csh/facts-ts

## Purpose

`@csh/facts-ts` reads code facts from TypeScript and JavaScript source files, as `csh-facts/v2`: one fact per module, per dependency of a module (on another module or on a package), per exported name, and per field of a `package.json` that says what the package is ([11](../../docs/spec/11-ingesting-a-codebase.md), stage 23). Architecture rules over modules are judged against these facts ([the architecture rules guide](../../docs/guides/architecture-rules.md)).

## Where it sits

It belongs to the "Adapters" container, shown in the [containers diagram](../../docs/architecture/containers.mmd), as the code reader in [components-adapters.mmd](../../docs/architecture/components-adapters.mmd). `@csh/run` runs it in the isolated adapter subprocess for sources of kind `Code`. The check engine's architecture step reads its facts.

## Public interface

- `adapter`, `manifest`: the adapter (id `csh.adapter.facts-ts`, input kind `Code`, produces facts).
- `run(input)`: the facts of the input's files, at the commit `input.config.commit` names. Without a commit it warns `no-commit`, since such facts are never current.
- `readFile(path, text)`: the module references and exported names of one file.
- `resolveRelative(from, specifier, files)`, `packageOf(specifier)`: how a specifier is resolved, and the package a bare one names.
- `fieldsOf(json)`: the `package.json` fields read, by JSON pointer.

## Depends on and used by

- Depends on: `typescript` (the parser alone), `@csh/kernel` (ordering) and `@csh/witness` (the fact and adapter types).
- Used by: no package imports it at run time. `@csh/run` names it in `BUILTIN_ADAPTERS` for the kind `Code` and depends on it so that it resolves. `subjects/esi-ts` reads ESI.ts through it.

## Invariants it protects

- The facts of a commit depend on its source files alone. Nothing is installed, compiled or type checked, and no lockfile or `node_modules` is read ([A-100](../../ASSUMPTIONS.md)).
- A specifier it cannot resolve, and a computed one, is a `skipped` fact with its file and line, never dropped (P4).
- Every fact carries the commit it was read at, the tool and the file or line it came from.

## Rationale

`facts-imports` reads dependencies between the packages of a workspace, and runs as a harness. A codebase that is one package has its structure inside it: the layering lives between directories of `src`. Reading that structure needs the parser, but not the program: one file at a time, resolved against the files the source holds, so a subject can be read at any commit without installing it. Running as an adapter keeps it in the sandbox and lets it read a subject, on which no harness runs.

## How it is tested

- `test/scan.test.ts`: modules, dependencies (type-only, re-exports, dynamic imports, require, import types, import-equals), exports (declarations, destructuring, defaults, renamed and namespace re-exports), `package.json` fields, unresolved and computed specifiers, resolution and package names.
- `packages/run/test/code.test.ts`: a subject read through the isolated runner, with a module rule violated and one satisfied.
- `subjects/esi-ts`: ESI.ts at `2a2da8a`, where 288 modules give 1,116 dependencies and the three layering rules hold.

## Known limits

- Path aliases from `tsconfig.json` are not resolved; an aliased import reads as a package.
- A re-export's names are recorded where they are re-exported; following `export *` to the names it brings is left to the reader of the facts.
- Only `.ts`, `.tsx`, `.mts`, `.cts` and the JavaScript extensions are read; other files of the source are ignored, but `package.json` is read for its fields.
