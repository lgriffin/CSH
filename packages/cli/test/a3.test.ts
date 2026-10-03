// csh a3 on a copy of the lockout example, as written (Anchor, harnesses and A3, sections 5.6 to 5.8).
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { csh } from "../src/index.ts";

const REPO = resolve(import.meta.dirname, "../../..");
let proj: string;

function io(cwd: string) {
  const o = { out: "", err: "" };
  return { o, io: { out: (s: string) => void (o.out += s), err: (s: string) => void (o.err += s), cwd } };
}
const git = (...args: string[]) => execFileSync("git", args, { cwd: proj, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

beforeAll(() => {
  mkdirSync(join(REPO, ".csh-cache"), { recursive: true });
  proj = mkdtempSync(join(REPO, ".csh-cache", "a3-"));
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

describe("csh a3", () => {
  it("open records the run of HEAD and writes a skeleton in which every signal is unclassified", async () => {
    const run = io(proj);
    expect(await csh(["run"], run.io)).toBe(0);
    expect(run.o.out).toMatch(/to read it as one problem: csh a3 open <slug>/);
    const open = io(proj);
    expect(await csh(["a3", "open", "lockout"], open.io)).toBe(0);
    for (const f of ["judgments.json", "a3.json", "a3.md", "a3.html", "stages/first/run.json", "stages/first/report.json", "stages/first/gate.json"]) expect(existsSync(join(proj, "csh/a3/lockout", f)), f).toBe(true);
    const model = JSON.parse(readFileSync(join(proj, "csh/a3/lockout/a3.json"), "utf8"));
    expect(model.authority).toEqual({ authority: "candidate" });
    expect(model.stages[0].signals.length).toBeGreaterThan(0);
    expect(model.problems.filter((p: { kind: string }) => p.kind === "unclassified").length).toBe(model.stages[0].signals.length);
    expect(model.lanes.map((l: { practice: string }) => l.practice)).toEqual(["ears", "bdd", "tdd"]);
    const md = readFileSync(join(proj, "csh/a3/lockout/a3.md"), "utf8");
    expect(md).toMatch(/# A3: Not yet written\./);
    expect(md).toMatch(/## 4\. Root cause analysis\n\n_Not yet written\._/);
    const again = io(proj);
    expect(await csh(["a3", "open", "lockout"], again.io)).toBe(2);
    expect(again.o.err).toMatch(/never overwrites/);
  }, 120000);

  it("build --check passes on the built sheet and fails once an output is edited", async () => {
    git("add", "-A");
    git("commit", "-q", "-m", "open the A3");
    const ok = io(proj);
    expect(await csh(["a3", "build", "lockout", "--check"], ok.io)).toBe(0);
    writeFileSync(join(proj, "csh/a3/lockout/a3.md"), "edited\n");
    const bad = io(proj);
    expect(await csh(["a3", "build", "lockout", "--check"], bad.io)).toBe(1);
    expect(bad.o.err).toMatch(/a3\.md differs/);
    git("checkout", "--", "csh/a3/lockout/a3.md");
  }, 60000);

  it("stage adds a stage to the judgments, and verify re-runs each stage at its commit", async () => {
    const st = io(proj);
    expect(await csh(["a3", "stage", "lockout", "again", "--at", "HEAD"], st.io)).toBe(0);
    expect(st.o.out).toMatch(/added stage again to the judgments/);
    const j = JSON.parse(readFileSync(join(proj, "csh/a3/lockout/judgments.json"), "utf8"));
    expect(j.stages.map((s: { id: string }) => s.id)).toEqual(["first", "again"]);
    git("add", "-A");
    git("commit", "-q", "-m", "a second stage");
    const v = io(proj);
    expect(await csh(["a3", "verify", "lockout"], v.io)).toBe(0);
    expect(v.o.out).toMatch(/verified first/);
    expect(v.o.out).toMatch(/verified again/);
    const report = join(proj, "csh/a3/lockout/stages/first/report.json");
    writeFileSync(report, readFileSync(report, "utf8").replace('"findings"', '"findings" '));
    const t = io(proj);
    expect(await csh(["a3", "verify", "lockout"], t.io)).toBe(1);
    expect(t.o.out).toMatch(/stage-mismatch first: report\.json is/);
  }, 180000);

  it("approve drafts a ledger line for the judgments' digest and commits nothing", async () => {
    const head = git("rev-parse", "HEAD");
    const a = io(proj);
    expect(await csh(["approve", "#a3/lockout", "--actor", "Owner", "--rationale", "the root causes are right"], a.io)).toBe(0);
    const line = JSON.parse(readFileSync(join(proj, "csh/ledger.ndjson"), "utf8").trim());
    expect(line.fragment).toBe("SignInService/#a3/lockout");
    expect(line.digest).toMatch(/^sha256:/);
    expect(git("rev-parse", "HEAD")).toBe(head);
  }, 60000);

  it("the gate component's committed sheet matches its stage records and judgments", async () => {
    const check = io(REPO);
    expect(await csh(["a3", "build", "dispositions", "--check", "--root", join(REPO, "packages", "gate")], check.io), check.o.err).toBe(0);
    expect(check.o.out).toMatch(/match the stage records and judgments/);
  });
});
