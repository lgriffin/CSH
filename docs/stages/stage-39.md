# Stage 39: Rules that can be stated

**Exit:** the rules the runs could not state are stated and judged: transitive imports, value imports, cycles, counts
of modules and the tool and package fields of `package.json`, and a mistyped `forbid` target is visible
([13](../spec/13-from-real-runs.md), section 2; [issue 66](https://github.com/lgriffin/CSH/issues/66), section 2).

**Status:** exit reached on F131 and the unit and property tests in `packages/arch/test/reach.test.ts`.

## Built

- `kernel`: `forbid` takes `reaches`, a `modules` selector takes `values`, a new rule `acyclic` with an optional
  `group`, and a new proposition `count-modules`; each is validated by shape.
- `csl`: `forbid(a, b, { reaches: true })`, `modules(globs, { values: true })`, `acyclic(sel, { group })`, and
  `count(modules(...), n)` beside `count(file, pointer, n)`.
- `arch`: chains breadth first ([A-142](../../ASSUMPTIONS.md)); type-only dependencies dropped for a `values`
  subject, and cycles by strongly connected components ([A-143](../../ASSUMPTIONS.md)); counts of modules
  ([A-144](../../ASSUMPTIONS.md)); the note `target-selects-nothing` ([A-145](../../ASSUMPTIONS.md)). A violation
  of `reaches` or `acyclic` is one reason per chain or cycle, its steps in order with their files and lines.
- `facts-ts`: `packageManager`, `dependencies`, `devDependencies` and `workspaces` are fields.

## What the fixture revealed

- Two claims about one count are a claim-conflict, and both members of a claim-conflict are `conflicting`, so a
  refuted count that another claim contradicts reads as conflicting rather than violated. The fixture checks the
  refuting detail on a third claim ("not four") that the facts decide alone.
- A fixture's TypeScript is type-checked with the repository's settings, so an import of a package the repository does
  not install (the database driver) cannot be in it; the chain ends at the project's own database client instead.

## Left open

- dependency-cruiser's `no-cross-workspace-relative-import` needs the import as written, which no fact keeps.
