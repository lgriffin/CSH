# 14. What the Java and Python runs asked for

Leigh ran CSH over two mature projects of their own, one Java (Maven) and one Python, on 12 October 2026 (stage 37,
the owner's reference projects). The run found three places where CSH reported something wrong or reported nothing,
and one message that left work to the reader. This document turns them into stage 45. Each section states the
behaviour that the stage's golden fixtures are written from. Where a choice is open, the choice taken is named and
recorded in `ASSUMPTIONS.md` with its question in `QUESTIONS.md`.

Nothing here changes CSH's three outcomes. A rule CSH cannot decide from what the facts record is indeterminate, never
held.

## 1. Nested types are declared (B1)

A `declares` claim about a type nested in another was a `fact-conflict`. The Java reader declared only top-level types,
so `ClaudeCliService.java declares StreamingCallback` failed though the interface is declared inside that class.

- **Java.** Every class, interface, enum, record and annotation declared in a type's body is declared by its file,
  at any depth, under its dotted name from the top-level type: `Runner.Callback`, `Runner.Callback.Kind`. It carries
  its base as a top-level type does. A `static final` field of a nested type with a literal value is a constant named
  `Runner.Callback.LIMIT`, as a top-level type's is `Runner.LIMIT`. A type declared inside a method, a constructor, an
  initializer or an anonymous class body is not declared. Exports are unchanged: only public top-level types.
- **Python.** A class defined directly in a class body is declared as `Outer.Inner`, at any depth, with its first
  base. A class defined inside a function is not declared. Exports are unchanged.

The dotted name is the one a reader of the code writes, and it follows how Go methods (`Type.Method`) and Java
constants (`Type.FIELD`) are already declared. A claim on a nested type therefore names it as `Outer.Inner`
([Q-40](../../QUESTIONS.md)).

## 2. A dotted external name covers its members (B2, B3)

An external dependency is named as its ecosystem names it ([12](12-polyglot-code.md), section 3): a Java package
(`java.sql`), a Python top-level package (`PySide6`). A rule forbidding `modules("java.sql.*")` selected nothing,
because `*` needs at least one more character after `java.sql.`. The rule held while 29 files imported
`java.sql.SQLException`. A rule forbidding `PySide6.*` held the same way while a core module imported
`PySide6.QtCore`.

- **A package covers its members.** A selector glob that ends in `.*` or `.**` also selects a dependency on the
  dotted namespace named before that suffix. So `modules("java.sql.*")` selects the dependency `java.sql`, and
  `modules("PySide6.*")` selects `PySide6`. An `except` glob still removes what it matches
  ([Q-41](../../QUESTIONS.md)).
- **Which names are namespaces.** A reader marks a dependency whose target is a dotted namespace, one whose members
  are named `<target>.<member>`, as `namespace: "dotted"` on its `depends` fact. The Java reader marks a package that
  was not read, and the Python reader every external and standard library package. An npm name is never marked, since
  `lodash.debounce` is a package of its own and no part of `lodash`. So the rules here are stated without any
  language, and the language is known only to the reader that marks the fact.
- **Finer than the facts is indeterminate.** A dependency on a dotted namespace `n` is one the facts record whole.
  When a rule's glob names something under `n` (its text before the first `*` or `?` starts with `n.`) and the rule's
  exceptions do not remove it, CSH cannot tell whether the code uses that part of `n`.
  - A `forbid` rule whose target is such a glob, and which no dependency violates, is unknown when a module it selects
    depends on `n`, or, with `reaches`, reaches a dependency on `n`. The reason is `finer-than-facts`, naming the
    selector and `n` and giving the dependency's file and line.
  - An `only` rule is unknown in the same way when its only offending dependencies are on names that one of its
    allowed globs is finer than. A dependency no allowed glob covers or refines still violates it.

  For example, `forbid(modules("app/core/**"), modules("PySide6.QtWidgets"))` over a module that imports
  `PySide6.QtCore` is unknown, since the facts record `PySide6`. It is not held.
- A file that was not read is reported before a finer glob: a rule over an unread file stays unknown with `not-read`.

## 3. A target that selects nothing is shown in the overview

Stage 39 added the reason `target-selects-nothing` to a `forbid` whose target selects nothing the facts know
([13](13-from-real-runs.md), section 2). The reason reached the report but not the overview, so the owner's run
saw a converged rule and nothing else. A satisfied obligation whose assessment carries that reason is now its own
converged kind in the overview, `target-selects-nothing`, with the reason as its detail. So its count shows in
`csh overview`'s summary, beside `satisfied`, and the entry shows in the sheet, in `--json` and for `--signal`.

## 4. Missing results name their files (B4)

`N test files declare tests and have no result` named none of them. The diagnostic's message now lists the first ten
paths in code-point order, followed by `and k more` when there are more.

## 5. Stage 45

**Exit:** the owner's three reproductions (B1, B2, B3) report what their documents say. A rule finer than the facts is
unknown. The overview shows `target-selects-nothing`. Every existing profile and fixture reports what it reported
before, except where these sections change it.

Out of scope here, and handed to the stages that own the code: `csh init --subject` proposing a tracked virtual
environment and its speed on large repositories, and a Windows rename failure in `csh subject fetch`.
