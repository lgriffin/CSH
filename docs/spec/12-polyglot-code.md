# 12. Polyglot code

CSH reads a codebase as facts: its modules, what each depends on, what each declares and exports, and the fields of
its manifests ([11](11-ingesting-a-codebase.md), stages 23 and 24). Until stage 29 only TypeScript and JavaScript were
read, so in a repository with Python, Java, Go or Rust a layering rule had nothing to judge, a claim about the code
came back not read, and the tests were not counted. This document extends the facts to those four languages, without
changing anything the facts are judged by.

## 1. What stays the same

- **The hexagon.** The kernel, the check engine, the architecture rules and the gate gain no language and no parser
  ([ADR-16](../adr/ADR-16-hexagonal-monolith.md)). Every language is read by an adapter in the isolated subprocess,
  and only its facts cross into the core.
- **The fact format.** `csh-facts/v2`: `module`, `depends`, `export`, `declare`, `field` and `skipped`. Declaration
  kinds widen; nothing else changes shape.
- **The outcome.** Every rule and claim lands converged, gap or indeterminate. A file CSH cannot read is a skipped fact,
  so what depends on it is indeterminate, never silently satisfied.
- **No installation.** Facts depend on the source files alone. No interpreter, compiler, build tool or package manager
  of the subject's language runs.

## 2. Parsing

Each language other than TypeScript and JavaScript is parsed with its tree-sitter grammar, loaded as WebAssembly in the
adapter sandbox (`web-tree-sitter`), as the solver loads Z3. A file is parsed alone; resolution between files uses only
the files the source names.

## 3. Per language

| Language | Module | Dependencies resolve against | Declares | Exports | Manifests |
| --- | --- | --- | --- | --- | --- |
| Python | each `.py` and `.pyi` file | source roots (the root, `src`, and the parent of every top-level package); relative imports | classes with their first base, functions, constants | `__all__`, else every public top-level name | `pyproject.toml` |
| Java | each `.java` file | fully qualified names across source roots, from each file's `package` | classes with their superclass, interfaces, enums, records, annotations, `static final` literals | public top-level types | `pom.xml` |
| Go | each `.go` file | `go.mod`'s module path; a local import is the package directory | types, structs, interfaces, functions, methods, constants | capitalised names | `go.mod` |
| Rust | each `.rs` file | `mod` declarations and `crate::`, `self::` and `super::` paths; workspace crates | structs, enums, traits, functions, constants, statics, modules, macros | `pub` items and `pub use` | `Cargo.toml` |

An external dependency is named as the ecosystem names it: a Python top-level package, a Java package, a Go import
path, a Rust crate. A standard library dependency is prefixed with its language (`python:os`, `go:fmt`, `rust:std`),
as Node's built-ins are (`node:fs`). Java's standard packages (`java.*`, `javax.*`) are named as written.

## 4. Tests and results

Test files in each language are inventoried as TypeScript's are, and their names cite requirement identifiers: pytest
functions and classes, JUnit methods and display names, Go `TestXxx` functions and Rust `#[test]` functions. Runner
results are read from JUnit XML, which pytest, Maven Surefire, Gradle and cargo-nextest write, and from
`go test -json`, into `csh-results/v1`.

## 5. Stages

1. **Stage 29: language seams.** `@csh/facts-code` dispatches `Code` sources by extension; widened declaration kinds;
   skipped facts for languages with no reader. *Exit:* every existing profile reports what it reported before, and a
   Python file in a `Code` source is a skipped fact.
2. **Stage 30: results from other runners.** JUnit XML and `go test -json`.
3. **Stage 31: Python facts.**
4. **Stage 32: Java facts.**
5. **Stage 33: Go facts.**
6. **Stage 34: Rust facts.**
7. **Stage 35: test inventory** for pytest, JUnit, Go and Rust.
8. **Stage 36: polyglot profiles**, one pinned public subject per language, run in CI.
9. **Stage 37: the owner's reference projects**, read on the owner's machine.
