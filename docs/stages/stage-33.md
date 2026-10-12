# Stage 33: Go facts

**Exit:** a Go module's imports, declarations, exports and `go.mod` fields are facts, and a module rule over a
hexagonal Go layout is judged as one over TypeScript is ([12](../spec/12-polyglot-code.md)).

**Status:** exit reached. In `packages/run/test/go.test.ts`, `forbid(modules("internal/domain/**"),
modules("internal/adapters/**"))` is `violated` at `internal/domain/order.go:3`, and
`forbid(modules("internal/**"), modules("cmd/**"))` is `satisfied`. Both are read in the adapter sandbox at the
subject's pinned commit.

## Built

- `facts-code`: the Go reader (`go.ts`), registered in `READERS` as tool `facts-go` 0.1.0 ([A-132](../../ASSUMPTIONS.md)).
  - One module fact per `.go` file, test files included, with `language: "go"`.
  - One dependency per import spec: single, grouped, aliased, `_` and `.` imports.
    - An import under the module path of the nearest enclosing `go.mod` is local. So is one under the path of another
      module that a `go.work` uses alongside the file's own module.
    - A local import names each non-test file of the package directory. If the directory holds only test files, it
      names those.
    - A local import whose directory holds no file read is a `skipped` fact (`unresolved <import>`).
    - A path whose first element has no dot is the standard library, written as `go:<path>`. This includes `go:C`.
      Any other import path is written as it is.
  - Top-level declarations:
    - `function`, and `method` as `Type.Method`. A pointer or generic receiver is reduced to its type name.
    - `struct`, `interface`, and `type` for any other type definition or alias.
    - `const` with the value of a single basic literal, and `var`.
  - Every capitalised name is exported. A method is exported only when its type is exported too. A type's export is
    `typeOnly`, as an interface's is in TypeScript.
  - `go.mod` and `go.work` are parsed by hand into fields:
    - `/module`, `/go` and `/toolchain`.
    - `/require/<path>`, with `/indirect/<path>` for `// indirect`.
    - `/replace/<old>` = `new [version]`.
    - `/exclude/<path>`, `/retract/<i>`, `/tool/<i>`, `/ignore/<i>` and `/godebug/<key>`.
    - `/use/<i>` from `go.work`.
    - An unknown directive is a `malformed-manifest` warning at its line. The rest of the file is still read.

## What the tests revealed

- **A directory is not selected by its own `**` glob.** `matchesGlobs("internal/db", ["internal/db/**"])` is false,
  because the glob becomes `^internal/db/.*$`. A dependency on the package directory would therefore escape
  `forbid(..., modules("internal/db/**"))`. So the reader names the package's files, one dependency per file, sorted.
  This also keeps every dependency's `to` a module the facts name, which an `only` rule needs. The kernel is unchanged.
- **tree-sitter's field lists include punctuation.** `childrenForFieldName("name")` on `const a, b = ...` also returns
  the comma. Names are filtered to identifiers.
- **Go octal literals.** A Go literal such as `017` is octal, which `Number` reads as decimal. Integers are therefore
  normalised with `BigInt`, which also keeps 64-bit constants exact.

## What proved wrong or costly in the documents

- The spec's table says a local import "is the package directory". It is the package directory's files, for the glob
  reason above.
- Go has no inheritance. An embedded struct field is not a `base`, so an `inherits` claim about a Go type has no chain
  to follow.
- A `replace` that points to a local directory is recorded as a field, but imports are not resolved through it.

## Effort

About 290 lines of source and 380 lines of tests. Effort was not timed.
