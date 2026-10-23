# F219

Outputs named after a test file ([21](../../docs/spec/21-test-suites-as-evidence.md), section 3; stage 71, A-267), as
TypeScript's fourslash baselines are.

The reference trees `fourslash` and `api` have no namesake case directory, so stage 70 left their outputs unpaired.
Each output whose name begins with a test file's stem less its affix is named after that test file:

- `findAllRefs/ambient.baseline.jsonc` after `internal/fourslash/tests/ambient_test.go`, and
  `findAllRefs/ambientVS.baseline` after `ambientVS_test.go`, the longer stem winning;
- `api/encode.txt` after `src/encode.spec.ts`.

`rename/shared.baseline.jsonc` names a stem two test files share (`internal/a/shared_test.go` and
`src/shared.test.ts`), and `rename/nothing.baseline.jsonc` names no test file, so both stay `unpaired-outputs`, each
saying why.

The expected result was written from the specification before the code.
