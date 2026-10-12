# Stage 29: Language seams

**Exit:** every existing profile reports what it reported before, and a Python file in a `Code` source is a skipped
fact ([12](../spec/12-polyglot-code.md)).

**Status:** exit reached. TypeScript facts through `@csh/facts-code` equal facts-ts's (`packages/facts-code/test/run.test.ts`),
and the profiles run in CI unchanged.

## Built

- `facts-code`, the new adapter for `Code` sources. It dispatches each file by extension: TypeScript, JavaScript,
  JSON and YAML to facts-ts, other languages to registered readers, and a file in a language with no reader to a
  `skipped` fact ([A-127](../../ASSUMPTIONS.md)).
- The tree-sitter grammars for Python, Java, Go and Rust, as WebAssembly, loaded inside the adapter sandbox.
- `witness` and `facts`: `DECLARATION_KINDS` adds `struct`, `trait`, `record`, `annotation`, `method`, `static`,
  `module` and `macro`; a module fact may name its `language`.
- `arch` and `check`: a rule over a file no reader read is unknown, not satisfied; built-in classes are known per language with their ancestors, for `inherits`.
- `witness`: `parseXml`, a small XML reader for JUnit reports and `pom.xml`. `facts-code`: `tomlFields` for TOML manifests.
- `adapter-items`: prose naming a `.py`, `.java`, `.go` or `.rs` file, or a `.toml` file by its bare name, is a
  mention of it.

## What review revealed

- A skipped file was left out of the dependency graph, so a rule over a polyglot source could hold against a graph that missed it. A file-level skipped fact now makes such a rule unknown.
- One name set of built-in bases for every language took a TypeScript class extending an imported `Exception` for Python's, and stopped a Python chain at `ValueError` short of `Exception`.
- Trees live on the WebAssembly heap, so a tree is now read in a callback and freed when it returns (`parseWith`).

## What proved wrong or costly in the documents

- The plan named a separate adapter per language. One adapter per `Code` source keeps a polyglot repository one source,
  and keeps every reader behind one contract, so the readers are registered in `facts-code` instead.
- The grammars ship native bindings with install scripts beside their WebAssembly. Only the `.wasm` files are loaded,
  and pnpm does not run the scripts.

## Effort

About 150 lines of source and 100 lines of tests. Effort was not timed.
