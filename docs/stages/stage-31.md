# Stage 31: Python

**Exit:** a `Code` source holding Python is read into module, dependency, declaration, export and manifest facts, and a
module rule and an `inherits` claim are judged against them ([12](../spec/12-polyglot-code.md)).

**Status:** exit reached. `packages/run/test/python.test.ts` runs a profile over a src-layout Python project: the rule
that the domain does not import an adapter is `violated` at `src/app/domain/orders.py:2`, the rule that an adapter does
not import the API is `satisfied`, and the claim that `NotFound` extends `DomainError` is `satisfied`.

## Built

- `facts-code`: the Python reader (`facts-py` 0.1.0), registered in `READERS`. It reads `.py` and `.pyi` files with
  the tree-sitter grammar, and the `project` and `build-system` tables of each `pyproject.toml`
  ([A-130](../../ASSUMPTIONS.md)).
- Dependencies: `import a.b`, `from a.b import c`, relative imports, star imports, and literal
  `importlib.import_module` and `__import__` calls, anywhere in the file. An absolute import resolves against the source
  roots: the repository root, `src`, and the parent of every top-level package, taken in code-point order, the first
  that holds the module winning. `from a.b import c` tries the submodule `a.b.c` before `a.b`. An import that resolves
  to no file is the top-level package it names, or `python:<name>` for one of Python 3.12's standard library modules.
  An import under `if TYPE_CHECKING:` is type-only.
- Declarations at the top level: classes with their first positional base as written, functions (decorated and
  `async` too), assignments (`const` when the name is all capitals or annotated `Final`, else `var`, with the value of
  a string, number or boolean literal), each name an unpacking binds, and `type` aliases.
- Exports: the names a literal `__all__` lists; with no `__all__`, every top-level name not starting with `_`; and a
  `*` export, with its module, for each star import of a package's `__init__.py` that has no `__all__`.
- Anything unresolved is a `skipped` fact: a relative import that lands on no file (`unresolved .gone`), an absolute
  one whose top-level name is a directory or module of the source but which lands on no file (a namespace package's
  directory), a computed dynamic import, and an `__all__` that is not a literal list or tuple of strings.

## What the tests revealed

- A test directory with no `__init__.py` is no source root, so `import conftest` from a sibling test is read as the
  external package `conftest`. Python finds it because the test runner puts the test's directory on the path; CSH
  follows only the roots the layout states.
- web-tree-sitter gives a new node object for each access, so a node is compared by its `id`, not by identity: the
  first version marked no import under `if TYPE_CHECKING:` as type-only.
- The `inherits` claim needed no change. A plain base chains, a root such as `Exception` ends the chain, and a base
  written `Generic[T]` or `abc.ABC` leaves the claim unknown as a qualified base, as a qualified TypeScript base does.

## What proved wrong or costly in the documents

- The plan's "source roots" did not say which root wins when two hold a module. Code-point order puts the repository
  root first, which is what Python does when it is run from the root with `src` installed after it.
- `requirements*.txt` and `setup.cfg` are not read: their dependency lists name what is installed, not what a module
  imports, and no claim needs them yet.

## Effort

About 340 lines of source and 370 lines of tests. Effort was not timed.
