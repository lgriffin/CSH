# F189

A file the reader is told to create is not missing ([19](../../docs/spec/19-from-the-typescript-run.md), section 1;
stage 63).

- `docs/guide.md` tells the reader to create `tests/cases/myTest.ts` and a new file `tests/fourslash/myTest_test.go`,
  says the build writes `tests/out/report.json`, and that the reader can touch `tests/cases/.keep`. None of them is
  tracked, and none is a dangling reference.
- `docs/missing.md` names four missing files that are claimed to be there: `tests/cases/settings.json`, which the
  runner reads; `config/local.example.yaml`, the source of a copy; `tests/cases/legacy.ts`, which "we created"; and
  `tests/cases/generated.ts`, which the reader is told not to touch.
  The copy's target, `config/local.yaml`, is made by the sentence, so it is not in the detail.

The expected result was written from the specification before the code.
