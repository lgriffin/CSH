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
- [Stage 11: Harness](stage-11.md)
- [Stage 12: Scenario adapter](stage-12.md)
- [Stage 13: Divergence](stage-13.md)
- [Stage 14: A3](stage-14.md)
- [Stage 15: Anchor](stage-15.md)
- [Stage 16: Start point](stage-16.md)
- [Stage 17: Authority](stage-17.md)
- [Stage 18: Checked C4](stage-18.md)
- [Stage 19: Change review](stage-19.md)
- [Stage 20: Agent interface](stage-20.md)
- [Stage 21: Subject profiles and runs without a model](stage-21.md)
- [Stage 22: Items and edges](stage-22.md)
- [Stage 23: Code facts](stage-23.md)
- [Stage 24: Structural claims](stage-24.md)
- [Stage 25: History](stage-25.md)
- [Stage 26: Test results](stage-26.md)
- [Stage 27: Scale and the overview](stage-27.md)
- [Stage 28: The ESI.ts profile and its A3](stage-28.md)
- [Stage 29: Language seams](stage-29.md)
- [Stage 30: Results from JUnit XML and go test -json](stage-30.md)
- [Stage 31: A Python reader](stage-31.md)
- [Stage 32: A Java reader](stage-32.md)
- [Stage 33: A Go reader](stage-33.md)
- [Stage 34: A Rust reader](stage-34.md)
- [Stage 35: Test inventory for pytest, JUnit, Go and Rust](stage-35.md)
- [Stage 36: Polyglot profiles](stage-36.md)
- [Stage 38: A proposed profile and coverage in every run](stage-38.md)
- [Stage 39: Rules that can be stated](stage-39.md)
- [Stage 40: Warm runs and history clones](stage-40.md)

Stages 10 to 16 build the anchor design ([09](../spec/09-anchor-harness-a3.md)): a component to anchor on, harnesses,
runs and the A3. Their fixtures, F80 to F96, were written before any of their code, and the fixture runner reports
each one as pending until its stage is built (`BUILT_THROUGH_STAGE` in `packages/testkit/src/runner.ts`).


Stages 17 to 20 build the next layers ([10](../spec/10-next-layers.md)): authority made real, the C4 diagrams as a
checked source, change review and an agent interface. Their fixtures, F97 to F117, were written before any of their
code, and are reported as pending until their stage is built.

Stages 21 to 28 make CSH ingest a real git codebase ([11](../spec/11-ingesting-a-codebase.md)), with ESI.ts as the
subject throughout. Its profile is [subjects/esi-ts](../../subjects/esi-ts).

Stages 38 to 44 answer what Leigh's runs over six TypeScript repositories asked for ([13](../spec/13-from-real-runs.md),
[issue 66](https://github.com/lgriffin/CSH/issues/66)). Their fixtures start at F130.
