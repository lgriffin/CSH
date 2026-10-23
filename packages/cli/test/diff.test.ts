// csh diff on a copy of the lockout example (stage 65): two commits, a commit and the working tree, a stored run's
// directory, and a side that cannot be read.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
  proj = mkdtempSync(join(REPO, ".csh-cache", "diff-"));
  cpSync(join(REPO, "examples", "lockout"), proj, { recursive: true });
  for (const d of ["countermeasures", "model", "regression", "csh/a3"]) rmSync(join(proj, d), { recursive: true, force: true });
  writeFileSync(join(proj, ".gitignore"), "reports/\n.csh-cache/\n");
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test-only@example.invalid");
  git("config", "user.name", "test-only");
  git("config", "commit.gpgsign", "false");
  git("add", "-A");
  git("commit", "-q", "-m", "as written");
  // A second commit that changes a requirement sentence, so that the diff has something to say.
  const req = join(proj, "docs", "requirements.md");
  writeFileSync(req, `${readFileSync(req, "utf8")}\n`);
  git("commit", "-q", "-am", "a later change");
});
afterAll(() => rmSync(proj, { recursive: true, force: true }));

describe("csh diff", () => {
  it("compares two commits, running each, and writes diff.json and diff.md with --out", async () => {
    const d = io(proj);
    expect(await csh(["diff", "HEAD~1", "HEAD", "--out", "reports/diff"], d.io)).toBe(0);
    expect(d.o.out).toMatch(/\S/);
    for (const f of ["diff.json", "diff.md"]) expect(existsSync(join(proj, "reports/diff", f)), f).toBe(true);
    const model = JSON.parse(readFileSync(join(proj, "reports/diff/diff.json"), "utf8"));
    expect(model.comparison).not.toMatch(/unavailable/);
  }, 300_000);

  it("reads a stored run's directory as a side, and prints the model with --json", async () => {
    const runs = join(proj, ".csh-cache", "runs");
    const stored = readdirSync(runs).map((x) => join(runs, x)).find((x) => existsSync(join(x, "report.json")));
    expect(stored).toBeDefined();
    const d = io(proj);
    expect(await csh(["diff", stored!, "HEAD", "--json"], d.io)).toBe(0);
    expect(JSON.parse(d.o.out).comparison).toBeDefined();
  }, 300_000);

  it("compares HEAD with the working tree", async () => {
    const d = io(proj);
    expect(await csh(["diff", "HEAD", "."], d.io)).toBe(0);
  }, 300_000);

  it("says a head it cannot run is unavailable, and exits 1", async () => {
    const d = io(proj);
    expect(await csh(["diff", "HEAD", "no-such-commit"], d.io)).toBe(1);
    expect(d.o.out).toMatch(/unavailable/);
  }, 300_000);
});
