# F107

A type-only import, `import type` of `ui` from `core`, is counted as a dependency and flagged (A-74): it breaks
`CoreIgnoresWeb` like any other import, and the witness says it is type-only. Next layers, sections 4.2 and 9;
section 10, type-only imports; exit of stage 18.

The fixture is written before the code of its stage, from [10](../../docs/spec/10-next-layers.md); the runner reports it as pending until that stage is built.
