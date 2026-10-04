// The exit of stage 17 that the implementer can reach (Next layers, section 9): in a scratch copy of the gate component
// signed by a test-only key, the enforcing CI gate job allows the approved state and blocks the regression commit. The
// real repository's gate stays as it is: no key, maintainers file or ledger is created there (rule 19, A-78).
import { spawn } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createZ3Solver } from "@csh/solver";
import { fragmentsOf } from "@csh/kernel";
import { type Decision, formatDecision, LEDGER_PATH, MAINTAINERS_PATH } from "@csh/ledger";
import { evaluateProject, loadProject } from "@csh/run";
import { createTestRepo, gpgAvailable, type TestRepo } from "../src/git.ts";

const repoRoot = resolve(import.meta.dirname, "../../..");
const gateDir = join(repoRoot, "packages", "gate");
const job = join(repoRoot, ".github", "scripts", "gate-job.sh");

let repo: TestRepo;
let rootCommit: string;
let runnerHome: string;

/** The job as a CI runner runs it: a keyring holding no key at all, the root pinned outside the repository. */
async function runJob(env: Record<string, string> = {}): Promise<{ status: number | null; out: string; decision: { overall: string; obligations: { fragment: string; disposition: string }[] } | undefined }> {
  const child = spawn("bash", [job, repo.dir], { env: { ...process.env, GNUPGHOME: runnerHome, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", CSH_ROOT_COMMIT: rootCommit, ...env } });
  let out = "";
  child.stdout.on("data", (d: Buffer) => (out += d.toString()));
  child.stderr.on("data", (d: Buffer) => (out += d.toString()));
  const status = await new Promise<number | null>((done) => child.on("close", done));
  const file = join(repo.dir, "reports", "csh-gate.json");
  const decision = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { overall: string; obligations: { fragment: string; disposition: string }[] }) : undefined;
  return { status, out, decision };
}

describe.skipIf(!gpgAvailable())("the CI gate job on a scratch copy of the gate component", () => {
  beforeAll(async () => {
    repo = createTestRepo(join(repoRoot, ".csh-cache", "gate-job"), ["Owner"]);
    runnerHome = mkdtempSync("/tmp/csh-runner-gnupg-");
    cpSync(gateDir, repo.dir, { recursive: true, filter: (p) => !/[\\/](node_modules|reports|\.csh-cache|regression|a3)$/.test(p) });
    // The component resolves its packages from the workspace's installation, as a run at a past commit does (A-50).
    symlinkSync(join(gateDir, "node_modules"), join(repo.dir, "node_modules"), "dir");
    writeFileSync(join(repo.dir, ".gitignore"), "node_modules\nreports/\n.csh-cache/\n");
    repo.commit("The gate component", null);
    // The owner's steps 2 and 3, with a test-only key: the maintainers file, signed, then its commit pinned.
    repo.write(MAINTAINERS_PATH, `${JSON.stringify(repo.maintainers(["Owner"], { Owner: { kind: "person", roles: ["intent-owner", "domain-reviewer"] } }), null, 2)}\n`);
    repo.write("csh/keys/owner.asc", repo.publicKey("Owner"));
    rootCommit = repo.commit("Maintainers", "Owner");
    // Step 5: approve every fragment of the specification, the ledger committed alone and signed.
    const saved = { GNUPGHOME: process.env.GNUPGHOME, GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL };
    process.env.GNUPGHOME = repo.env.GNUPGHOME;
    process.env.GIT_CONFIG_GLOBAL = "/dev/null";
    try {
      const e = await evaluateProject(loadProject(repo.dir, repo.dir), { solver: await createZ3Solver(), noCache: true });
      if (!e.ok) throw new Error(e.message);
      const items = new Map(e.report.items.map((i) => [`${i.source}/${i.id}`, i.textDigest]));
      const lines = fragmentsOf(e.model).map((f, i) => {
        const d: Decision = { schema: "csh-decision/v1", seq: i + 1, kind: "approve", fragment: f.name, digest: f.digest, rationale: "approved for the stage 17 exit test", actor: "Owner", selfApproved: true };
        if (f.cites.length > 0) d.cited = f.cites.map((c) => ({ source: c.source, id: c.id, textDigest: items.get(`${c.source}/${c.id}`) ?? "missing" }));
        return formatDecision(d);
      });
      repo.write(LEDGER_PATH, lines.map((l) => `${l}\n`).join(""));
      repo.commit("Approve the gate's rules and bindings", "Owner");
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
    // The mode moves to enforcing in a change of its own, after the approvals (section 3.2).
    const cfg = JSON.parse(readFileSync(join(repo.dir, "csh", "config.json"), "utf8")) as Record<string, unknown>;
    repo.write("csh/config.json", `${JSON.stringify({ ...cfg, mode: "enforcing" }, null, 2)}\n`);
    repo.commit("The gate enforces", "Owner");
  }, 600_000);

  afterAll(() => {
    repo?.dispose();
    if (runnerHome !== undefined) rmSync(runnerHome, { recursive: true, force: true });
  });

  it("passes in the approved state, and csh status says the component is protected", async () => {
    const r = await runJob();
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/protection {3}protected\n/);
    expect(r.out).toMatch(/accepted: the decision is for this snapshot/);
    expect(r.decision?.overall).not.toBe("block");
  }, 600_000);

  it("fails, rather than passing as unprotected, when the root is not pinned or cannot be used", async () => {
    const unpinned = await runJob({ CSH_ROOT_COMMIT: "" });
    expect(unpinned.status, unpinned.out).not.toBe(0);
    expect(unpinned.out).toMatch(/CSH_ROOT_COMMIT is not set/);
    const unusable = await runJob({ CSH_ROOT_COMMIT: "0000000000000000000000000000000000000000" });
    expect(unusable.status, unusable.out).not.toBe(0);
    expect(unusable.out).toMatch(/CSH_ROOT_COMMIT is set but cannot be used/);
  }, 600_000);

  it("still enforces when a change deletes the maintainers file from the working tree", async () => {
    const file = join(repo.dir, MAINTAINERS_PATH);
    const saved = readFileSync(file, "utf8");
    rmSync(file);
    try {
      const r = await runJob();
      expect(r.out).not.toMatch(/passing \(rule 20\)/);
      expect(r.out).toMatch(/csh gate|accepted|block|refused/);
    } finally {
      writeFileSync(file, saved);
    }
  }, 600_000);

  it("fails on the regression commit, which keeps the probe's tests green", async () => {
    for (const f of ["src/gate.ts", "test/gate.probe.ts"]) copyFileSync(join(gateDir, "regression", f), join(repo.dir, f));
    repo.commit("Simplify: an unknown verdict never blocks", null);
    const r = await runJob();
    expect(r.status, r.out).not.toBe(0);
    expect(r.decision?.overall).toBe("block");
    expect(r.decision?.obligations.find((o) => o.fragment === "Gate/NoViolationAllowed/ReviewUnknown")?.disposition).toBe("block");
    // The tests themselves passed: the harness exited 0, as the regression intends.
    expect(r.out).toMatch(/harness tdd: .* exit 0/);
  }, 600_000);
});
