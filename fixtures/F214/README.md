# F214

Python mirrored directories and syrupy snapshot directories ([21](../../docs/spec/21-test-suites-as-evidence.md),
section 2; stage 70).

- `tests/data` holds `input` and `expected`. `page.json` has `page.html`. `menu.json` has no expected page:
  `unaccepted-case`, indeterminate (Q-85). `footer.html` has no input: `orphan-output`. One of two cases converges.
- `tests/__snapshots__/test_render.ambr` names `tests/test_render.py`, which exists. `test_removed.ambr` names
  `tests/test_removed.py`, which does not: `orphan-output`. Its entries are read in stage 71.

The expected result was written from the specification before the code.
