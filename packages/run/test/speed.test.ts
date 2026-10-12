// What makes a run cheaper without changing what it reports (From real runs, section 3; stage 40).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { afterAll, describe, expect, it } from "vitest";
import { COMPONENT_SCHEMA_V2 } from "@csh/component";
import { fetchSubject, gitHistory, loadProject, runIsolatedBatch, subjectCheckout } from "../src/index.ts";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), "csh-speed-"));
  dirs.push(d);
  return d;
};
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.email=test-only@example.invalid", "-c", "user.name=test-only", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const enc = (s: string) => new TextEncoder().encode(s);
const input = (path: string, text: string) => ({ source: { name: "Docs", kind: "Documents", at: "." }, vocabulary: [], bindings: [], files: [{ path, digest: "x", bytes: enc(text) }] });

describe("the tool's adapters in one sandbox", () => {
  const markdown = pathToFileURL(createRequire(import.meta.url).resolve("@csh/adapter-items/markdown")).href;
  const crash = pathToFileURL(resolve(import.meta.dirname, "adapters", "crash.ts")).href;

  it("runs each job and keeps each one's failure its own", async () => {
    const out = await runIsolatedBatch([
      { adapter: markdown, input: input("a.md", "# REQ-1 One\n") as never },
      { adapter: crash, input: input("b.md", "") as never },
      { adapter: markdown, input: input("c.md", "# REQ-2 Two\n") as never },
    ]);
    expect(out.map((o) => (o instanceof Error ? o.message : (o.items ?? []).map((i) => i.id)))).toEqual([["a.md", "REQ-1"], "adapter crashed on purpose", ["c.md", "REQ-2"]]);
  }, 30000);

  it("runs each job alone when the shared process cannot finish", async () => {
    const out = await runIsolatedBatch([
      { adapter: markdown, input: input("a.md", "# REQ-1 One\n") as never },
      { adapter: markdown, input: input("b.md", "# REQ-2 Two\n") as never },
    ], 1);
    // One millisecond is too little for either: the batch times out, and each is then reported alone.
    expect(out.every((o) => o instanceof Error && /exceeded/.test(o.message))).toBe(true);
  }, 30000);
});

describe("the history cache", () => {
  it("keeps the commits that touched each file and whether a path was ever held", async () => {
    const root = temp();
    git(root, "init", "-q", "-b", "main");
    writeFileSync(join(root, "a.md"), "one\n");
    writeFileSync(join(root, "gone.md"), "x\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "one");
    git(root, "rm", "-q", "gone.md");
    git(root, "commit", "-q", "-m", "two");
    const cache = join(temp(), "history.json");
    const h = gitHistory(root, { implementation: ["."], cache, tool: "t" });
    await h.prefetch!({ files: ["a.md"], documents: [] });
    expect(h.existed!("gone.md")).toBe(true);
    expect(h.existed!("never.md")).toBe(false);
    h.save();
    const kept = JSON.parse(readFileSync(cache, "utf8")) as { touching: Record<string, string[]>; existed: Record<string, boolean> };
    expect(Object.keys(kept.touching)).toEqual(["a.md"]);
    expect(kept.existed).toEqual({ "gone.md": true, "never.md": false });
    // A second port at the same HEAD reads them back.
    const again = gitHistory(root, { implementation: ["."], cache, tool: "t" });
    expect(again.existed!("gone.md")).toBe(true);
  });
});

describe("another commit of a subject", () => {
  it("is a worktree of the pinned checkout, not a clone of its own", () => {
    const repo = temp();
    git(repo, "init", "-q", "-b", "main");
    writeFileSync(join(repo, "a.md"), "one\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "one");
    const first = git(repo, "rev-parse", "HEAD");
    writeFileSync(join(repo, "a.md"), "two\n");
    git(repo, "commit", "-q", "-am", "two");
    const pinned = git(repo, "rev-parse", "HEAD");
    const profile = temp();
    mkdirSync(join(profile, "csh"));
    writeFileSync(join(profile, "csh", "component.json"), JSON.stringify({ schema: COMPONENT_SCHEMA_V2, name: "S", subject: { repo, commit: pinned }, implementation: ["."], sources: [{ name: "Docs", kind: "Documents", at: "." }], practices: [{ id: "docs", name: "Docs", kind: "documents", sources: ["Docs"] }] }));
    const p = loadProject(profile, profile);
    expect(fetchSubject(p)).toMatchObject({ ok: true, fetched: true });
    const other = fetchSubject(p, first);
    expect(other).toMatchObject({ ok: true, fetched: true });
    const dir = subjectCheckout(profile, first);
    expect(statSync(join(dir, ".git")).isFile()).toBe(true);
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe("one\n");
    expect(fetchSubject(p, first)).toMatchObject({ ok: true, fetched: false });
    // Removed by hand, it is made again.
    rmSync(dir, { recursive: true, force: true });
    expect(fetchSubject(p, first)).toMatchObject({ ok: true, fetched: true });
    expect(existsSync(join(dir, "a.md"))).toBe(true);
  });
});
