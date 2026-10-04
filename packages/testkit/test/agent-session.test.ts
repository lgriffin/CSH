// The scripted agent session of stage 20 (Next layers, sections 6.3 and 9): a client with no language model follows the
// working protocol of docs/guides/agents.md on the lockout regression, through the agent tool server, and receives the
// diff that says stop. The transcript it prints is the one the guide shows, and the test holds the guide to it.
import { cpSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { unquotedStrings } from "@csh/agent";
import { fragmentsOf } from "@csh/kernel";
import { type Decision, formatDecision, LEDGER_PATH, MAINTAINERS_PATH } from "@csh/ledger";
import { evaluateProject, loadProject } from "@csh/run";
import { createZ3Solver } from "@csh/solver";
import { createTestRepo, gpgAvailable, type TestRepo } from "../src/git.ts";

const repoRoot = resolve(import.meta.dirname, "../../..");
const lockout = join(repoRoot, "examples", "lockout");
const agentBin = join(repoRoot, "packages", "agent", "bin", "csh-agent.js");
const guide = join(repoRoot, "docs", "guides", "agents.md");

let repo: TestRepo;

type Envelope = { ok: boolean; result?: any; error?: unknown };

/** One line per call and one per answer, from the envelope's harness-produced fields; commits are not printed. */
function summary(tool: string, e: Envelope): string {
  if (!e.ok) return `← ${tool} failed`;
  const r = e.result;
  switch (tool) {
    case "status":
      return `← ${r.protection} (${r.reasons.join(", ") || "no reasons"}); ${r.fragments.approved} of ${r.fragments.total} fragments approved`;
    case "run": {
      const by = (v: string) => r.obligations.filter((o: { verdict: string }) => o.verdict === v).length;
      const approved = r.obligations.filter((o: { authority: string }) => o.authority === "approved").length;
      return `← gate ${r.gate.overall} (${r.gate.mode}); ${r.obligations.length} rules, ${approved} approved: ${by("satisfied")} satisfied, ${by("violated")} violated, ${by("unknown")} unknown`;
    }
    case "diff":
      return [
        `← says ${r.says}`,
        `  approvals lost: ${r.approvalsLost.length === 0 ? "none" : r.approvalsLost.join(", ")}`,
        `  new violations and conflicts on approved rules: ${r.newViolationsAndConflictsOnApprovedRules.map((o: { fragment: string; verdict: string[] }) => `${o.fragment} (${o.verdict.join(" -> ")})`).join(", ") || "none"}`,
        `  observations: ${r.observations.map((o: { k: string }) => o.k).join(", ") || "none"}`,
      ].join("\n");
    default:
      return `← ok`;
  }
}

describe.skipIf(!gpgAvailable())("a scripted agent session on the lockout regression", () => {
  beforeAll(async () => {
    repo = createTestRepo(join(repoRoot, ".csh-cache", "agent-session"), ["Owner", "Agent"]);
    cpSync(lockout, repo.dir, { recursive: true, filter: (p) => !/[\\/](countermeasures|model|regression|stages|reports|\.csh-cache)$/.test(p) });
    for (const d of ["countermeasures", "model"]) cpSync(join(lockout, d), repo.dir, { recursive: true });
    writeFileSync(join(repo.dir, ".gitignore"), "node_modules\nreports/\n.csh-cache/\n");
    symlinkSync(join(repoRoot, "node_modules"), join(repo.dir, "node_modules"), "dir");
    repo.commit("Lockout with the countermeasures and a model", null);
    repo.write(MAINTAINERS_PATH, `${JSON.stringify(repo.maintainers(["Owner", "Agent"], { Owner: { kind: "person", roles: ["intent-owner", "domain-reviewer"] }, Agent: { kind: "agent", roles: ["contributor"] } }), null, 2)}\n`);
    repo.commit("Maintainers", "Owner");
    // The owner approves every rule and binding, the ledger committed alone and signed.
    const saved = { GNUPGHOME: process.env.GNUPGHOME, GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL };
    process.env.GNUPGHOME = repo.env.GNUPGHOME;
    process.env.GIT_CONFIG_GLOBAL = "/dev/null";
    try {
      const e = await evaluateProject(loadProject(repo.dir, repo.dir), { solver: await createZ3Solver(), noCache: true });
      if (!e.ok) throw new Error(e.message);
      const items = new Map(e.report.items.map((i) => [`${i.source}/${i.id}`, i.textDigest]));
      const lines = fragmentsOf(e.model).map((f, i) => {
        const d: Decision = { schema: "csh-decision/v1", seq: i + 1, kind: "approve", fragment: f.name, digest: f.digest, rationale: "approved for the scripted agent session", actor: "Owner", selfApproved: true };
        if (f.cites.length > 0) d.cited = f.cites.map((c) => ({ source: c.source, id: c.id, textDigest: items.get(`${c.source}/${c.id}`) ?? "missing" }));
        return formatDecision(d);
      });
      repo.write(LEDGER_PATH, lines.map((l) => `${l}\n`).join(""));
      repo.commit("Approve the lockout rules and bindings", "Owner");
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }, 600_000);

  afterAll(() => repo?.dispose());

  it("follows the protocol and stops at the diff, with the transcript the guide shows", async () => {
    const env = Object.fromEntries(Object.entries(repo.env).filter((e): e is [string, string] => e[1] !== undefined && e[0] !== "CSH_ROOT_COMMIT"));
    const client = new Client({ name: "scripted-agent", version: "0.1.0" });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [agentBin, "--root", repo.dir], cwd: repo.dir, env, stderr: "pipe" }));
    const transcript: string[] = [];
    const call = async (tool: string, args: Record<string, unknown> = {}, shown = args): Promise<Envelope> => {
      const r = (await client.callTool({ name: tool, arguments: args })) as { content: { text: string }[] };
      const e = JSON.parse(r.content[0]!.text) as Envelope;
      expect(e.ok, JSON.stringify(e)).toBe(true);
      // Nothing outside a quoted key is source text; here, no test name or sentence leaks into the protocol's fields.
      for (const u of unquotedStrings(e)) expect(u.value).not.toMatch(/third failed attempt/i);
      transcript.push(`→ ${tool} ${JSON.stringify(shown)}`, summary(tool, e));
      return e;
    };
    try {
      // 1. Before changing anything: status and run. Know what is approved.
      await call("status");
      const start = await call("run");
      const startCommit = start.result.commit as string;
      // 2. The change: the agent rereads "three failed attempts" as three allowed and edits the code and its test.
      for (const f of ["src/lockout.ts", "test/lockout.test.ts"]) cpSync(join(lockout, "regression", f), join(repo.dir, f));
      repo.commit("Simplify the lockout threshold", "Agent");
      transcript.push("(the agent edits src/lockout.ts and test/lockout.test.ts, and commits with its own key)");
      // 3. Run, then diff against the commit it started from.
      await call("run");
      const diff = await call("diff", { base: startCommit, head: "HEAD" }, { base: "<start>", head: "HEAD" });
      // 4. An approved rule newly violated: stop and report the diff.
      expect(diff.result.says).toBe("stop");
      expect(diff.result.newViolationsAndConflictsOnApprovedRules.map((o: { fragment: string }) => o.fragment)).toEqual(["SignInService/StopPasswordGuessing/LockOnThirdFailure"]);
      transcript.push("(the agent stops, reports the diff, and edits no rule, binding or probe)");
    } finally {
      await client.close();
    }
    const text = transcript.join("\n");
    expect(readFileSync(guide, "utf8"), `docs/guides/agents.md must show the transcript:\n${text}`).toContain(`\`\`\`text\n${text}\n\`\`\``);
  }, 600_000);
});
