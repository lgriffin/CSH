# Stage notes

One note per stage (Architecture tab, section 6): what was built, the effort, what the fixtures revealed, and anything in the documents that proved wrong or costly. This is the Lean review the main tab requires.

- [Stage 1: Semantic contract](stage-1.md)
- [Stage 2: Language](stage-2.md)
- [Stage 3: Specification checks](stage-3.md)
- [Stage 4: Lifting](stage-4.md)
- [Stage 5: Joint evaluation and gap view](stage-5.md)
- [Stage 6: Evidence](stage-6.md)
- [Stage 7: Authority and invalidation](stage-7.md)
- [Stage 8: Composition](stage-8.md)
- [Stage 9: Gate](stage-9.md)
- [Stage 10: Component and run](stage-10.md)

Stages 10 to 16 build the anchor design ([09](../spec/09-anchor-harness-a3.md)): a component to anchor on, harnesses,
runs and the A3. Their fixtures, F80 to F96, were written before any of their code, and the fixture runner reports
each one as pending until its stage is built (`BUILT_THROUGH_STAGE` in `packages/testkit/src/runner.ts`).

