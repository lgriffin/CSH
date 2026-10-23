# F192

A name a package's own document gives in backticks ([20](../../docs/spec/20-symbols-and-task-runners.md), section 1;
stage 67).

`src/format/README.md` names, in backticks:

- `buildRulesMap()` and `FormatSpan`, which modules under `src/format` declare: they resolve.
- `SourceFile`, which `src/ast/node.ts` declares, outside the package: unchecked.
- `TutorsShell`, the name of `src/ui/TutorsShell.svelte`: unchecked.
- `oldHelper`, in a sentence that says it was removed: unchecked.
- `createRulesMap` and `ReadDirectoryChangesW`, which no code declares: undecided, one indeterminate entry for the
  document.
- `fencedName` in a fence, and the one-word `Format` and `rules`: not read.

`src/format/CHANGELOG.md` is a change log and the root `README.md` is at the root. `docs/guide.md` is in a directory
that holds no module and no manifest; the code under it, `docs/tools/build.ts`, is a tool's, not the package the guide
describes. None of their names is read.

The expected result was written from the specification before the code.
