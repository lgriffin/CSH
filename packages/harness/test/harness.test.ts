// The probe and the reporter (Anchor, harnesses and A3, sections 3.1 and 3.2): witnesses carry the test's identity and
// no outcome; the reporter gives each finished test one execution line, and the two join by identity (A-39).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseExecutions, parseWitnesses } from "@csh/witness";
import { executionOf, fileSlug, nameTracker, probe, testIdentity, witnessId } from "../src/index.ts";

const REPO = resolve(import.meta.dirname, "../../..");
let dir: string;
beforeAll(() => {
  mkdirSync(join(REPO, ".csh-cache"), { recursive: true });
  dir = mkdtempSync(join(REPO, ".csh-cache", "harness-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const read = (f: string) => parseWitnesses(readFileSync(f, "utf8")).witnesses.map((x) => x.w);

describe("testIdentity", () => {
  it("joins the file, relative to the harness directory, and the full name", () => {
    expect(testIdentity("/p/test/a.test.ts", "group > inner", "/p")).toBe("test/a.test.ts::group > inner");
    expect(testIdentity("file:///p/test/a.test.ts", "adds", "/p")).toBe("test/a.test.ts::adds");
    expect(testIdentity(undefined, "adds")).toBe("adds");
  });
});

describe("probe", () => {
  const add = (x: number, y: number) => ({ sum: x + y });
  const mappers = { pre: (x: number) => ({ x }), args: (_x: number, y: number) => ({ y }), post: (o: { sum: number }) => ({ sum: o.sum }), result: (o: { sum: number }) => o.sum, mocked: ["Clock"] };

  it("returns the real result and records a version 2 witness with no outcome", () => {
    const file = join(dir, "probe.ndjson");
    const p = probe("Add", add, mappers, { file, commit: "c0ffee", cwd: "/p" });
    expect(p.in({ name: "adds", fullName: "adds", filePath: "/p/test/a.test.ts" }, { cites: ["R-1"] })(1, 2)).toEqual({ sum: 3 });
    const [w] = read(file);
    expect(w).toMatchObject({ schema: "csh-witness/v2", event: "Add", args: { y: 2 }, pre: { x: 1 }, post: { sum: 3 }, result: 3, cites: ["R-1"], execution: { test: "test/a.test.ts::adds", mocked: ["Clock"] }, subject: { commit: "c0ffee" }, tool: { id: "@csh/harness" } });
    expect(w!.execution.localResult).toBeUndefined();
  });

  it("records an awaited result, and nothing for a call that throws", async () => {
    const file = join(dir, "async.ndjson");
    const p = probe("Add", async (x: number, y: number) => add(x, y), { pre: (x: number) => ({ x }), args: (_x: number, y: number) => ({ y }), post: (o) => ({ sum: o.sum }), mocked: [] }, { file });
    expect(await p.in({ name: "async adds" })(2, 2)).toEqual({ sum: 4 });
    const boom = probe("Add", (_x: number, _y: number): { sum: number } => {
      throw new Error("boom");
    }, mappers, { file });
    expect(() => boom.in({ name: "throws" })(1, 1)).toThrow("boom");
    expect(read(file).map((w) => w.post)).toEqual([{ sum: 4 }]);
  });

  it("names witnesses after the test, numbering later calls in the same test", () => {
    expect(witnessId("Locks on the Third failure!")).toBe("locks-on-the-third-failure");
    expect(witnessId("Locks on the Third failure!")).toBe("locks-on-the-third-failure-2");
    // A later call never takes an id another test already has.
    expect(witnessId("counts 2")).toBe("counts-2");
    expect(witnessId("counts")).toBe("counts");
    expect(witnessId("counts")).toBe("counts-3");
  });

  it("puts the test file into the id, so that no two files share one (#25)", () => {
    expect(witnessId("Locks on the third failure", "test/lockout.test.ts")).toBe("test0slockout0dtest0dts0e--locks-on-the-third-failure");
    expect(fileSlug("test/a-b.test.ts")).toBe("test0sa0hb0dtest0dts0e");
    expect(fileSlug("Test/É0.ts")).toBe("0ctest0s0xc30x890z0dts0e");
    const paths = ["test/a-b.ts", "test/a/b.ts", "test/a_b.ts", "test/a.b.ts", "Test/a.ts", "test/a.ts", "test/a0.ts", "test/a/b.test.ts", "test/a.b.test.ts", "test.x.ts", "test/x.ts"];
    expect(new Set(paths.map(fileSlug)).size).toBe(paths.length);
    // Letters and digits only, with no upper case: an example name keeps the token whole.
    for (const p of paths) expect(fileSlug(p)).toMatch(/^[a-z0-9]+$/);
  });

  it("gives same-named tests in two files, writing one witness file, ids that both parse (#25)", () => {
    const root = join(dir, "two-files");
    mkdirSync(join(root, "test"), { recursive: true });
    const body = `import { test } from "node:test";\nimport { probe } from "@csh/harness";\nconst p = probe("Add", (x: number) => ({ x }), { pre: (x) => ({ x }), args: () => ({}), post: (o) => ({ x: o.x }), mocked: [] });\ntest("adds", (t) => { p.in(t)(1); p.in(t)(2); });\n`;
    writeFileSync(join(root, "test", "a.test.ts"), body);
    writeFileSync(join(root, "test", "b.test.ts"), body);
    execFileSync(process.execPath, ["--test", "test/a.test.ts", "test/b.test.ts"], { cwd: root, env: { ...process.env, CSH_WITNESS_FILE: "reports/w.ndjson" }, stdio: "pipe" });
    const parsed = parseWitnesses(readFileSync(join(root, "reports", "w.ndjson"), "utf8"));
    expect(parsed.problems).toEqual([]);
    expect(parsed.witnesses.map((x) => x.w.id).sort()).toEqual(["test0sa0dtest0dts0e--adds", "test0sa0dtest0dts0e--adds-2", "test0sb0dtest0dts0e--adds", "test0sb0dtest0dts0e--adds-2"]);
  }, 60000);
});

describe("reporter", () => {
  const ev = (type: string, data: Record<string, unknown>) => ({ type, data: { name: "t", nesting: 0, file: "/p/test/a.test.ts", ...data } as never });

  it("maps a pass, a failure in the test, any other failure and a todo; suites and skips get no line", () => {
    const at = (e: ReturnType<typeof ev>) => executionOf(e, "t", "/p")?.outcome;
    expect(at(ev("test:pass", {}))).toBe("passed");
    expect(at(ev("test:fail", { details: { error: { failureType: "testCodeFailure" } } }))).toBe("failed");
    expect(at(ev("test:fail", { details: { error: { failureType: "testTimeoutFailure" } } }))).toBe("errored");
    expect(at(ev("test:pass", { todo: true }))).toBe("errored");
    expect(at(ev("test:pass", { skip: true }))).toBeUndefined();
    expect(at(ev("test:pass", { details: { type: "suite" } }))).toBeUndefined();
    expect(at(ev("test:start", {}))).toBeUndefined();
  });

  it("builds full names from the enclosing tests, per file", () => {
    const name = nameTracker();
    name(ev("test:start", { name: "group" }));
    name(ev("test:start", { name: "inner", nesting: 1 }));
    name(ev("test:start", { name: "other", file: "/p/test/b.test.ts" }));
    expect(name(ev("test:pass", { name: "inner", nesting: 1 }))).toBe("group > inner");
    expect(name(ev("test:pass", { name: "other", file: "/p/test/b.test.ts" }))).toBe("other");
  });

  it("joins with the probe's witnesses by identity in a real run of Node's test runner", () => {
    const root = join(dir, "run");
    mkdirSync(join(root, "test"), { recursive: true });
    writeFileSync(join(root, "test", "a.test.ts"), `import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { probe } from "@csh/harness";
const p = probe("Add", (x: number, y: number) => ({ sum: x + y }), { pre: (x) => ({ x }), args: (_x, y) => ({ y }), post: (o) => ({ sum: o.sum }), mocked: [] });
test("adds", (t) => { assert.equal(p.in(t)(1, 2).sum, 3); });
test("fails", (t) => { assert.equal(p.in(t)(1, 2).sum, 4); });
describe("group", () => { test("inner", (t) => { p.in(t)(2, 2); }); test.skip("skipped", () => {}); });
test("says nothing", () => {});
`);
    try {
      execFileSync(process.execPath, ["--test", "--test-reporter=@csh/harness/reporter", "--test-reporter-destination=stdout", "test/a.test.ts"], { cwd: root, env: { ...process.env, CSH_WITNESS_FILE: "reports/w.ndjson", CSH_EXECUTIONS_FILE: "reports/e.ndjson" }, stdio: "pipe" });
    } catch {
      // One test fails on purpose, so the runner exits 1.
    }
    const executions = parseExecutions(readFileSync(join(root, "reports", "e.ndjson"), "utf8")).executions.map((x) => [x.e.test, x.e.outcome]);
    expect(executions).toEqual([
      ["test/a.test.ts::adds", "passed"],
      ["test/a.test.ts::fails", "failed"],
      ["test/a.test.ts::group > inner", "passed"],
      ["test/a.test.ts::says nothing", "passed"],
    ]);
    expect(read(join(root, "reports", "w.ndjson")).map((w) => w.execution.test)).toEqual(["test/a.test.ts::adds", "test/a.test.ts::fails", "test/a.test.ts::group > inner"]);
  }, 60000);

  it("appends to its executions file on every run, never truncating it (#23)", () => {
    const root = join(dir, "append");
    mkdirSync(join(root, "test"), { recursive: true });
    const run = (outcome: string) => {
      writeFileSync(join(root, "test", "a.test.ts"), `import { test } from "node:test";\ntest("adds", () => { ${outcome === "failed" ? 'throw new Error("no");' : ""} });\n`);
      try {
        execFileSync(process.execPath, ["--test", "--test-reporter=@csh/harness/reporter", "--test-reporter-destination=stdout", "test/a.test.ts"], { cwd: root, env: { ...process.env, CSH_EXECUTIONS_FILE: "reports/e.ndjson" }, stdio: "pipe" });
      } catch {
        // The failing run exits 1.
      }
    };
    run("passed");
    run("failed");
    // Two harnesses within one csh run may share the file, so the reporter keeps both runs' lines. Outside csh run, a
    // pass followed by a fail is two outcomes for one identity, which the witness adapter reads as unknown: it fails safe.
    expect(parseExecutions(readFileSync(join(root, "reports", "e.ndjson"), "utf8")).executions.map((x) => [x.e.test, x.e.outcome])).toEqual([
      ["test/a.test.ts::adds", "passed"],
      ["test/a.test.ts::adds", "failed"],
    ]);
  }, 60000);
});
