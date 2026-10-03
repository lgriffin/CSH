# Stage 16: Start point

**Exit:** F96, the starter copied to an empty directory outside the repository and installed from packed tarballs,
completes `csh run`. Every command block of the root README is executed in continuous integration. A container with
no example fails the build. Every earlier fixture and both walkthroughs stay green.

**Status:** exit reached. F80 to F96 pass with the 51 earlier fixtures.

## Built

- Local packing, `packages/testkit/src/pack.ts`: every runtime package compiled to JavaScript with declarations in one TypeScript program, staged in a temporary directory with its `package.json` rewritten (exports to `dist/`, workspace dependencies to versions), and packed with `npm pack`. Every packed package keeps its private flag, and no file of the workspace changes ([A-40](../../ASSUMPTIONS.md), [Q-18](../../QUESTIONS.md)).
- What the installed layout needed: `emit` and `run` start their sandbox runners by the extension of their own file (`.ts` in the workspace, `.js` when packed), let the sandbox read the `node_modules` directory the tool is installed in, and find Node's types in the nearest `node_modules/@types`.
- [examples/starter](../../examples/starter): one function, one probe, one sentence, one rule, with its own `package.json`. Its README shows the install outside the repository.
- F96 in the fixture runner: pack the workspace, copy the starter to the system's temporary directory, `npm install` the tarballs there, run the installed `csh run`, and require a stored run record. `BUILT_THROUGH_STAGE` is 16.
- The root README, rewritten around three doors (see it, use it, understand it) and the ladder. Its `sh` blocks are what continuous integration runs: `node packages/testkit/src/triangle.ts readme` executes each in order, replacing the separate type check, test and walkthrough steps, which are now blocks of the README.
- The examples-and-C4 check, `packages/testkit/test/triangle.test.ts`: each example's README lists the containers it exercises under "Containers it exercises"; the test fails when an example lists a container nothing it runs reaches, and when a runtime container has no example.

## The three corners

- C4: the test kit's description in [containers.mmd](../architecture/containers.mmd) names packing and the triangle checks. The context diagram is unchanged, as section 11.2 says.
- Docs: the root README, the starter README, the test kit, emit and run READMEs, the architecture README, [A-40](../../ASSUMPTIONS.md) and [Q-18](../../QUESTIONS.md) as built, `typescript` as a dependency of the test kit in [DEPENDENCIES.md](../../DEPENDENCIES.md).
- Examples: the starter is new; the account and lockout READMEs declare the containers they exercise.

## What moved on the lockout sheet

Nothing.

## Effort

Medium: about 120 lines of packing, 90 of triangle checks and their test, 40 in the fixture runner, 10 in `emit` and
`run`, the starter, and the README. Correction rounds: the first install outside the repository failed its type check,
because emission looked for Node's types at a path fixed relative to the workspace.

## What the fixtures revealed

- F96: a packed package is not enough on its own. Three places in `emit` and `run` assumed the workspace layout: two sandbox runners named by a `.ts` path, the readable paths of the two sandboxes, and the type roots of the emission type check. Each now works out the layout from where its own file is.
- npm resolves every `@csh/*` dependency among the tarballs to the tarball installed beside it; the lock file records `file:` for each, so no `@csh/*` name is fetched from the registry.

## What proved wrong or costly in the documents

- Section 10.4 expected packing through `pnpm pack` and `publishConfig`. Rewriting a staged copy of each `package.json` and packing it with `npm pack` keeps every workspace `package.json` unchanged, and the result is the same tarball ([A-40](../../ASSUMPTIONS.md)).
- Section 10.2's rung 1 needs a specification with no vocabulary; DEPENDENCIES.md records that it emits. The starter starts at rung 3, as section 10.3 says.
- Executing the README's blocks in CI means the README carries the build's commands. The separate CI steps went away, so a failure is reported as a README block.
