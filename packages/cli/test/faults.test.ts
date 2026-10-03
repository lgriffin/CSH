// No silent satisfaction (Implementer's brief, section 4): every fault in a source, an
// adapter or the solver must leave obligations unknown, never satisfied.
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type AuthorityResolver, check, type Report } from "@csh/check";
import { emit } from "@csh/emit";
import { createFakeSolver, createZ3Solver, type SolverPort } from "@csh/solver";
import { evaluateSpec, type PipelineOptions, readConfig, runSources } from "../src/index.ts";

const FIXTURES = resolve(import.meta.dirname, "../../../fixtures");
const ADAPTERS = resolve(import.meta.dirname, "adapters");
const approveAll: AuthorityResolver = (f) => ({ authority: f.name.includes("/@") ? "candidate" : "approved" });

let tmp: string;
let dir: string;
let z3: SolverPort;

beforeAll(async () => {
  z3 = await createZ3Solver();
  // Inside the repository, so that specifications resolve the csl package.
  const base = resolve(import.meta.dirname, "../../../.csh-cache");
  mkdirSync(base, { recursive: true });
  tmp = mkdtempSync(join(base, "faults-"));
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** A fresh copy of fixture F34 (both obligations satisfied) for each case. */
function fresh(name: string): string {
  const root = join(tmp, name);
  cpSync(join(FIXTURES, "F34"), join(root, "F34"), { recursive: true });
  cpSync(join(FIXTURES, "base"), join(root, "base"), { recursive: true });
  return join(root, "F34");
}

async function run(d: string, extra: Partial<PipelineOptions> = {}): Promise<Report> {
  const r = await evaluateSpec(join(d, "spec.csl.ts"), { root: d, solver: z3, config: readConfig(d), authority: approveAll, emit: { readable: [resolve(d, "..")] }, ...extra });
  expect(r.emitted.ok).toBe(true);
  return r.checked!.report;
}

const satisfied = (r: Report) => (r.assessments ?? []).filter((a) => a.verdict === "satisfied").map((a) => a.fragment);
const approvedVerdicts = (r: Report) => (r.assessments ?? []).filter((a) => a.authority === "approved" && a.kind !== "binding").map((a) => a.verdict);

describe("no silent satisfaction", () => {
  it("baseline: F34 satisfies its obligations", async () => {
    dir = fresh("baseline");
    const r = await run(dir);
    expect(satisfied(r).length).toBeGreaterThan(0);
  });

  it("a missing witness file", async () => {
    const d = fresh("missing");
    rmSync(join(d, "inputs", "witnesses.ndjson"));
    const r = await run(d);
    expect(satisfied(r)).toEqual([]);
    expect(r.diagnostics.map((x) => x.code)).toContain("source-missing");
  });

  it("a malformed witness file", async () => {
    const d = fresh("malformed");
    writeFileSync(join(d, "inputs", "witnesses.ndjson"), "{\"schema\":\"csh-witness/v1\",\"id\":\n");
    const r = await run(d);
    expect(satisfied(r)).toEqual([]);
    expect(r.unliftable.map((u) => u.reason)).toContain("malformed");
  });

  it("an adapter that crashes", async () => {
    const d = fresh("crash");
    const r = await run(d, { adapters: { Witnesses: join(ADAPTERS, "crash.ts") }, isolatedAdapters: false });
    expect(satisfied(r)).toEqual([]);
    expect(r.diagnostics.find((x) => x.code === "adapter-failed")?.message).toMatch(/crashed on purpose/);
  });

  it("an adapter that never returns", async () => {
    const d = fresh("hang");
    const e = await emit(join(d, "spec.csl.ts"), { root: d, readable: [resolve(d, "..")] });
    if (!e.ok) throw new Error("emit failed");
    const runs = await runSources(e.module, { root: d, adapters: { Witnesses: join(ADAPTERS, "hang.ts") }, timeoutMs: 1500, bindingAuthority: () => "approved" });
    expect(runs.find((x) => x.source === "UnitTests")!.output.diagnostics[0]!.message).toMatch(/exceeded 1500 ms/);
    const { report } = await check({ module: e.module, moduleDigest: e.digest, runs, solver: z3, authority: approveAll });
    expect(satisfied(report)).toEqual([]);
  }, 20000);

  it("an adapter that reads the clock while it loads", async () => {
    const d = fresh("clock");
    const e = await emit(join(d, "spec.csl.ts"), { root: d, readable: [resolve(d, "..")] });
    if (!e.ok) throw new Error("emit failed");
    const runs = await runSources(e.module, { root: d, adapters: { Witnesses: join(ADAPTERS, "clock-at-load.ts") }, bindingAuthority: () => "approved" });
    const diag = runs.find((x) => x.source === "UnitTests")!.output.diagnostics[0]!;
    expect(diag.code).toBe("adapter-failed");
    expect(diag.message).toMatch(/E-ACCESS: adapters may not use the clock/);
  }, 20000);

  it.each(["crash", "timeout", "unknown", "garbage"] as const)("a solver that answers %s", async (b) => {
    const d = fresh(`solver-${b}`);
    const r = await run(d, { solverWrap: () => createFakeSolver(b) });
    expect(satisfied(r)).toEqual([]);
    expect(approvedVerdicts(r).every((v) => v === "unknown")).toBe(true);
  });

  it("a witness for another commit with no history to compare is not current", async () => {
    const d = fresh("other-commit");
    const r = await run(d, { snapshot: { commit: "feedface", ledgerHead: "0" }, unchangedSince: () => false });
    expect(satisfied(r)).toEqual([]);
  });
});

describe("source locations", () => {
  it("refuses a source outside the project root, even through a link", async () => {
    const d = fresh("outside");
    const e = await emit(join(d, "spec.csl.ts"), { root: d, readable: [resolve(d, "..")] });
    if (!e.ok) throw new Error("emit failed");
    const { symlinkSync } = await import("node:fs");
    symlinkSync(resolve(d, ".."), join(d, "inputs", "up"));
    for (const at of ["../base", "/etc/hostname", "inputs/up"]) {
      const m = { ...e.module, sources: [{ name: "UnitTests", kind: "Witnesses", at }] };
      const runs = await runSources(m, { root: d, isolated: false });
      expect(runs[0]!.output.diagnostics[0]!.code, at).toBe("source-outside-root");
    }
  });

  it("runs a project-local adapter in isolation", async () => {
    const d = fresh("local-adapter");
    mkdirSync(join(d, "adapters"));
    writeFileSync(join(d, "adapters", "local.mjs"), 'export const adapter = { manifest: { id: "local", version: "0", ir: "csh-ir/v1", produces: [], inputKinds: ["Witnesses"] }, run: () => ({ diagnostics: [{ code: "local-ran", severity: "info", message: "ok" }] }) };\n');
    const e = await emit(join(d, "spec.csl.ts"), { root: d, readable: [resolve(d, "..")] });
    if (!e.ok) throw new Error("emit failed");
    const runs = await runSources(e.module, { root: d, adapters: { Witnesses: "./adapters/local.mjs" } });
    expect(runs.find((r) => r.source === "UnitTests")!.output.diagnostics[0]!.code).toBe("local-ran");
  }, 20000);
});
