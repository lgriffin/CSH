import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { csh, csl } from "../src/index.ts";

const REPO = resolve(import.meta.dirname, "../../..");
let proj: string;

function io(cwd: string) {
  const o = { out: "", err: "" };
  return { o, io: { out: (s: string) => void (o.out += s), err: (s: string) => void (o.err += s), cwd } };
}

const git = (...args: string[]) => execFileSync("git", args, { cwd: proj, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

beforeAll(() => {
  // A small project inside the repository's cache directory, so that the specification resolves the csl package.
  mkdirSync(join(REPO, ".csh-cache"), { recursive: true });
  proj = mkdtempSync(join(REPO, ".csh-cache", "cli-"));
  cpSync(join(REPO, "fixtures", "base"), join(proj, "base"), { recursive: true });
  cpSync(join(REPO, "fixtures", "F34", "inputs"), join(proj, "inputs"), { recursive: true });
  writeFileSync(join(proj, "spec.csl.ts"), 'export { default } from "./base/account-evidence.csl.ts";\n');
  mkdirSync(join(proj, "csh"));
  writeFileSync(join(proj, "csh", "config.json"), JSON.stringify({ spec: "spec.csl.ts", mode: "enforcing" }));
  writeFileSync(join(proj, ".gitignore"), "reports/\n.csh-cache/\n");
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test-only@example.invalid");
  git("config", "user.name", "test-only");
  git("config", "commit.gpgsign", "false");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
});
afterAll(() => rmSync(proj, { recursive: true, force: true }));

describe("csh", () => {
  it("check exits 0 and writes the report and the model", async () => {
    const { o, io: x } = io(proj);
    expect(await csh(["check"], x)).toBe(0);
    const report = JSON.parse(readFileSync(join(proj, "reports", "csh-report.json"), "utf8"));
    expect(report.schema).toBe("csh-report/v1");
    expect(report.snapshot.commit).toBe(git("rev-parse", "HEAD"));
    expect(existsSync(join(proj, "reports", "csh-model.json"))).toBe(true);
    expect(o.out).toMatch(/Obligations/i);
  }, 60000);

  it("gate decides for the current snapshot and refuses a decision for another, or a forged one", async () => {
    const a = io(proj);
    expect(await csh(["gate"], a.io)).toBe(0); // no approved obligations: nothing blocks
    const file = join(proj, "reports", "csh-gate.json");
    expect(existsSync(file)).toBe(true);
    const ok = io(proj);
    expect(await csh(["gate", "--verify", "reports/csh-gate.json"], ok.io)).toBe(0);
    // A forged decision for this snapshot: an obligation row that the computation does not produce.
    const forged = JSON.parse(readFileSync(file, "utf8"));
    forged.obligations.push({ fragment: "X", verdict: "satisfied", applicability: "current", disposition: "allow", selfApproved: false, because: "satisfied" });
    writeFileSync(join(proj, "reports", "forged.json"), JSON.stringify(forged));
    const f = io(proj);
    expect(await csh(["gate", "--verify", "reports/forged.json"], f.io)).toBe(3);
    expect(f.o.err).toMatch(/does not match/);
    writeFileSync(join(proj, "notes.txt"), "a later change\n");
    git("add", "notes.txt");
    git("commit", "-q", "-m", "later");
    const refused = io(proj);
    expect(await csh(["gate", "--verify", "reports/csh-gate.json"], refused.io)).toBe(3);
    expect(refused.o.err).toMatch(/refused: decision is for snapshot/);
  }, 120000);

  it("reports an option given without its value", async () => {
    const { o, io: x } = io(proj);
    expect(await csh(["check", "--budget"], x)).toBe(2);
    expect(o.err).toMatch(/--budget needs a value/);
  });

  it("approve drafts a ledger line and commits nothing", async () => {
    const head = git("rev-parse", "HEAD");
    const { o, io: x } = io(proj);
    expect(await csh(["approve", "AccountService/ProtectFunds/MinimumBalance", "--actor", "test-only", "--rationale", "draft for the test"], x)).toBe(0);
    expect(o.out).toMatch(/Nothing is committed or signed/);
    expect(o.out).toMatch(/digest sha256:/);
    const line = JSON.parse(readFileSync(join(proj, "csh", "ledger.ndjson"), "utf8").trim());
    expect(line).toMatchObject({ seq: 1, kind: "approve", fragment: "AccountService/ProtectFunds/MinimumBalance", actor: "test-only", selfApproved: true });
    expect(git("rev-parse", "HEAD")).toBe(head);
    expect(git("status", "--porcelain")).toMatch(/csh\/ledger\.ndjson/);
  }, 60000);

  it("refuses a decision with no rationale", async () => {
    const { o, io: x } = io(proj);
    expect(await csh(["reject", "AccountService/ProtectFunds/MinimumBalance", "--actor", "test-only"], x)).toBe(2);
    expect(o.err).toMatch(/rationale/);
  });
});

describe("csh init and csh run", () => {
  it("run refuses a project with no component manifest, and a mode it does not know", async () => {
    const none = io(proj);
    expect(await csh(["run"], none.io)).toBe(1);
    expect(none.o.err).toMatch(/no-component/);
    const bad = io(proj);
    expect(await csh(["run", "--mode", "strict"], bad.io)).toBe(2);
  }, 60000);

  it("init writes the manifest from the answers, and never overwrites it", async () => {
    const dir = mkdtempSync(join(REPO, ".csh-cache", "init-"));
    try {
      const answers = ["SignInService", "spec.csl.ts", "src", "ears", "EARS", "requirements", "Product", "", "", "", "Product owner", "the sentence", "tdd", "TDD", "tests", "UnitTests", "", "node --test test/signin.test.ts", "reports/witnesses.ndjson", "", "Product", "", "", ""];
      const { o, io: x } = io(dir);
      expect(await csh(["init"], { ...x, ask: async () => answers.shift() ?? "" })).toBe(0);
      expect(o.out).toMatch(/Wrote csh\/component.json/);
      const m = JSON.parse(readFileSync(join(dir, "csh", "component.json"), "utf8"));
      expect(m.practices.map((p: { id: string }) => p.id)).toEqual(["ears", "tdd"]);
      expect(m.practices[1].harness).toEqual({ run: ["node", "--test", "test/signin.test.ts"], witnesses: "reports/witnesses.ndjson" });
      expect(m.practices[1].cites).toBe("Product");
      const again = io(dir);
      expect(await csh(["init"], { ...again.io, ask: async () => "" })).toBe(2);
      expect(again.o.err).toMatch(/never overwrites/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("init writes nothing when the answers do not make a manifest", async () => {
    const dir = mkdtempSync(join(REPO, ".csh-cache", "init-"));
    try {
      const { o, io: x } = io(dir);
      expect(await csh(["init"], { ...x, ask: async () => "" })).toBe(1);
      expect(o.err).toMatch(/Nothing written/);
      expect(existsSync(join(dir, "csh", "component.json"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("csl", () => {
  it("emit fails on F07 (a policy names a method version 1 does not define)", async () => {
    const { o, io: x } = io(REPO);
    expect(await csl(["emit", "fixtures/F07/spec.csl.ts"], x)).toBe(1);
    expect(o.err).toMatch(/S8/);
  }, 60000);

  it("emit prints the digest of a valid specification", async () => {
    const { o, io: x } = io(REPO);
    expect(await csl(["emit", "fixtures/F10/spec.csl.ts"], x)).toBe(0);
    expect(o.out).toMatch(/^sha256:[0-9a-f]{64}\n$/);
  }, 60000);
});
