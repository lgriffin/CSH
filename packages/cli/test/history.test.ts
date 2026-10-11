// History (Ingesting a codebase, stage 25): a subject whose prose is older than the code it names, a claim the code
// moved away from, commits with no test and no reference, and csh history recording a stage per release tag.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Report } from "@csh/check";
import { createZ3Solver, type SolverPort } from "@csh/solver";
import { gitHistory, runComponent } from "@csh/run";
import { csh, stageIdOf } from "../src/index.ts";

const REPO = resolve(import.meta.dirname, "../../..");
let base: string;
let subject: string;
let profile: string;
let z3: SolverPort;
const commits: Record<string, string> = {};

const git = (cwd: string, args: string[], env: Record<string, string> = {}) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } }).trim();
const write = (root: string, path: string, text: string) => {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), text);
};
/** A commit at a given date, so that blame and the order of commits are known. */
const commit = (dir: string, name: string, date: string, message = name) => {
  git(dir, ["add", "-A"]);
  git(dir, ["-c", "user.email=test-only@example.invalid", "-c", "user.name=test-only", "-c", "commit.gpgsign=false", "commit", "-q", "-m", message], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
  commits[name] = git(dir, ["rev-parse", "HEAD"]);
  return commits[name]!;
};
function io(cwd: string) {
  const o = { out: "", err: "" };
  return { o, io: { out: (s: string) => void (o.out += s), err: (s: string) => void (o.err += s), cwd, solver: async () => z3 } };
}

const CHARTER = [
  "# Charter",
  "",
  "## R-1 · Enforced",
  "",
  "The client shall validate each parameter.",
  "",
  "- **Verified by:** `validate.test.ts` checks it.",
  "",
  "## R-2 · Enforced",
  "",
  "The default branch shall be protected.",
  "",
  "- **Verified by:** `branch protection`, a repository setting.",
  "",
  "The floor is Node 18; see `src/util.ts` and `config.json`.",
  "",
].join("\n");

const SPEC = `import { system, field } from "csl";
export default system("Dated", (s) => {
  const Charter = s.source("Charter", { kind: "Requirements", at: "docs/charter.md" });
  s.policy("Structural", { require: ["FactsCurrent"] });
  s.intent("Prose", { owner: "Owner", value: "The prose is the code", assurance: "Structural" }, (i) => {
    i.claim("NodeFloor", field("package.json", "/engines/node", ">=18.0.0"), { at: "docs/charter.md:15", cites: [{ source: Charter, id: "R-2" }] });
  });
});
`;

beforeAll(async () => {
  z3 = await createZ3Solver();
  mkdirSync(join(REPO, ".csh-cache"), { recursive: true });
  base = mkdtempSync(join(REPO, ".csh-cache", "history-"));
  subject = join(base, "subject");
  mkdirSync(subject);
  git(subject, ["init", "-q", "-b", "main"]);
  write(subject, "docs/charter.md", CHARTER);
  write(subject, "src/util.ts", "export const util = 1;\n");
  write(subject, "tests/validate.test.ts", "it('validates', () => {});\n");
  write(subject, "a/config.json", "{}\n");
  write(subject, "b/config.json", "{}\n");
  write(subject, "package.json", `${JSON.stringify({ name: "dated", engines: { node: ">=18.0.0" } }, null, 2)}\n`);
  commit(subject, "c1", "2026-01-01T00:00:00Z");
  git(subject, ["tag", "v1.0.0"]);
  write(subject, "src/util.ts", "export const util = 2;\n");
  commit(subject, "c2", "2026-02-01T00:00:00Z", "c2\n\nCo-Authored-By: Claude <noreply@anthropic.com>");
  write(subject, "package.json", `${JSON.stringify({ name: "dated", engines: { node: ">=22.0.0" } }, null, 2)}\n`);
  commit(subject, "c3", "2026-03-01T00:00:00Z", "c3\n\nRefs: R-2");
  write(subject, "src/util.ts", "export const util = 3;\n");
  write(subject, "tests/validate.test.ts", "it('validates again', () => {});\n");
  commit(subject, "c4", "2026-04-01T00:00:00Z");
  git(subject, ["tag", "v2.0.0"]);

  profile = join(base, "profile");
  mkdirSync(profile);
  git(profile, ["init", "-q", "-b", "main"]);
  write(profile, "csh/spec.csl.ts", SPEC);
  write(
    profile,
    "csh/component.json",
    JSON.stringify({
      schema: "csh-component/v2",
      name: "Dated",
      spec: "csh/spec.csl.ts",
      subject: { repo: subject, commit: commits.c4 },
      history: { since: "previous-tag" },
      implementation: ["src"],
      sources: [{ name: "Code", kind: "Code", at: ".", include: ["src/**/*.ts", "package.json"] }],
      practices: [
        { id: "charter", name: "Charter", kind: "requirements", sources: ["Charter"], adapter: "@csh/adapter-items/markdown", settings: { headingFields: "status" } },
        { id: "code", name: "Code", kind: "facts", sources: ["Code"] },
      ],
    }),
  );
  write(profile, ".gitignore", ".csh-cache/\nreports/\n");
  commit(profile, "profile", "2026-05-01T00:00:00Z");
  const f = io(profile);
  if ((await csh(["subject", "fetch"], f.io)) !== 0) throw new Error(f.o.err);
}, 60000);
afterAll(() => rmSync(base, { recursive: true, force: true }));

const gapsOf = (r: Report, kind: string) => r.gapView.gaps.filter((g) => g.kind === kind);

describe("the history source", () => {
  it("dates lines, finds when a line was first written, and lists the commits that changed a file since", () => {
    const h = gitHistory(subject, { implementation: ["src"], since: "previous-tag" });
    expect(h.lineCommit("docs/charter.md", 7)).toEqual({ commit: commits.c1, date: "2026-01-01T00:00:00Z" });
    expect(h.lineOrigin("docs/charter.md", 15)?.commit).toBe(commits.c1);
    expect(h.changedSince(commits.c1!, "src/util.ts").map((d) => d.commit)).toEqual([commits.c4, commits.c2]);
    expect(h.changedSince(commits.c4!, "src/util.ts")).toEqual([]);
    expect(h.introduced("package.json", ">=22.0.0")?.commit).toBe(commits.c3);
    expect(h.lineCommit("docs/nothing.md", 1)).toBeUndefined();
    // Since v1.0.0: c2 changes src with no test and no Refs:, and an agent co-authored it; c3 has Refs:, c4 a test.
    expect(h.untraced()).toEqual([{ commit: commits.c2, date: "2026-02-01T00:00:00Z", files: 1, agent: true }]);
  });

  it("reads implementation paths as the manifest writes them, from a root below the top level, and dates no line of an edited file", () => {
    expect(gitHistory(subject, { implementation: ["./src/"], since: "v1.0.0" }).untraced().map((c) => c.commit)).toEqual([commits.c2]);
    expect(gitHistory(subject, { implementation: ["."], since: "v1.0.0" }).untraced().map((c) => c.commit)).toEqual([commits.c2]);
    // From src, paths are read from src, and a test outside it is not seen: c4's test lies outside the component.
    expect(gitHistory(join(subject, "src"), { implementation: ["."], since: "v1.0.0" }).untraced().map((c) => c.commit)).toEqual([commits.c4, commits.c2]);
    write(subject, "docs/charter.md", `inserted\n${CHARTER}`);
    try {
      const h = gitHistory(subject, { implementation: ["src"] });
      expect(h.lineCommit("docs/charter.md", 7)).toBeUndefined();
      expect(h.lineOrigin("docs/charter.md", 15)).toBeUndefined();
    } finally {
      write(subject, "docs/charter.md", CHARTER);
    }
  });

  it("lists no untraced change without a start, and says why when the start names nothing", () => {
    expect(gitHistory(subject, { implementation: ["src"] }).untraced()).toEqual([]);
    const bad = gitHistory(subject, { implementation: ["src"], since: "v0.0.0" });
    expect(bad.untraced()).toEqual([]);
    expect(bad.sinceProblem).toMatch(/not a commit of the subject/);
  });
});

describe("history in a run", () => {
  it("reports prose older than the file it names, a refuted claim older than its evidence, an unsupported status and an untraced change", async () => {
    const r = await runComponent({ root: profile, solver: z3, reportFiles: false });
    if (!r.ok) throw new Error(r.message);
    const stale = gapsOf(r.report, "stale-prose");
    expect(stale.map((g) => g.subject)).toEqual(["Charter/R-1", "Charter/R-2", "Dated/Prose/NodeFloor"]);
    // A bare file name resolves to the one tracked file with that name; one two files have stays unchecked.
    expect(stale[0]!.detail).toBe(`docs/charter.md:7 names tests/validate.test.ts, changed in 1 commit since the line (newest ${commits.c4!.slice(0, 12)}, 2026-04-01)`);
    expect(stale[1]!.detail).toBe(`docs/charter.md:15 names src/util.ts, changed in 2 commits since the line (newest ${commits.c4!.slice(0, 12)}, 2026-04-01)`);
    expect(stale[2]!.detail).toBe(`docs/charter.md:15: first written at ${commits.c1!.slice(0, 12)}, 2026-01-01; package.json took the form that refutes it later, at ${commits.c3!.slice(0, 12)}, 2026-03-01`);
    expect(r.report.edges?.find((e) => e.to === "file:config.json")?.dangling).toBeUndefined();
    expect(gapsOf(r.report, "status-unsupported").map((g) => g.subject)).toEqual(["Charter/R-2"]);
    expect(gapsOf(r.report, "untraced-change")).toEqual([{ kind: "untraced-change", subject: `commit:${commits.c2!.slice(0, 12)}`, fragments: [], detail: "2026-02-01: changes 1 implementation file, with no test and no Refs: trailer; an agent co-authored it" }]);
    expect(r.report.findings.map((f) => f.kind)).toContain("fact-conflict");
  });
});

describe("csh history", () => {
  it("records a stage per release tag, each a run of that tag's commit, and verify runs each again at it", async () => {
    const h = io(profile);
    expect(await csh(["history", "releases", "--from", "v1.0.0", "--to", "v2.0.0"], h.io)).toBe(0);
    expect(h.o.out).toMatch(/stage v1-0-0: v1\.0\.0/);
    expect(h.o.out).toMatch(/stage v2-0-0: v2\.0\.0/);
    const judgments = JSON.parse(readFileSync(join(profile, "csh/a3/releases/judgments.json"), "utf8"));
    expect(judgments.stages).toEqual([
      { id: "v1-0-0", name: "v1.0.0", what: "" },
      { id: "v2-0-0", name: "v2.0.0", what: "" },
    ]);
    const first = JSON.parse(readFileSync(join(profile, "csh/a3/releases/stages/v1-0-0/run.json"), "utf8"));
    expect(first.snapshot.subject.commit).toBe(commits.c1);
    // At v1.0.0 the claim holds, and nothing precedes it to start untraced changes from.
    const report: Report = JSON.parse(readFileSync(join(profile, "csh/a3/releases/stages/v1-0-0/report.json"), "utf8"));
    expect(report.findings.filter((f) => f.kind === "fact-conflict")).toEqual([]);
    expect(report.errors.map((e) => e.code)).toContain("history-since-unknown");
    expect(existsSync(join(profile, "csh/a3/releases/a3.md"))).toBe(true);
    const v = io(profile);
    expect(await csh(["a3", "verify", "releases"], v.io)).toBe(0);
    expect(v.o.out).toMatch(/verified v1-0-0/);
    expect(v.o.out).toMatch(/verified v2-0-0/);
  }, 120000);

  it("refuses a range with no tag in it, and names each stage after its tag", async () => {
    const h = io(profile);
    expect(await csh(["history", "releases", "--from", "v2.0.0", "--to", "v1.0.0"], h.io)).toBe(1);
    expect(h.o.err).toMatch(/no tag of the subject is in that range/);
    expect(stageIdOf("v10.2.3")).toBe("v10-2-3");
    expect(stageIdOf("Release_1")).toBe("release-1");
  });
});
