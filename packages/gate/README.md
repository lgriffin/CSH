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

- Depends on: `@csh/kernel` (`digestJson`, `stableJson`) and `@csh/check` (the `Report` and `Assessment` types). For its evaluation as a component only, `@csh/harness` (the probe) and `csl` (the specification), as development dependencies. `@csh/ledger` is listed in `package.json`, but no source file imports it; `@csh/run` converts ledger waivers into `Waiver` records. No external packages.
- Used by: `@csh/run` (every evaluation and run), `@csh/cli` (`csh gate`, `csh gate --verify` and `csh run`) and `@csh/testkit` (fixtures F44 and F45).

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
- `packages/cli/test/cli.test.ts`: `csh gate` decides for the current snapshot and refuses a decision for a later commit or a forged one.
- Fixtures: F44 (a valid waiver on one violated obligation), F45 (a decision presented for another snapshot).
- The gate is also the harness's first real component ([09](../../docs/spec/09-anchor-harness-a3.md), section 8). [csh/component.json](csh/component.json) names two practices: the disposition table as seven EARS sentences in [docs/requirements.md](docs/requirements.md), and the unit tests, whose probe in `test/gate.probe.ts` records each call to `gate` as a witness of the event `Decide` ([A-49](../../ASSUMPTIONS.md)). [spec/gate.csl.ts](spec/gate.csl.ts) holds the model, the table's rows as predicates citing the sentences, and the bindings ([A-48](../../ASSUMPTIONS.md)). Every one of them is a candidate. `csh run --root packages/gate` evaluates it; its first run is the first stage of the A3 in [csh/a3/dispositions](csh/a3/dispositions/a3.md), whose judged sections are the gate owner's to write, and `packages/cli/test/a3.test.ts` checks that the committed sheet matches its stage record.

## Known limits

- The staleness checker drawn in the gate's component diagram is implemented in `@csh/check` (`evidence.ts`) and `@csh/run` (`project.ts`): the gate reads each assessment's applicability and does not compare dependency digests itself. `csh gate` computes the report it decides on, rather than reading one from disk ([A-34](../../ASSUMPTIONS.md)).
- The gate has no notion of partial delivery; `overall` is the worst disposition.
- The probe's cases repeat those of `test/gate.test.ts`, and nothing checks that the two copies agree ([Q-20](../../QUESTIONS.md)).
- A snapshot from a working tree with uncommitted changes carries the commit `HEAD-dirty` ([A-16](../../ASSUMPTIONS.md)).
