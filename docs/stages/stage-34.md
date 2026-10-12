# Stage 34: Rust facts

**Exit:** a `Code` source with `.rs` files and `Cargo.toml` manifests is read as modules, dependencies, declarations,
exports and manifest fields, and a module rule over a cargo workspace is judged on its `mod` and `use` paths
([12](../spec/12-polyglot-code.md), section 3).

**Status:** exit reached. In a test subject with a hexagonal layout, `forbid(modules("core/src/domain/**"),
modules("core/src/adapters/**"))` is `violated` at `core/src/domain/order.rs:1`, and the same rule for the ports is
`satisfied`, with no warning.

## Built

- `facts-code`: the Rust reader (`rust.ts`), registered in `READERS`, tool `facts-rust` 0.1.0 ([A-133](../../ASSUMPTIONS.md)). It reads in two passes: each file's tree is read into plain data and freed, then the crates and module trees are built and every path is resolved.
  - **Crates.** Each `Cargo.toml` with a `[package]` is a crate rooted at its directory. Its roots are `[lib] path` or `src/lib.rs`, `src/main.rs`, `[[bin]] path`, `src/bin/*.rs` and `src/bin/*/main.rs`, and also `tests/*.rs`, `examples/*.rs`, `benches/*.rs` and `build.rs`, which Cargo compiles as crates too. Its name is `[lib] name`, else `package.name`, with `-` read as `_`. A file belongs to the crate whose directory is the longest prefix of its path. When no manifest declares a package, the repository root is one crate.
  - **The module tree.** From each root, `mod foo;` loads `foo.rs` or `foo/mod.rs`: beside a root, a `mod.rs` or a file loaded by `#[path]`, and inside `a/` for `a.rs`. `#[path = "x.rs"]` is relative to the declaring file's directory. Inline `mod foo { ... }` maps to the file that holds it. A file is placed in the first tree that reaches it: the library's, then the binaries' in order.
  - **Dependencies.** Each `mod foo;` depends on the file it loads, or is skipped as `unresolved mod foo`. Each leaf of a `use` tree depends on the file of the deepest module its path names, or on nothing when that file is the file itself. The leaf forms are `{a, b::{c, d}}`, `a::*`, `x as y` and `self` in a list. Paths may start with `crate::`, `self::`, `super::`, a child module or a top-level item of the current module, `::x`, another workspace crate, `std` (and `core`, `alloc`, `proc_macro`, `test`, as `rust:<name>`) or an external crate, which is named as written. `extern crate x;` depends on x. A `use` inside a function, impl or inline module counts, scoped to its module.
  - **Declarations and exports.** One declaration per top-level item: `struct` (and `union`), `enum`, `trait` with its first supertrait as `base`, `fn` as `function`, `const` and `static` with a literal's value, `type`, `mod` as `module` and `macro_rules!` as `macro`. Integers are written in decimal without suffix or separators, floats as numbers, strings unescaped and booleans as written. A plain `pub` item, a `#[macro_export]` macro and each leaf of a top-level `pub use` is an export; `pub use` carries the path as written in `from`, and a glob is `*`.
  - **Manifests.** `Cargo.toml` fields of the tables `package`, `workspace`, `lib`, `bin`, `dependencies`, `dev-dependencies`, `build-dependencies` and `features`. A malformed one is a `malformed-manifest` diagnostic. It then declares no crate, and its files fall to an enclosing crate, or to the root crate when none is left.
- `facts-code` (`parser.ts`): `parseWith(language, text, read)` replaces `parse` and `parserFor`. A tree is read inside the callback and freed when it returns, since trees live on the WebAssembly heap. The two test callers moved to it.

## What the tests revealed

- **A glob hides an unresolved path unless it is followed.** A crate root almost always has a `pub use x::*` or a `#[cfg(test)] mod tests { use super::*; }`. When any glob counted as "might bring the name in", `crate::nowhere::X` resolved to the root instead of being skipped. A glob is now followed to the files it names. Only a glob of an external crate or of std is taken to bring in any name.
- **`use super::*` in a test module names its own file.** The `tests` module is inline, so `super` is the file that holds it and no dependency is written. A test module therefore never shows as a dependency of its parent.
- **The 2018 uniform path is easy to misread as an external crate.** `use db::Pool` in a crate root names the child module `db`, not a crate `db`. A first segment is checked against the current module's children and top-level items before it is read as a crate name.

## What proved wrong or costly in the documents

- Section 3 of the spec names the module tree's inputs but not a file that no `mod` reaches. Cargo does not compile such a file. It is still read: a `crate::` path in it resolves against its crate's library tree, and a `self::` or `super::` path is skipped, since the file has no place in a tree.
- Section 3 says nothing of Cargo's other targets. Integration tests, examples, benches and `build.rs` are crates of their own, and without them as roots, a `mod common;` in `tests/it.rs` resolves to the wrong directory.
- Which visibility counts as an export was open. Only plain `pub` does. `pub(crate)`, `pub(super)` and `pub(in path)` are not visible outside the crate, so they are not exports.

## Limits

- A path that resolves to a module is a dependency on the file of the deepest module named. An item a module re-exports is not traced to the file that defines it.
- Items made by macros, other than `macro_rules!` definitions themselves, are not seen. A path to such an item under `crate::`, `self::` or `super::` is skipped.
- `#[cfg]` is not evaluated: a `#[cfg(test)]` or platform-gated item is read like any other.
- `impl Trait for Type` declares nothing, so an `inherits` claim for a struct finds no base. A trait's base is its first supertrait as written, without type arguments.
- A `#[path]` inside an inline module is resolved relative to the file's directory plus the inline module names. rustc's rule for non-`mod.rs` files differs.

## Effort

About 450 lines of source and 340 lines of tests. Effort was not timed.
