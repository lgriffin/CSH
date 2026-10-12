# @csh/facts-code

## Purpose

`@csh/facts-code` is the adapter for sources of kind `Code`. It hands each file to the reader of its language: TypeScript, JavaScript and the JSON and YAML files beside them to [`@csh/facts-ts`](../facts-ts/README.md), unchanged, and every other language to a reader registered here. A source file in a language CSH knows of but has no reader for is a `skipped` fact naming the language, so a rule or claim about it is indeterminate rather than silently empty ([12](../../docs/spec/12-polyglot-code.md), stage 29).

## Where it sits

It belongs to the "Adapters" container, shown in the [containers diagram](../../docs/architecture/containers.mmd), as the code dispatcher in [components-adapters.mmd](../../docs/architecture/components-adapters.mmd). `@csh/run` runs it in the isolated adapter subprocess for sources of kind `Code`. Like every adapter it is a driven port's implementation at the edge of the hexagon ([ADR-16](../../docs/adr/ADR-16-hexagonal-monolith.md)): the kernel, the check engine and the architecture rules see only the facts it writes, never a parser or a language.

## Public interface

- `adapter`, `manifest`: the adapter (id `csh.adapter.facts-code`, input kind `Code`, produces facts).
- `run(input, readers?)`: the facts of the input's files, at the commit `input.config.commit` names.
- `LanguageReader`, `READERS`: the contract of a language's reader (its language, the manifests it reads, and `read(files, ctx)`), and the readers registered.
- `languageOf(path)`: the language of a source file by its extension, or undefined for TypeScript, JavaScript and files that are not code.
- `parseWith(language, text, read)`, `lineOf(node)`, `GRAMMARS`: the tree-sitter grammars, loaded once per process as WebAssembly. A tree is read inside `read` and freed when it returns, since trees live on the WebAssembly heap.

## Depends on and used by

- Depends on: `@csh/facts-ts` (TypeScript and JavaScript), `@csh/kernel` (ordering), `@csh/witness` (the fact and adapter types), `web-tree-sitter` and the Python, Java, Go and Rust grammars.
- Used by: `@csh/run` names it in `BUILTIN_ADAPTERS` for the kind `Code`.

## Invariants it protects

- The facts of a commit depend on its source files alone: no toolchain of the subject's language is installed or run, and no file outside the source is read ([A-127](../../ASSUMPTIONS.md)).
- The facts of TypeScript and JavaScript are those facts-ts writes, line for line.
- A source file in a language with no reader is a `skipped` fact, never dropped (P4).

## Rationale

A codebase in several languages is one structure: rules about its layering and prose about its code cross languages. One adapter per source keeps a `Code` source as one source, whatever it holds, and keeps the readers behind one contract. tree-sitter gives every language a parser that runs in the sandbox as WebAssembly, the same way the solver runs Z3, so a subject in any language is read without installing anything.

## How it is tested

- `test/run.test.ts`: languages by extension; TypeScript read exactly as facts-ts reads it; a skipped fact per file with no reader; a reader handed its own code and manifests; every grammar parses.
- `packages/run/test/grammars.test.ts`: a grammar loads and parses inside the isolated adapter process.

## Known limits

- Languages are known by extension only; a file with no extension, such as a script with a shebang, is not code to CSH.
- The readers for Python, Java, Go and Rust arrive in stages 31 to 34; until then their files are skipped facts.
