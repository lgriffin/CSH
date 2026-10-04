// csh run (Anchor, harnesses and A3, section 4): a run executes each harness, evaluates, decides and stores one record
// per snapshot; a run at a past commit uses a throwaway worktree and installs nothing (A-38).
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ComponentManifest } from "@csh/component";
import { digestOf, type Module } from "@csh/kernel";
import { createZ3Solver, type SolverPort } from "@csh/solver";
import { changedInputs, evaluateSpec, inputDigests, type Project, type RunRecord, runAt, runComponent, runHarnesses, runSources, type RunSourcesOptions, unchangedSince } from "../src/index.ts";

const REPO = resolve(import.meta.dirname, "../../..");
let proj: string;
let z3: SolverPort;
let first: string;

/** Worktrees a run left behind. */
const leftOver = (top: string) => (existsSync(join(top, ".csh-cache", "worktrees")) ? readdirSync(join(top, ".csh-cache", "worktrees")).filter((d) => d.startsWith("run-")) : []);
const git = (...args: string[]) => execFileSync("git", args, { cwd: proj, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const commitAll = (message: string) => {
  git("add", "-A");
  git("commit", "-q", "-m", message);
  return git("rev-parse", "HEAD");
};

// The harness: copies the recorded witnesses to the file csh run names, and says so on its output.
const HARNESS = `import { copyFileSync } from "node:fs";
copyFileSync("recorded.ndjson", process.env.CSH_WITNESS_FILE);
console.log("harness ran for " + process.env.CSH_COMMIT);
`;

const manifest = {
  schema: "csh-component/v1",
  name: "SignInService",
  spec: "spec.csl.ts",
  implementation: ["src"],
  practices: [
    { id: "ears", name: "EARS", kind: "requirements", sources: ["Product"] },
    { id: "tdd", name: "TDD", kind: "tests", sources: ["UnitTests"], harness: { run: ["node", "harness.mjs"], witnesses: "inputs/witnesses.ndjson" } },
  ],
};

beforeAll(async () => {
  z3 = await createZ3Solver();
  // Inside the repository's cache directory, so that the specification resolves the csl package.
  mkdirSync(join(REPO, ".csh-cache"), { recursive: true });
  proj = mkdtempSync(join(REPO, ".csh-cache", "run-"));
  cpSync(join(REPO, "fixtures", "base"), join(proj, "base"), { recursive: true });
  mkdirSync(join(proj, "inputs"));
  cpSync(join(REPO, "fixtures", "F81", "inputs", "requirements.md"), join(proj, "inputs", "requirements.md"));
  cpSync(join(REPO, "fixtures", "F81", "inputs", "witnesses.ndjson"), join(proj, "recorded.ndjson"));
  writeFileSync(join(proj, "spec.csl.ts"), 'export { default } from "./base/signin.csl.ts";\n');
  writeFileSync(join(proj, "harness.mjs"), HARNESS);
  mkdirSync(join(proj, "src"));
  writeFileSync(join(proj, "src", "signin.ts"), "export const version = 1;\n");
  mkdirSync(join(proj, "csh"));
  writeFileSync(join(proj, "csh", "component.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(join(proj, ".gitignore"), "reports/\n.csh-cache/\ninputs/witnesses.ndjson\n");
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test-only@example.invalid");
  git("config", "user.name", "test-only");
  git("config", "commit.gpgsign", "false");
  first = commitAll("init");
}, 60000);
afterAll(() => rmSync(proj, { recursive: true, force: true }));

describe("runComponent", () => {
  it("runs the harness, evaluates and stores a record whose digests are of the stored bytes", async () => {
    let output = "";
    const r = await runComponent({ root: proj, solver: z3, harnessOutput: (s) => void (output += s) });
    if (!r.ok) throw new Error(r.message);
    expect(output).toContain(`harness ran for ${first}`);
    expect(r.record.component).toBe("SignInService");
    expect(r.record.snapshot.commit).toBe(first);
    expect(r.record.snapshot.componentDigest).toMatch(/^sha256:/);
    expect(r.record.harnesses).toEqual([{ practice: "tdd", argv: ["node", "harness.mjs"], exitCode: 0, witnesses: 1, executions: 0, sandbox: "none" }]);
    const stored = JSON.parse(readFileSync(join(r.dir, "run.json"), "utf8")) as RunRecord;
    expect(stored).toEqual(r.record);
    expect(digestOf(readFileSync(join(r.dir, "report.json")))).toBe(r.record.reportDigest);
    expect(digestOf(readFileSync(join(r.dir, "gate.json")))).toBe(r.record.gateDigest);
    expect(r.dir).toBe(join(proj, ".csh-cache", "runs", r.record.snapshotDigest.replace(/^sha256:/, "")));
    expect(existsSync(join(proj, "reports", "csh-report.json"))).toBe(true);
    expect(r.report.component?.name).toBe("SignInService");
  }, 120000);

  it("gives the same snapshot the same record", async () => {
    const a = await runComponent({ root: proj, solver: z3 });
    const b = await runComponent({ root: proj, solver: z3 });
    if (!a.ok || !b.ok) throw new Error("run failed");
    expect(b.dir).toBe(a.dir);
    expect(b.record).toEqual(a.record);
  }, 120000);

  it("keeps a failing harness's exit code as a fact and still evaluates", async () => {
    writeFileSync(join(proj, "harness.mjs"), `${HARNESS}process.exitCode = 1;\n`);
    try {
      const r = await runComponent({ root: proj, solver: z3 });
      if (!r.ok) throw new Error(r.message);
      expect(r.record.harnesses[0]!.exitCode).toBe(1);
      expect(r.record.snapshot.commit).toBe(`${first}-dirty`);
    } finally {
      writeFileSync(join(proj, "harness.mjs"), HARNESS);
    }
  }, 120000);

  it("refuses a manifest that does not match the specification before any harness runs (#18)", async () => {
    const file = join(proj, "csh", "component.json");
    writeFileSync(file, JSON.stringify({ ...manifest, name: "OtherService" }, null, 2));
    writeFileSync(join(proj, "inputs", "witnesses.ndjson"), "kept\n");
    try {
      let output = "";
      const r = await runComponent({ root: proj, solver: z3, harnessOutput: (s) => void (output += s) });
      expect(r.ok ? "ok" : r.code).toBe("evaluation-failed");
      expect(r.ok ? "" : r.message).toMatch(/component-name-mismatch/);
      expect(output).toBe("");
      // Not even the old witness file is removed: nothing of the run happened.
      expect(readFileSync(join(proj, "inputs", "witnesses.ndjson"), "utf8")).toBe("kept\n");
    } finally {
      writeFileSync(file, JSON.stringify(manifest, null, 2));
    }
  }, 120000);

  it("refuses a run whose harness changed a file it evaluates (#17)", async () => {
    const requirements = join(proj, "inputs", "requirements.md");
    const original = readFileSync(requirements, "utf8");
    const imported = join(proj, "base", "signin.csl.ts");
    const spec = readFileSync(imported, "utf8");
    try {
      for (const [file, edit] of [
        ["inputs/requirements.md", "a source"],
        ["base/signin.csl.ts", "a file the specification imports"],
        ["csh/config.json", "the configuration"],
      ] as const) {
        writeFileSync(join(proj, "harness.mjs"), `${HARNESS}import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(file)}, "\\n");\n`);
        const r = await runComponent({ root: proj, solver: z3 });
        expect(r.ok ? "ok" : r.code, edit).toBe("inputs-changed-by-harness");
        expect(r.ok ? "" : r.message, edit).toContain(file);
        writeFileSync(requirements, original);
        writeFileSync(imported, spec);
        rmSync(join(proj, "csh", "config.json"), { force: true });
      }
    } finally {
      writeFileSync(join(proj, "harness.mjs"), HARNESS);
      writeFileSync(requirements, original);
      writeFileSync(imported, spec);
      rmSync(join(proj, "csh", "config.json"), { force: true });
    }
    // Its own witness file is the harness's to write.
    const ok = await runComponent({ root: proj, solver: z3 });
    expect(ok.ok ? "ok" : ok.message).toBe("ok");
  }, 120000);

  it("refuses a root without a manifest, and a manifest that cannot be used", async () => {
    const empty = mkdtempSync(join(REPO, ".csh-cache", "run-empty-"));
    try {
      const none = await runComponent({ root: empty, solver: z3 });
      expect(none.ok ? "ok" : none.code).toBe("no-component");
      mkdirSync(join(empty, "csh"));
      writeFileSync(join(empty, "csh", "component.json"), "{}");
      const bad = await runComponent({ root: empty, solver: z3 });
      expect(bad.ok ? "ok" : bad.code).toBe("component-unusable");
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("runAt", () => {
  it("runs a past commit in a worktree and stores the record under the project", async () => {
    writeFileSync(join(proj, "src", "signin.ts"), "export const version = 2;\n");
    const second = commitAll("second");
    expect(second).not.toBe(first);
    const r = await runAt({ root: proj, solver: z3, commit: first });
    if (!r.ok) throw new Error(r.message);
    expect(r.record.snapshot.commit).toBe(first);
    expect(r.dir.startsWith(join(proj, ".csh-cache", "runs"))).toBe(true);
    expect(leftOver(proj)).toEqual([]);
  }, 120000);

  it("gives two runs of one commit a worktree each", async () => {
    // Another run's worktree, as the old fixed path named it: a run removes only its own.
    const other = join(proj, ".csh-cache", "worktrees", `run-${first}`);
    mkdirSync(other, { recursive: true });
    writeFileSync(join(other, "in-use"), "");
    const [a, b] = await Promise.all([runAt({ root: proj, solver: z3, commit: first }), runAt({ root: proj, solver: z3, commit: first })]);
    expect([a.ok ? "ok" : a.message, b.ok ? "ok" : b.message]).toEqual(["ok", "ok"]);
    expect(a.ok && b.ok && a.record.snapshotDigest === b.record.snapshotDigest).toBe(true);
    expect(existsSync(join(other, "in-use"))).toBe(true);
    rmSync(other, { recursive: true });
    expect(leftOver(proj)).toEqual([]);
  }, 120000);

  it("refuses a commit whose dependency files differ, and a name that is not a commit", async () => {
    writeFileSync(join(proj, "package.json"), '{ "name": "signin", "private": true }\n');
    commitAll("dependencies");
    const r = await runAt({ root: proj, solver: z3, commit: first });
    expect(r.ok ? "ok" : r.code).toBe("dependencies-differ");
    const u = await runAt({ root: proj, solver: z3, commit: "no-such-commit" });
    expect(u.ok ? "ok" : u.code).toBe("unknown-commit");
  }, 60000);

  it("runs a component inside a workspace with the packages installed for it", async () => {
    // A component in a subdirectory whose harness imports a package installed only in that subdirectory's
    // node_modules, as a workspace package's own dependencies are.
    const ws = mkdtempSync(join(REPO, ".csh-cache", "run-ws-"));
    const g = (...args: string[]) => execFileSync("git", args, { cwd: ws, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    try {
      const pkg = join(ws, "packages", "signin");
      cpSync(proj, pkg, { recursive: true, filter: (src) => !/[\\/](\.git|\.csh-cache|reports|package\.json)$/.test(src) });
      mkdirSync(join(pkg, "node_modules", "copy-witnesses"), { recursive: true });
      writeFileSync(join(pkg, "node_modules", "copy-witnesses", "package.json"), '{ "name": "copy-witnesses", "type": "module", "exports": "./index.js" }\n');
      writeFileSync(join(pkg, "node_modules", "copy-witnesses", "index.js"), 'import { copyFileSync } from "node:fs";\nexport const copy = (from, to) => copyFileSync(from, to);\n');
      writeFileSync(join(pkg, "harness.mjs"), 'import { copy } from "copy-witnesses";\ncopy("recorded.ndjson", process.env.CSH_WITNESS_FILE);\n');
      writeFileSync(join(ws, ".gitignore"), "node_modules/\nreports/\n.csh-cache/\ninputs/witnesses.ndjson\n");
      g("init", "-q", "-b", "main");
      g("config", "user.email", "test-only@example.invalid");
      g("config", "user.name", "test-only");
      g("config", "commit.gpgsign", "false");
      g("add", "-A");
      g("commit", "-q", "-m", "workspace");
      const commit = g("rev-parse", "HEAD");
      const r = await runAt({ root: pkg, solver: z3, commit });
      if (!r.ok) throw new Error(r.message);
      expect(r.record.harnesses[0]).toMatchObject({ exitCode: 0, witnesses: 1 });
      expect(leftOver(ws)).toEqual([]);
      expect(existsSync(join(pkg, "node_modules", "copy-witnesses", "index.js"))).toBe(true);
      // A workspace sibling linked into node_modules, as pnpm links workspace:* dependencies: once its source changes
      // after the commit, with no dependency file changed, the commit would run against today's sibling.
      mkdirSync(join(ws, "packages", "lib"));
      writeFileSync(join(ws, "packages", "lib", "package.json"), '{ "name": "lib", "type": "module", "exports": "./index.js" }\n');
      writeFileSync(join(ws, "packages", "lib", "index.js"), "export const n = 1;\n");
      symlinkSync(join("..", "..", "lib"), join(pkg, "node_modules", "lib"), "dir");
      g("add", "-A");
      g("commit", "-q", "-m", "a sibling");
      const sibling = g("rev-parse", "HEAD");
      expect(await runAt({ root: pkg, solver: z3, commit: sibling }).then((x) => (x.ok ? "ok" : x.message))).toBe("ok");
      writeFileSync(join(ws, "packages", "lib", "index.js"), "export const n = 2;\n");
      const d = await runAt({ root: pkg, solver: z3, commit: sibling });
      expect(d.ok ? "ok" : d.code).toBe("workspace-differs");
      expect(d.ok ? "" : d.message).toMatch(/packages\/lib/);
      // Deleted since the commit: the link dangles, and the run is refused just the same.
      rmSync(join(ws, "packages", "lib"), { recursive: true });
      const gone = await runAt({ root: pkg, solver: z3, commit: sibling });
      expect(gone.ok ? "ok" : gone.code).toBe("workspace-differs");
      expect(gone.ok ? "" : gone.message).toMatch(/packages\/lib/);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  }, 120000);
});

describe("unchangedSince", () => {
  it("counts every file outside csh/ when the implementation list is empty, as when it is absent", () => {
    const vcs = { isAncestor: () => true, changedBetween: () => ["src/signin.ts"] };
    const at = (implementation: string[]) => unchangedSince({ vcs, config: {}, component: { manifest: { ...manifest, implementation }, digest: "" } } as unknown as Project)!("a", "b");
    expect(at([])).toBe(false);
    expect(at(["src"])).toBe(false);
    expect(at(["lib"])).toBe(true);
  });
});

describe("runHarnesses", () => {
  it("clears each file once before any harness, so harnesses sharing a file both keep their lines", async () => {
    const dir = mkdtempSync(join(REPO, ".csh-cache", "run-harnesses-"));
    try {
      mkdirSync(join(dir, "reports"));
      writeFileSync(join(dir, "reports", "executions.ndjson"), "stale\n");
      const line = (s: string) => ["node", "-e", `const f=require("fs");f.appendFileSync(process.env.CSH_EXECUTIONS_FILE,"${s}\\n");f.appendFileSync(process.env.CSH_WITNESS_FILE,"${s}\\n")`];
      const practices = [
        { id: "a", name: "A", kind: "tests" as const, sources: ["A"], harness: { run: line("a"), witnesses: "reports/w.ndjson" } },
        { id: "b", name: "B", kind: "tests" as const, sources: ["B"], harness: { run: line("b"), witnesses: "reports/w.ndjson" } },
      ];
      const recs = await runHarnesses({ root: dir, commit: "c" } as Project, { ...manifest, practices } as ComponentManifest, () => undefined);
      expect(readFileSync(join(dir, "reports", "executions.ndjson"), "utf8")).toBe("a\nb\n");
      expect(readFileSync(join(dir, "reports", "w.ndjson"), "utf8")).toBe("a\nb\n");
      expect(recs.map((r) => [r.exitCode, r.witnesses, r.executions])).toEqual([[0, 1, 1], [0, 1, 1]]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("kills a harness that runs past its timeout, with everything it started, and records it (#20)", async () => {
    const dir = mkdtempSync(join(REPO, ".csh-cache", "run-harnesses-"));
    try {
      // The command starts a grandchild that would outlive it, records its pid, and then hangs.
      const hang = ["node", "-e", `const {spawn}=require("child_process");const c=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});require("fs").writeFileSync("pid",String(c.pid));setInterval(()=>{},1000)`];
      const practices = [{ id: "a", name: "A", kind: "tests" as const, sources: ["A"], harness: { run: hang, witnesses: "reports/w.ndjson", timeoutMs: 1500 } }];
      const started = Date.now();
      const recs = await runHarnesses({ root: dir, commit: "c" } as Project, { ...manifest, practices } as ComponentManifest, () => undefined);
      expect(Date.now() - started).toBeLessThan(30000);
      expect(recs[0]).toMatchObject({ exitCode: null, error: "timed out after 1500 ms" });
      const pid = Number(readFileSync(join(dir, "pid"), "utf8"));
      const alive = () => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      };
      for (let i = 0; i < 50 && alive(); i++) await new Promise((r) => setTimeout(r, 100));
      expect(alive()).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});

describe("an interrupted run", () => {
  it("takes the harness's whole process tree with it (review of #20)", async () => {
    const dir = mkdtempSync(join(REPO, ".csh-cache", "run-interrupt-"));
    try {
      // csh, in a process of its own, running a harness that starts a grandchild and hangs; each records its pid.
      const hang = ["node", "-e", 'const {spawn}=require("child_process");const c=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});require("fs").writeFileSync("pids",process.pid+" "+c.pid);setInterval(()=>{},1000)'];
      const practices = [{ id: "a", name: "A", kind: "tests", sources: ["A"], harness: { run: hang, witnesses: "reports/w.ndjson" } }];
      writeFileSync(join(dir, "csh.mjs"), `import { runHarnesses } from ${JSON.stringify(pathToFileURL(join(REPO, "packages", "run", "src", "index.ts")).href)};\nawait runHarnesses({ root: ${JSON.stringify(dir)}, commit: "c" }, ${JSON.stringify({ ...manifest, practices })}, () => undefined);\n`);
      const csh = spawn(process.execPath, [join(dir, "csh.mjs")], { stdio: "ignore" });
      const exited = new Promise((r) => csh.on("exit", r));
      for (let i = 0; i < 200 && !existsSync(join(dir, "pids")); i++) await new Promise((r) => setTimeout(r, 100));
      const pids = readFileSync(join(dir, "pids"), "utf8").split(" ").map(Number);
      csh.kill("SIGINT");
      await exited;
      const alive = (pid: number) => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      };
      for (let i = 0; i < 50 && pids.some(alive); i++) await new Promise((r) => setTimeout(r, 100));
      const left = pids.filter(alive);
      for (const pid of left) process.kill(pid, "SIGKILL");
      expect(left).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});

describe("inputDigests", () => {
  // A project of plain files: the specification, a harness-owned source directory, and the manifest's other inputs.
  const project = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(REPO, ".csh-cache", "run-inputs-"));
    for (const [f, text] of Object.entries(files)) {
      mkdirSync(join(dir, f, ".."), { recursive: true });
      writeFileSync(join(dir, f), text);
    }
    return dir;
  };
  const tdd = (extra: object = {}) => ({ ...manifest, spec: "spec.ts", practices: [{ id: "tdd", name: "TDD", kind: "tests", sources: ["UnitTests"], harness: { run: ["node"], witnesses: "w/out.ndjson" }, ...extra }] }) as ComponentManifest;
  const mod = (at: string) => ({ sources: [{ name: "UnitTests", kind: "Witnesses", at }] }) as unknown as Module;
  const moved = (dir: string, c: ComponentManifest, m: Module, change: () => void) => {
    const p = { root: dir, config: {}, component: { manifest: c, digest: "" } } as unknown as Project;
    const before = inputDigests(p, c, m);
    change();
    return changedInputs(before, inputDigests(p, c, m));
  };

  it("digests every file of a harness's source directory but the harness's own output (review of #17)", () => {
    const dir = project({ "spec.ts": "", "w/out.ndjson": "a\n", "w/recorded.ndjson": "b\n" });
    try {
      expect(moved(dir, tdd(), mod("w"), () => writeFileSync(join(dir, "w", "out.ndjson"), "changed\n"))).toEqual([]);
      expect(moved(dir, tdd(), mod("w"), () => writeFileSync(join(dir, "w", "recorded.ndjson"), "changed\n"))).toEqual(["w/recorded.ndjson"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("digests a practice's project-local adapter and step table, with what they import (review of #17)", () => {
    const dir = project({ "spec.ts": "", "w/out.ndjson": "", "adapters/a.mjs": 'import { x } from "./helper.mjs";\n', "adapters/helper.mjs": "export const x = 1;\n", "csh/steps.ts": "export {};\n" });
    try {
      const c = { ...manifest, spec: "spec.ts", practices: [{ id: "tdd", name: "TDD", kind: "tests", sources: ["UnitTests"], adapter: "./adapters/a.mjs", harness: { run: ["node"], witnesses: "w/out.ndjson" } }, { id: "bdd", name: "BDD", kind: "scenarios", sources: ["Scenarios"], steps: "csh/steps.ts" }] } as ComponentManifest;
      expect(moved(dir, c, mod("w"), () => writeFileSync(join(dir, "adapters", "helper.mjs"), "export const x = 2;\n"))).toEqual(["adapters/helper.mjs"]);
      expect(moved(dir, c, mod("w"), () => writeFileSync(join(dir, "csh", "steps.ts"), "export const changed = 1;\n"))).toEqual(["csh/steps.ts"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("digests what a source link reaches inside the root, and the link itself (review of #17)", () => {
    const dir = project({ "spec.ts": "", "data/real.md": "a\n", "other.md": "b\n" });
    try {
      symlinkSync("data/real.md", join(dir, "linked.md"));
      symlinkSync("data", join(dir, "ld"));
      // A link back up to the root is walked once, never for ever.
      symlinkSync("..", join(dir, "data", "up"));
      const two = { sources: [{ name: "A", kind: "Requirements", at: "linked.md" }, { name: "B", kind: "Requirements", at: "ld" }] } as unknown as Module;
      expect(moved(dir, tdd(), two, () => writeFileSync(join(dir, "data", "real.md"), "changed\n"))).toEqual(["ld/real.md", "ld/up/linked.md", "linked.md"]);
      expect(moved(dir, tdd(), two, () => {
        rmSync(join(dir, "linked.md"));
        symlinkSync("other.md", join(dir, "linked.md"));
      })).toEqual(["ld/up/linked.md", "ld/up/linked.md ->", "linked.md", "linked.md ->"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the executions file joined to a Witnesses source (#22)", () => {
  it("is joined only where a practice's harness or executions, or a manifest-less configuration, names one", async () => {
    const tmp = mkdtempSync(join(REPO, ".csh-cache", "run-exec-"));
    try {
      cpSync(join(REPO, "fixtures", "F82"), join(tmp, "F82"), { recursive: true });
      cpSync(join(REPO, "fixtures", "base"), join(tmp, "base"), { recursive: true });
      const d = join(tmp, "F82");
      // A reporter's lines at the default path: another practice's run, or one by hand.
      mkdirSync(join(d, "reports"));
      cpSync(join(d, "inputs", "executions.ndjson"), join(d, "reports", "executions.ndjson"));
      const parsed = JSON.parse(readFileSync(join(d, "inputs", "component.json"), "utf8")) as ComponentManifest;
      const tdd = parsed.practices[1]!;
      const joined = async (practice: object | undefined, executions?: string) => {
        const component = practice === undefined ? undefined : { manifest: { ...parsed, practices: [parsed.practices[0]!, { ...tdd, harness: undefined, ...practice }] } as ComponentManifest, digest: "" };
        const r = await evaluateSpec(join(d, "spec.csl.ts"), { root: d, solver: z3, emit: { readable: [tmp] }, ...(component !== undefined ? { component } : {}), ...(executions !== undefined ? { executions } : {}) });
        return (r.runs ?? []).find((x) => x.source === "UnitTests")!.files.map((f) => f.path).filter((p) => p.includes("executions"));
      };
      expect(await joined({ harness: tdd.harness })).toEqual(["inputs/executions.ndjson"]);
      expect(await joined({ harness: { run: ["node"], witnesses: "inputs/witnesses.ndjson" } })).toEqual(["reports/executions.ndjson"]);
      expect(await joined({})).toEqual([]);
      expect(await joined({ executions: "inputs/executions.ndjson" })).toEqual(["inputs/executions.ndjson"]);
      expect(await joined(undefined)).toEqual([]);
      expect(await joined(undefined, "reports/executions.ndjson")).toEqual(["reports/executions.ndjson"]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 120000);
});

describe("pre-lifted claims in a Scenarios source (#26)", () => {
  it("are read as claims-json when no adapter is named and every file is csh-ir/v1 JSON; other kinds keep their adapter", async () => {
    const tmp = mkdtempSync(join(REPO, ".csh-cache", "run-ir-"));
    try {
      mkdirSync(join(tmp, "features"));
      mkdirSync(join(tmp, "witnesses"));
      const claims = { schema: "csh-ir/v1", source: "Scenarios", assumptions: [], obligations: [], examples: [], unliftable: [{ span: "x", reason: "unknown-term", text: "t" }] };
      writeFileSync(join(tmp, "features", "a.json"), JSON.stringify(claims));
      writeFileSync(join(tmp, "witnesses", "a.json"), JSON.stringify({ ...claims, source: "Tests" }));
      const module = { schema: "csh-ir/v1", system: "X", uses: [], vocabulary: { units: [], enums: [], states: [], events: [] }, transitions: [], policies: [], intents: [], claims: [], bindings: [], sources: [{ name: "Scenarios", kind: "Scenarios", at: "features" }, { name: "Tests", kind: "Witnesses", at: "witnesses" }] } as unknown as Module;
      const adapterOf = async (o: Partial<RunSourcesOptions> = {}) => Object.fromEntries((await runSources(module, { root: tmp, isolated: false, ...o })).map((r) => [r.source, r.adapter]));
      expect(await adapterOf()).toEqual({ Scenarios: "claims-json", Tests: "@csh/adapter-witness-files" });
      const lifted = (await runSources(module, { root: tmp, isolated: false })).find((r) => r.source === "Scenarios")!;
      expect(lifted.output.claims!.unliftable.map((u) => u.reason)).toEqual(["unknown-term"]);
      // A named adapter is used; so is the Gherkin adapter for a file that does not declare csh-ir/v1, or a feature file.
      expect((await adapterOf({ perSource: { Scenarios: { adapter: "@csh/adapter-gherkin" } } })).Scenarios).toBe("@csh/adapter-gherkin");
      expect((await adapterOf({ adapters: { Scenarios: "@csh/adapter-gherkin" } })).Scenarios).toBe("@csh/adapter-gherkin");
      writeFileSync(join(tmp, "features", "b.feature"), "Feature: f\n");
      expect((await adapterOf()).Scenarios).toBe("@csh/adapter-gherkin");
      rmSync(join(tmp, "features", "b.feature"));
      writeFileSync(join(tmp, "features", "a.json"), JSON.stringify({ ...claims, schema: undefined }));
      expect((await adapterOf()).Scenarios).toBe("@csh/adapter-gherkin");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 60000);
});
