// Test results (Ingesting a codebase, stage 26): counted per test file and per item a test cites, a failing test file
// is a gap, and no verdict changes because of them (P2).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Module } from "@csh/kernel";
import { createZ3Solver, type SolverPort } from "@csh/solver";
import { check, prepare, type SourceRun, testOutcomes, trace } from "../src/index.ts";

const empty: Module = { schema: "csh-ir/v1", system: "S", uses: [], vocabulary: { units: [], enums: [], states: [], events: [] }, transitions: [], policies: [], intents: [], sources: [], claims: [], bindings: [] };
const item = (id: string, kind: "requirement" | "test-file") => ({ id, kind, text: id, span: `${id}:1`, textDigest: "sha256:0" });

const charter: SourceRun = { source: "Charter", kind: "Documents", files: [], output: { diagnostics: [], items: [item("R-1", "requirement"), item("R-2", "requirement")] } };
const tests = (results: NonNullable<SourceRun["output"]["results"]>): SourceRun => ({
  source: "Tests",
  kind: "TestFiles",
  files: [],
  output: { diagnostics: [], items: [item("a.test.ts", "test-file"), item("b.test.ts", "test-file")], edges: [{ from: "a.test.ts", rel: "cites", to: "R-1", span: "a.test.ts:1" }], results },
});
const RESULTS = [
  { file: "a.test.ts", outcome: "passed" as const, cites: ["R-1"], span: "r.json#0" },
  { file: "a.test.ts", outcome: "failed" as const, cites: ["R-1", "R-2"], span: "r.json#1" },
  { file: "a.test.ts", outcome: "skipped" as const, cites: [], span: "r.json#2" },
  { file: "b.test.ts", outcome: "errored" as const, cites: [], span: "r.json#3" },
];

describe("test outcomes", () => {
  it("counts per test file and per cited item, resolving a citation no static edge read", () => {
    const prepared = prepare(empty, [charter, tests(RESULTS)]);
    const { outcomes, gaps } = testOutcomes(prepared, trace({ prepared }).edges);
    expect(outcomes).toEqual([
      // R-2 is cited only in a full name the runner reported: it resolves as an identifier, to the one item it names.
      { item: "Charter/R-1", tests: 2, passed: 1, failed: 1, errored: 0, skipped: 0 },
      { item: "Charter/R-2", tests: 1, passed: 0, failed: 1, errored: 0, skipped: 0 },
      { item: "Tests/a.test.ts", tests: 3, passed: 1, failed: 1, errored: 0, skipped: 1 },
      { item: "Tests/b.test.ts", tests: 1, passed: 0, failed: 0, errored: 1, skipped: 0 },
    ]);
    expect(gaps).toEqual([
      { kind: "failing-test", subject: "Tests/a.test.ts", fragments: [], detail: "1 of 3 tests failed; they cite Charter/R-1, Charter/R-2" },
      { kind: "failing-test", subject: "Tests/b.test.ts", fragments: [], detail: "could not run (1 errored)" },
    ]);
  });

  it("is nothing without results", () => {
    const prepared = prepare(empty, [charter, tests([])]);
    expect(testOutcomes(prepared, trace({ prepared }).edges)).toEqual({ outcomes: [], gaps: [] });
  });
});

describe("results in a check", () => {
  let z3: SolverPort;
  beforeAll(async () => {
    z3 = await createZ3Solver();
  });
  const account = JSON.parse(readFileSync(join(import.meta.dirname, "data", "account.model.json"), "utf8")) as Module;

  it("reports outcomes and failing-test gaps, and changes no finding and no other gap", async () => {
    const opts = { module: account, moduleDigest: "sha256:m", solver: z3, configDigest: "sha256:c" };
    const without = (await check({ ...opts, runs: [charter, tests([])] })).report;
    const withResults = (await check({ ...opts, runs: [charter, tests(RESULTS)] })).report;
    expect(withResults.findings).toEqual(without.findings);
    expect(withResults.assessments).toEqual(without.assessments);
    expect(without.outcomes).toBeUndefined();
    expect(withResults.outcomes?.map((o) => o.item)).toEqual(["Charter/R-1", "Charter/R-2", "Tests/a.test.ts", "Tests/b.test.ts"]);
    expect(withResults.gapView.gaps.filter((g) => g.kind !== "failing-test")).toEqual(without.gapView.gaps);
    expect(withResults.gapView.gaps.filter((g) => g.kind === "failing-test").map((g) => g.subject)).toEqual(["Tests/a.test.ts", "Tests/b.test.ts"]);
  });
});
