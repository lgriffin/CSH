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
- `python`, `readPython`, `sourceRoots`, `resolveImport`, `PYTHON_TOOL` (stage 31): the reader for `.py` and `.pyi` files and `pyproject.toml`, as tool `facts-py`. Imports resolve against the source roots (the repository root, `src` and the parent of every top-level package); `if TYPE_CHECKING:` imports are type-only; literal `importlib.import_module` calls are dependencies; exports are a literal `__all__`, else every public top-level name; of `pyproject.toml` only `project` and `build-system` are read ([A-130](../../ASSUMPTIONS.md)).
- `javaReader`, `readJava`, `readJavaFiles`, `pomFields`, `JAVA_TOOL` and their helpers (stage 32): the reader for `.java` files and `pom.xml`, as tool `facts-java`. Imports resolve by fully qualified name against the files read, whatever the source roots; public top-level types are exports, `static final` literal fields are constants named `Type.NAME`, and `pom.xml` gives its coordinates, parent, modules, properties and dependencies as fields ([A-131](../../ASSUMPTIONS.md)).
- `goReader`, `readGo`, `readGoFile`, `parseGoMod`, `GO_TOOL` (stage 33): the reader for `.go` files, `go.mod` and `go.work`, as tool `facts-go`. A local import depends on each non-test file of its package directory, so a module glob such as `internal/db/**` selects it; methods are declared as `Type.Method`, capitalised names are exports, and `go.mod` and `go.work` give `/module`, `/go`, `/require/<path>`, `/replace/<old>`, `/use/<i>` and the other directives as fields ([A-132](../../ASSUMPTIONS.md)).
- `rust`, `readRust`, `readTree`, `cratesOf`, `resolveMod`, `rustLiteralValue` (stage 34): the reader for `.rs` files and `Cargo.toml`, as tool `facts-rust`. It finds crates from each `Cargo.toml`, follows `mod` declarations (`foo.rs`, `foo/mod.rs`, `#[path]`) to build each module tree, and resolves `use` paths to the file of the deepest module they name; plain `pub` items, `#[macro_export]` macros and `pub use` leaves are exports ([A-133](../../ASSUMPTIONS.md)).

- `members` and `total` on `declare` facts (stage 48). Java: an `enum`'s constants and a `sealed` type's `permits` list (else its nested subtypes); a top-level type is `total` over a closed type when one of its `switch`es has no `default` and its labels name every member, as type patterns or arrow cases used as an expression. Rust: an `enum`'s variants; a `fn`, or an `impl` block's type, is `total` over an enum when a `match` with no wildcard or binding arm names every variant as `Enum::Variant`. Python and Go record neither.
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
- `test/python.test.ts`: a src-layout project with subpackages, relative imports, submodule and module `from` imports, stubs, namespace packages, root order, standard library and third-party names; dynamic, computed and TYPE_CHECKING imports; every declaration form and literal; literal, computed and absent `__all__`; pyproject tables and a malformed manifest; the same facts in any file order. `packages/run/test/python.test.ts` judges two module rules and an `inherits` claim end to end.
- `test/java.test.ts`: a multi-module Maven layout with cross-module, nested, wildcard and static imports; pom fields and a malformed pom; an ambiguous fully qualified name; a syntax error; literal normalisation; the same facts in any file order. `packages/arch/test/java-claims.test.ts` checks `inherits` through `RuntimeException`, and `packages/run/test/java.test.ts` judges two module rules over a hexagonal layout end to end.
- `test/go.test.ts`: a module with `internal/domain`, `internal/adapters/db` and `cmd/shop` packages; grouped, aliased, blank, dot and cgo imports; standard library, external and unresolved local imports; methods on pointer and generic receivers; `iota` constants and literal normalisation; a multi-module `go.work`; a malformed `go.mod` line. `packages/run/test/go.test.ts` judges two module rules over a hexagonal Go layout end to end.
- `test/rust.test.ts`: a two-crate cargo workspace in the mod.rs and 2018 layouts; `#[path]`, use-trees, renames and globs; `super`, `self`, std, external crates and `extern crate`; cross-crate `use`, `[lib]` and `[[bin]]` paths; `pub use` re-exports, constants and supertraits; orphan files, a repository with no `Cargo.toml`, a malformed manifest; the same facts in any file order. `packages/run/test/rust.test.ts` judges two module rules over a hexagonal workspace end to end.

## Known limits

- Languages are known by extension only; a file with no extension, such as a script with a shebang, is not code to CSH.
- Files in a language with no reader yet (C, C++, C#, Kotlin, Scala and others) are skipped facts.
- Python: only the repository root, `src` and package parents are source roots, so `import conftest` from a test directory without `__init__.py` reads as an external package. `requirements*.txt`, `setup.cfg`, `setup.py` and `tool.*` tables are not read. Names re-exported in an `__init__.py` are exports only when `__all__` lists them. Declarations inside top-level `if` or `try` blocks are not read. A base written `mod.Base`, `Generic[T]` or `ABC` leaves an `inherits` claim unknown. The standard library list is Python 3.12's.
- Java: Gradle files, `module-info.java`, and `dependencyManagement` and plugins in `pom.xml` are not read. Same-package type use and inline fully qualified names are not dependencies. Nested and local types are not declared, nor is a `static final` field set to a non-literal. A qualified base (`extends com.x.Base`) leaves an `inherits` claim unknown.
- Go: a local import names the package's non-test files, not its directory. `replace` targets are not followed, and build tags are ignored, so every file is read. Rune, imaginary and negative constants have no value, and an embedded struct gives no base. A sibling module is external unless a `go.work` uses both.
- Rust: a path depends on the deepest module's file, and a re-exported item is not traced to where it is defined. Items made by macros are invisible, `#[cfg]` is not evaluated, and `impl` declares nothing. A file no `mod` reaches skips its `self::` and `super::` paths, and a malformed `Cargo.toml` declares no crate.




