// Every tool of the agent server called in process, on a copy of the lockout example as written (stage 65). The
// scripted session in packages/testkit drives the same tools through the server as a separate process; this test
// covers each tool's answers and refusals one by one.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createZ3Solver, type SolverPort } from "@csh/solver";
import { callTool } from "../src/index.ts";

const REPO = resolve(import.meta.dirname, "../../..");
let proj: string;
let solver: SolverPort;
const git = (...args: string[]) => execFileSync("git", args, { cwd: proj, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const call = async (name: string, args: Record<string, unknown> = {}): Promise<{ ok: boolean; result?: any; error?: any }> => (await callTool(name, args, { root: proj, solver, ci: false })) as never;

beforeAll(async () => {
  solver = await createZ3Solver();
  mkdirSync(join(REPO, ".csh-cache"), { recursive: true });
  proj = mkdtempSync(join(REPO, ".csh-cache", "agent-tools-"));
  cpSync(join(REPO, "examples", "lockout"), proj, { recursive: true });
  for (const d of ["countermeasures", "model", "regression", "csh/a3"]) rmSync(join(proj, d), { recursive: true, force: true });
  writeFileSync(join(proj, ".gitignore"), "reports/\n.csh-cache/\n");
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test-only@example.invalid");
  git("config", "user.name", "test-only");
  git("config", "commit.gpgsign", "false");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
});
afterAll(() => rmSync(proj, { recursive: true, force: true }));

describe("the agent's tools on the lockout example", () => {
  it("status says the component is unprotected, and why", async () => {
    const r = await call("status");
    expect(r.ok).toBe(true);
    expect(r.result.protection).toBe("unprotected");
    expect(r.result.reasons.length).toBeGreaterThan(0);
  }, 120_000);

  it("run stores a run of the working tree and names its gate", async () => {
    const r = await call("run");
    expect(r.ok).toBe(true);
    expect(r.result.gate.mode).toBe("advisory");
    expect(r.result.obligations.length).toBeGreaterThan(0);
    expect(r.result.obligations.every((o: { authority: string }) => o.authority === "candidate")).toBe(true);
  }, 120_000);

  it("gaps lists signals by id, and explain and print answer for one, quoting source text", async () => {
    const gaps = await call("gaps");
    expect(gaps.ok).toBe(true);
    expect(gaps.result.gaps.length).toBeGreaterThan(0);
    const first = gaps.result.gaps[0];
    expect(Object.keys(first).sort()).toEqual(["fragments", "id", "kind", "practices", "sources"]);
    const explained = await call("explain", { id: first.id });
    expect(explained.ok).toBe(true);
    expect(explained.result.signal ?? explained.result.finding).toBeDefined();
    const fragment = gaps.result.gaps.flatMap((g: { fragments: string[] }) => g.fragments)[0];
    const printed = await call("print", { fragment });
    expect(printed.ok).toBe(true);
    expect(printed.result.fragment).toBe(fragment);
    expect(printed.result.printed.quoted).toBeTypeOf("string");
  }, 120_000);

  it("explain and print refuse what is not in the specification", async () => {
    expect((await call("explain", { id: "no-such-id" })).error.code).toBe("unknown-id");
    expect((await call("print", { fragment: "SignInService/Nothing" })).error.code).toBe("unknown-fragment");
  }, 120_000);

  it("each tool that needs an argument refuses without it, before reading anything", async () => {
    for (const [tool, args] of [["explain", {}], ["print", {}], ["diff", { base: "HEAD" }], ["a3_open", {}], ["propose_claim", { name: "X" }]] as const) {
      const r = await call(tool, args);
      expect(r.ok, tool).toBe(false);
      expect(r.error.code, tool).toBe("missing-argument");
    }
  });

  it("queue lists what awaits the owner", async () => {
    const r = await call("queue");
    expect(r.ok).toBe(true);
    expect(r.result.schema).toBe("csh-queue/v1");
    expect(r.result.entries.length).toBeGreaterThan(0);
  }, 120_000);

  it("diff between HEAD and the working tree says continue when nothing changed", async () => {
    const r = await call("diff", { base: "HEAD", head: "." });
    expect(r.ok).toBe(true);
    expect(r.result.says).toBe("continue");
    expect(r.result.approvalsLost).toEqual([]);
  }, 240_000);

  it("propose_claim refuses an intent the specification does not declare, and names those it does", async () => {
    const unknown = await call("propose_claim", { name: "NewRule", intent: "NoSuchIntent", claim: {} });
    expect(unknown.error.code).toBe("unknown-intent");
    expect(unknown.error.detail.quoted ?? unknown.error.detail).toMatch(/StopPasswordGuessing/);
  }, 120_000);

  it("a3_open opens an A3 once, and refuses to open it again", async () => {
    const r = await call("a3_open", { slug: "agent-opened" });
    expect(r.ok).toBe(true);
    expect(existsSync(join(proj, "csh/a3/agent-opened/judgments.json"))).toBe(true);
    const again = await call("a3_open", { slug: "agent-opened" });
    expect(again.ok).toBe(false);
    expect(again.error.code).toBe("a3-open-refused");
  }, 240_000);
});
