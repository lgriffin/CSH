# F230

A path written from a package's own directory, found by seeding drift into the taskboard ([22](../../docs/spec/22-analysis-a3-and-1.0.md),
section 4; stage 80). The repository's top level holds `typescript/` and `java/`, and neither `src/` nor `schema/`.

- `typescript/README.md` names `src/app.ts`, which exists beside it.
- It names `src/events/handlers.ts`, which does not, though `typescript/src/` does: written from the package's
  directory, it is a dangling reference (A-288).
- It names `schema/task.json`, and no `schema/` exists at the root or beside it: another repository's path, unchecked.
- `java/README.md` names `src/main/Handlers.java`, and `java/` holds no `src/`: unchecked, not dangling.

The expected result was written from the specification before the code existed.
