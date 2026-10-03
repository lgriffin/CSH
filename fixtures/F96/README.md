# F96

The starter, `examples/starter`, is copied to an empty directory outside the repository and installed from tarballs
made by `pnpm pack`. `csh run` completes on it: the harness runs its tests, the check and the gate run, and a run
record is stored. Nothing is published ([ADR-32](../../docs/adr/ADR-32-local-only-distribution.md)). Anchor, harnesses
and A3, sections 10.3 and 10.4 ([09](../../docs/spec/09-anchor-harness-a3.md)); exit of stage 16.
