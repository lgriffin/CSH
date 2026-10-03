# @csh/gate

## Purpose

`@csh/gate` turns a report, a snapshot and the valid waivers into a gate decision (csh-gate/v1): a disposition of allow, review, block or waived for each approved obligation, and an overall result. A decision is bound to the digest of its snapshot and is refused for any other.

## Where it sits

It is the "Gate" container, shown in the [containers diagram](../../docs/architecture/containers.mmd). Its components (snapshot builder, staleness checker, disposition table, decision writer) are in [components-gate.mmd](../../docs/architecture/components-gate.mmd). It runs in the main process, called by `csh gate`.

## Public interface

- `gate(input)`, `GateInput`: compute a `GateDecision` from a report, snapshot, mode, waivers and the snapshot commit date.
- `GateDecision`: snapshot digest, mode, overall result, one row per approved obligation, invalid ledger entries, and the candidates that never block.
- `Snapshot`, `snapshotDigest(s)`: commit, module digest, ledger head, configuration digest, lock digest and tool versions, and their digest.
- `Disposition`, `Mode`: `allow`, `review`, `block`, `waived`; `advisory` or `enforcing`.
- `Waiver`, `waiverValid(w, commitDate)`: a waiver from the ledger and whether it is valid on the snapshot commit date.
- `acceptDecision(d, current)`: refuse a decision whose snapshot digest differs from the current snapshot.
- `exitCode(d)`: non-zero only for an overall block in enforcing mode.
- `formatDecision(d)`: the decision as stable JSON.

## Depends on and used by

- Depends on: `@csh/kernel` (`digestJson`, `stableJson`) and `@csh/check` (the `Report` and `Assessment` types). `@csh/ledger` is listed in `package.json`, but no source file imports it; `@csh/cli` converts ledger waivers into `Waiver` records. No external packages.
- Used by: `@csh/cli` (`csh gate` and `csh gate --verify`) and `@csh/testkit` (fixtures F44 and F45).

## Invariants it protects

- A decision names its snapshot digest, and `acceptDecision` refuses it for any other snapshot (P5, CSH-010).
- Only approved obligations are gated; candidate obligations and findings with a candidate member are listed under `candidates` and never block (P1).
- A waiver changes the disposition to `waived` and leaves the verdict `violated` in the row; a waived obligation makes the overall result `review`, not `allow` (P9, CSH-013).
- A waiver counts only at the obligation's current digest, within its scope (the obligation or one of its findings), and through its expiry date compared with the snapshot commit date, never the wall clock (P5, P8, CSH-013).
- In advisory mode nothing blocks: what enforcing mode would block becomes `review` with `recommends: "block"` (P7, CSH-011).
- An unknown or stale obligation is `review`; only a critical policy in enforcing mode makes it `block` (P3, P7).
- A self-approved obligation that needs review cannot be `allow` (P6).
- The gate rewrites no verdict; it reads verdict and applicability from the report (P2).

## Rationale

`csh check` never blocks; only the gate does ([ADR-11](../../docs/adr/ADR-11-check-never-blocks.md)). Disposition is a separate axis from verdict, applicability and authority ([ADR-10](../../docs/adr/ADR-10-four-axes.md)). Candidates never change an approved obligation's result ([ADR-28](../../docs/adr/ADR-28-candidates-never-block.md)). The fields `recommends`, `because` and `candidates` are extensions ([ADR-22](../../docs/adr/ADR-22-report-extensions-and-json.md), [A-01](../../ASSUMPTIONS.md)). Waiver expiry is inclusive and judged by the commit date so that a decision replays ([A-29](../../ASSUMPTIONS.md)).

## How it is tested

- `test/gate.test.ts`: the disposition table in both modes; advisory mode records what enforcing would do; candidates are ignored and listed; a waiver applies until it expires, judged by commit date and by date only; a waiver at another digest does not apply; a finding-scoped waiver applies only to that finding's obligation; a decision for another snapshot is refused.
- `packages/cli/test/cli.test.ts`: `csh gate` decides for the current snapshot and refuses a decision for a later commit.
- Fixtures: F44 (a valid waiver on one violated obligation), F45 (a decision presented for another snapshot).

## Known limits

- The staleness checker drawn in the gate's component diagram is implemented in `@csh/check` (`evidence.ts`) and `@csh/cli` (`project.ts`): the gate reads each assessment's applicability and does not compare dependency digests itself. `csh gate` refuses a report whose snapshot digest differs from the current snapshot.
- The gate has no notion of partial delivery; `overall` is the worst disposition.
- A snapshot from a working tree with uncommitted changes carries the commit `HEAD-dirty` ([A-16](../../ASSUMPTIONS.md)).
