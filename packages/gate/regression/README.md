# The gate's regression

Not part of the gate. These two files replace `src/gate.ts` and `test/gate.probe.ts` in a scratch copy of the gate
component, never in the repository ([A-78](../../../ASSUMPTIONS.md), [Q-22](../../../QUESTIONS.md)). Together they
reread "unknown never blocks" as "unknown is allowed": the code returns `allow` for an unknown or stale verdict under a
policy that is not critical, and the probe's two cases are edited to expect it, so the probe's tests stay green. It is the lockout regression's pattern
applied to the gate ([10](../../../docs/spec/10-next-layers.md), section 3.2).

`packages/testkit/test/gate-job.test.ts` copies the component into a scratch repository, approves its rules and bindings
with a test-only key, and runs the CI gate job, `.github/scripts/gate-job.sh`: the job passes in the approved state and
fails once this regression is committed, because the witness of the edited case breaks `ReviewUnknown` (GATE-005).
