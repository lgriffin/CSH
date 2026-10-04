# F111

The change edits the implementation, \`src/lockout.ts\`, and the test the harness runs, \`test/lockout.test.ts\`, and
nothing else: the lockout regression's pattern. The diff observes \`implementation-and-tests-changed-together\` and
\`spec-untouched\`, as plain statements about the change and never as a verdict, and marks the \`tdd\` practice's input as
changed. The changed paths are given in \`inputs/changes.json\`, as \`csh diff\` reads them from git. Next layers,
sections 5.1 and 9; exit of stage 19.

The fixture is written before the code of its stage, from [10](../../docs/spec/10-next-layers.md); the runner reports it as pending until that stage is built.
