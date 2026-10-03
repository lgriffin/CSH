// Unit tests of the check engine's own rules: witness judging, verdict order, methods, gap view
// and comparability, on the account model (emitted from fixtures/base/account-evidence.csl.ts).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Module } from "@csh/kernel";
import { createZ3Solver, type SolverPort } from "@csh/solver";
import type { Witness } from "@csh/witness";
import { type AuthorityResolver, check, type Report, type SourceRun } from "../src/index.ts";

const module = JSON.parse(readFileSync(join(import.meta.dirname, "data", "account.model.json"), "utf8")) as Module;
const MB = "AccountService/ProtectFunds/MinimumBalance";
const RIF = "AccountService/ProtectFunds/RejectInsufficientFunds";
const COMMIT = "c0ffee0000000000000000000000000000000000";
let z3: SolverPort;
beforeAll(async () => {
  z3 = await createZ3Solver();
});

const approveAll: AuthorityResolver = () => ({ authority: "approved" });
const approveNoBindings: AuthorityResolver = (f) => ({ authority: f.kind === "binding" ? "candidate" : "approved" });

function witness(p: Partial<Witness> & { pre: Witness["pre"]; post: Witness["post"] }, amount = 10000, result = "Accepted"): Witness {
  return {
    schema: "csh-witness/v1",
    id: p.id ?? "w1",
    event: "Withdraw",
    args: { amount },
    result,
    execution: { localResult: "passed", mocked: [] },
    subject: { commit: COMMIT, environment: "node" },
    tool: { id: "test", version: "0" },
    recordedAt: "2026-10-03T12:00:00Z",
    ...p,
  };
}

function runs(...ws: Witness[]): SourceRun[] {
  return [{ source: "UnitTests", kind: "Witnesses", files: [], output: { witnesses: ws, diagnostics: [], witnessSpans: Object.fromEntries(ws.map((w, i) => [w.id, `w.ndjson:${i + 1}`])) } }];
}

async function run(ws: Witness[], authority: AuthorityResolver = approveAll, extra: Partial<Parameters<typeof check>[0]> = {}): Promise<Report> {
  return (await check({ module, moduleDigest: "sha256:test", runs: runs(...ws), solver: z3, authority, snapshot: { commit: COMMIT, ledgerHead: "0" }, ...extra })).report;
}
const verdict = (r: Report, f: string) => r.assessments!.find((a) => a.fragment === f)!;

const overdraw = witness({ pre: { balanceMinor: 5000, minimumBalanceMinor: 0 }, post: { balanceMinor: -5000, minimumBalanceMinor: 0 } });
const rejected = witness({ id: "w2", pre: { balanceMinor: 5000, minimumBalanceMinor: 0 }, post: { balanceMinor: 5000, minimumBalanceMinor: 0 } }, 10000, "Rejected");

describe("witness judging and verdicts", () => {
  it("a witness that breaks an invariant makes it violated, in implementation scope", async () => {
    const r = await run([overdraw]);
    expect(verdict(r, MB)).toMatchObject({ verdict: "violated", scope: "implementation", applicability: "current" });
    expect(verdict(r, MB).evidence[0]).toMatchObject({ witness: "w1", result: "violated", values: { "Account.balance@post": "-5000" } });
    expect(verdict(r, RIF).verdict).toBe("violated");
  });

  it("a boundary witness that holds, with every method met, satisfies", async () => {
    const r = await run([rejected]);
    expect(verdict(r, MB).verdict).toBe("satisfied");
    expect(verdict(r, RIF)).toMatchObject({ verdict: "satisfied", methods: [{ method: "ApprovedBinding", met: true }, { method: "BoundaryWitness", met: true }, { method: "SolverCheck", met: true }] });
  });

  it("the same witness without approved bindings is unknown, never violated", async () => {
    const r = await run([overdraw], approveNoBindings);
    expect(verdict(r, MB)).toMatchObject({ verdict: "unknown", applicability: "inapplicable" });
    expect(verdict(r, MB).reasons).toContain("binding-not-approved");
  });

  it("a mocked witness is rejected by the policy", async () => {
    const r = await run([{ ...rejected, execution: { localResult: "passed", mocked: ["Account"] } }]);
    expect(verdict(r, RIF).verdict).toBe("unknown");
    expect(verdict(r, RIF).evidence[0]!.reason).toMatch(/^evidence-rejected: Account is mocked/);
  });

  it("a witness missing a bound key is inapplicable", async () => {
    const r = await run([witness({ pre: { balanceMinor: 5000 }, post: { balanceMinor: 5000, minimumBalanceMinor: 0 } }, 10000, "Rejected")]);
    expect(verdict(r, RIF).evidence[0]).toMatchObject({ applicability: "inapplicable" });
    expect(verdict(r, RIF).evidence[0]!.reason).toMatch(/^key-missing: /);
  });

  it("a witness from another commit is stale unless nothing changed since", async () => {
    const other = { ...rejected, subject: { commit: "beef", environment: "node" } };
    expect(verdict(await run([other], approveAll, { unchangedSince: () => false }), RIF).applicability).toBe("stale");
    expect(verdict(await run([other], approveAll, { unchangedSince: () => true }), RIF).applicability).toBe("current");
  });

  it("a failing local result never decides a verdict by itself (P2)", async () => {
    const r = await run([{ ...rejected, execution: { localResult: "failed", mocked: [] } }]);
    expect(r.executions[0]).toMatchObject({ witness: "w2", localResult: "failed" });
    expect(verdict(r, RIF).verdict).toBe("satisfied");
  });

  it("with no witnesses, obligations are unknown with no-witness", async () => {
    const r = await run([]);
    expect(verdict(r, MB)).toMatchObject({ verdict: "unknown", applicability: "unavailable" });
    expect(verdict(r, MB).reasons).toContain("no-witness");
  });

  it("everything is candidate without a ledger, and the report still has a gap view", async () => {
    const r = (await check({ module, moduleDigest: "sha256:test", runs: runs(), solver: z3 })).report;
    expect(r.assessments!.every((a) => a.authority === "candidate")).toBe(true);
    expect(r.gapView.sources).toContain("intent");
  });
});

describe("unobserved tests", () => {
  it("reports each source's missing witness, with the source in the subject (#24)", async () => {
    const run = (source: string): SourceRun => ({ source, kind: "Witnesses", files: [], output: { witnesses: [], diagnostics: [], executions: [{ test: "t.ts::shared", outcome: "passed", span: "e.ndjson:1" }] } });
    const r = (await check({ module, moduleDigest: "sha256:test", runs: [run("UnitTests"), run("Integration")], solver: z3 })).report;
    expect(r.gapView.gaps.filter((g) => g.kind === "unobserved-test").map((g) => g.subject)).toEqual(["Integration/t.ts::shared", "UnitTests/t.ts::shared"]);
  });
});

describe("comparability", () => {
  it("a lifted claim in an undeclared unit is not comparable, never a conflict", async () => {
    const claims = { source: "Notes", assumptions: [], examples: [], unliftable: [], obligations: [{ kind: "invariant", name: "UsdFloor", state: "Account", body: { k: "ge", l: { k: "field", state: "Account", field: "balance", at: "now" }, r: { k: "int", v: "0", unit: "minor(USD)" } } }] };
    const r = (await check({ module, moduleDigest: "sha256:test", runs: [{ source: "Notes", kind: "Notes", files: [], output: { claims: claims as never, diagnostics: [] } }], solver: z3 })).report;
    expect(r.notComparable.map((n) => n.reason)).toEqual(["unit-mismatch"]);
    expect(r.findings.filter((f) => f.members.some((m) => m.source === "Notes"))).toEqual([]);
  });
});
