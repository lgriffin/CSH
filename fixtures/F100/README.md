# F100

An import breaks a `forbid` rule: `core` imports `ui`, a package of the `web` container, which `CoreIgnoresWeb` forbids.
The rule is `violated`, and the import's file and line, `packages/core/src/price.ts:2`, is the witness. `WebSeesCoreAndDb`
holds: the facts are current and none breaks it. The diagram draws the `core` to `web` dependency nowhere, which is a
gap and not this rule's business. Next layers, sections 4.1 to 4.3 and 9; exit of stage 18.

The fixture is written before the code of its stage, from [10](../../docs/spec/10-next-layers.md); the runner reports it as pending until that stage is built.
