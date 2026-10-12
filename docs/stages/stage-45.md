# Stage 45: From the Java and Python runs

**Exit:** the owner's three reproductions (B1, B2, B3) report what their documents say; a rule finer than the facts
is unknown; the overview shows `target-selects-nothing`; every existing profile and fixture reports what it did before,
except where [14](../spec/14-from-the-java-and-python-runs.md) changes it.

**Status:** exit reached. F140 to F142 pass, and each failed against `main` before the change.

## Built

- `facts-code` (`java.ts`): every type in a type's body is declared under its dotted name, `Runner.Callback`, at any
  depth, with its base and its `static final` literals; types in method bodies and anonymous classes are not. Nested
  types are never exported. An import of a nested type lands on the file that declares it ([A-170](../../ASSUMPTIONS.md)).
- `facts-code` (`python.ts`): a class defined directly in a class body is declared as `Outer.Inner`; one inside a
  function is not; neither is exported (A-170).
- `witness`, `facts-code`, `check`: a `depends` fact on a dotted namespace carries `namespace: "dotted"`; Java sets it
  on a package not read, Python on every external package; the check passes it to `arch` (A-171).
- `arch` (`selects`): a glob ending in `.*` or `.**` selects a dotted namespace named before it, never a path or an
  npm name (A-171).
- `arch` (`evaluateRule`): a `forbid` whose target names part of an external name a selected module depends on, and an
  `only` whose offending dependencies are all on names an allowed glob refines, are unknown with `finer-than-facts`,
  naming the globs, the name and the first three dependencies; a reaching `forbid` checks every namespace it reaches,
  exceptions remove a finer glob, and an unread file is reported first (A-172).
- `check` (`overview`): a satisfied obligation carrying `target-selects-nothing` is the converged kind of that name
  (A-173).
- `adapter-items` (`tests`): `results-missing` names the first ten files (A-174).

## Fixtures

F140 (Java nested types), F141 (Java dotted externals) and F142 (Python) were written by a separate agent from spec 14,
spec 12, the A rows and the guide, without reading the readers or `arch`. They passed on their first run against the
change. The agent noted four places where the documents were thin: the verdict of a refuted `declares` claim (the
guide says `violated`), what an `only`'s `finer-than-facts` reason names, whether a reason quotes the glob as written,
and that no `run` fixture can check the overview, which a unit test in `packages/check` covers instead.

## Not done

- A-170 to A-172 are decided by the owner ([Q-40 and Q-41](../../QUESTIONS.md)).
- Go and Rust: a Go import path and a Rust crate are not dotted names, so neither rule applies to them; Go has no
  nested types, and Rust's nested items are modules, already declared.
- The `csh init --subject` and `csh subject fetch` findings from the same run are fixed in stage 46.
