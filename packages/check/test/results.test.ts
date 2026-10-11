// Test results (Ingesting a codebase, stage 26): counted per test file and per item a test cites, a failing test file
// is a gap, and no verdict changes because of them (P2).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Module } from "@csh/kernel";
import { createZ3Solver, type SolverPort } from "@csh/solver";
import { check, overviewOf, prepare, renderReport, type SourceRun, testOutcomes, trace } from "../src/index.ts";

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

  it("counts the test files an item's Verified by names, by path, directory or unique bare name (stage 27)", () => {
    const verifying: SourceRun = {
      ...charter,
      output: {
        ...charter.output,
        edges: [
          { from: "R-1", rel: "verified-by", to: "file:unit/", span: "c.md:1" },
          { from: "R-2", rel: "verified-by", to: "file:b.test.ts", span: "c.md:2" },
          { from: "R-2", rel: "verified-by", to: "file:contract/c.test.ts", span: "c.md:2" },
          { from: "R-2", rel: "verified-by", to: "text:npm test", span: "c.md:2" },
        ],
      },
    };
    const files: SourceRun = {
      source: "Tests",
      kind: "TestFiles",
      files: [],
      output: {
        diagnostics: [],
        items: [item("unit/a.test.ts", "test-file"), item("unit/b.test.ts", "test-file"), item("contract/c.test.ts", "test-file")],
        results: [
          { file: "unit/a.test.ts", outcome: "passed", cites: [], span: "r.json#0" },
          { file: "unit/b.test.ts", outcome: "passed", cites: [], span: "r.json#1" },
          { file: "unit/b.test.ts", outcome: "skipped", cites: [], span: "r.json#2" },
        ],
      },
    };
    const prepared = prepare(empty, [verifying, files]);
    expect(testOutcomes(prepared, trace({ prepared }).edges).verifiedBy).toEqual([
      { item: "Charter/R-1", files: 2, unreported: 0, tests: 3, passed: 2, failed: 0, errored: 0, skipped: 1 },
      // The contract file declares tests the runner never reported.
      { item: "Charter/R-2", files: 2, unreported: 1, tests: 2, passed: 1, failed: 0, errored: 0, skipped: 1 },
    ]);
    // A bare name another tracked file shares names no test file.
    expect(testOutcomes(prepared, trace({ prepared }).edges, ["unit/a.test.ts", "unit/b.test.ts", "contract/c.test.ts", "fixtures/b.test.ts"]).verifiedBy.find((v) => v.item === "Charter/R-2")).toEqual({ item: "Charter/R-2", files: 1, unreported: 1, tests: 0, passed: 0, failed: 0, errored: 0, skipped: 0 });
  });

  it("is nothing without results", () => {
    const prepared = prepare(empty, [charter, tests([])]);
    expect(testOutcomes(prepared, trace({ prepared }).edges)).toEqual({ outcomes: [], verifiedBy: [], gaps: [] });
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

  it("converges a source's test files only when none failed (stage 27)", async () => {
    const opts = { module: account, moduleDigest: "sha256:m", solver: z3, configDigest: "sha256:c" };
    const failing = overviewOf((await check({ ...opts, runs: [charter, tests(RESULTS)] })).report);
    expect(failing.entries.filter((e) => e.kind === "tests-pass")).toEqual([]);
    expect(failing.entries.filter((e) => e.kind === "failing-test").map((e) => e.outcome)).toEqual(["gap", "gap"]);
    const passing = overviewOf((await check({ ...opts, runs: [charter, tests([RESULTS[0]!, RESULTS[2]!])] })).report);
    expect(passing.entries.filter((e) => e.kind === "tests-pass").map((e) => [e.outcome, e.subject, e.detail])).toEqual([["converged", "Tests", "1 tests in 1 test files pass"]]);
  });

  it("shows the counts, and a results file that could not be read, in the text report", async () => {
    const opts = { module: account, moduleDigest: "sha256:m", solver: z3, configDigest: "sha256:c" };
    const text = renderReport((await check({ ...opts, runs: [charter, tests(RESULTS)] })).report);
    expect(text).toContain("  tests 4 in 2 files: passed 1, failed 1, errored 1, skipped 1; cited items 2");
    const bad = tests([]);
    bad.output.diagnostics.push({ code: "malformed-results", severity: "error", message: "not JSON", span: "r.json:1" });
    const shown = renderReport((await check({ ...opts, runs: [charter, bad] })).report);
    expect(shown).toContain("== Test results\n\n  error malformed-results (Tests r.json:1): not JSON");
    expect(shown).not.toContain("  tests ");
  });
});
