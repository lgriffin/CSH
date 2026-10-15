# F181

File mentions that are not claims about this tree ([17](../../docs/spec/17-from-the-tutors-run.md), section 5; stage
61). Each document holds one kind of mention.

- `docs/ellipsis.md`: `tests/bdd/steps/...` and `packages/svelte/…` are placeholders, not paths.
- `docs/elsewhere.md`: `scripts/fetch-migrations.sh` is named in a sentence that names another repository,
  tutors-sdk/tutors-release-harness, whose first segment is no top-level entry here. It is unchecked.
- `docs/branches.md`: `release/16.3.0` and `release/v16.2.2` end in a version, so they are branch names, not paths.
- `docs/retired.md` and `docs/optional.md`: each sentence says its file is absent, retired or optional and not
  committed, so neither file being missing is a gap.
- `apps/reader/README.md`: `tests/e2e/` names nothing from the root, and names `apps/reader/tests/e2e/` from the
  document's own directory.
- `docs/missing.md`: `scripts/build.sh` exists, and `scripts/publish.sh` does not. That is the only dangling reference.

The expected result was written from the specification before the code.
