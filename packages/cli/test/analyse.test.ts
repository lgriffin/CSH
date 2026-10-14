// csh analyse (Analyse, danger and grain, stage 55): a cold read of a repository, through the command.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { csh } from "../src/index.ts";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function io(cwd: string) {
  const o = { out: "", err: "" };
  return { o, io: { out: (s: string) => void (o.out += s), err: (s: string) => void (o.err += s), cwd } };
}

/** A committed repository holding `files`; each later set of files is a further commit. Returns the dir and commits. */
function repo(...commits: Record<string, string>[]): { dir: string; commits: string[] } {
  const dir = mkdtempSync(join(tmpdir(), "csh-analyse-cli-"));
  dirs.push(dir);
  const g = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  g("init", "-q", "-b", "main");
  const made: string[] = [];
  for (const files of commits) {
    for (const [p, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), text);
    }
    g("add", "-A");
    g("-c", "user.email=test-only@example.invalid", "-c", "user.name=test-only", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "c");
    made.push(g("rev-parse", "HEAD"));
  }
  return { dir, commits: made };
}

const status = (dir: string) => execFileSync("git", ["status", "--porcelain", "--ignored"], { cwd: dir, encoding: "utf8" });
const BASE = { "README.md": "# Shop\n\nThe domain does not import the web layer.\n", "src/domain/cart.ts": "export const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);\n" };

describe("csh analyse", () => {
  it("says how it is used, and exits 2, without exactly one path", async () => {
    const { o, io: x } = io(tmpdir());
    expect(await csh(["analyse"], x)).toBe(2);
    expect(o.err).toContain("usage: csh analyse <path>");
  });

  it("refuses a directory that is not a git checkout, with exit 1", async () => {
    const plain = mkdtempSync(join(tmpdir(), "csh-analyse-plain-"));
    dirs.push(plain);
    const { o, io: x } = io(plain);
    expect(await csh(["analyse", "."], x)).toBe(1);
    expect(o.err).toContain("is not inside a git checkout");
  });

  it("reads a repository cold, writes the sheet and the JSON under --out, and leaves the repository as it was", async () => {
    const { dir } = repo(BASE);
    const out = mkdtempSync(join(tmpdir(), "csh-analyse-out-"));
    dirs.push(out);
    const { o, io: x } = io(dir);
    expect(await csh(["analyse", ".", "--out", out], x)).toBe(0);
    expect(o.out).toContain("told rules lifted from prose: 1 (1 layering, 0 EARS)");
    expect(o.out.indexOf("== Danger")).toBeLessThan(o.out.indexOf("== Gaps"));
    expect(existsSync(join(out, "csh-analysis.html"))).toBe(true);
    const a = JSON.parse(readFileSync(join(out, "csh-analysis.json"), "utf8"));
    expect(a.schema).toBe("csh-analysis/v1");
    expect(a.told).toEqual([{ item: "Documents/README.md#L3", lifted: "layering", span: "README.md:3", text: "The domain does not import the web layer." }]);
    expect(status(dir)).toBe("");
  });

  it("reads another commit with --at, and prints the JSON with --json", async () => {
    const { dir, commits } = repo(BASE, { "README.md": `${BASE["README.md"]}\nThe web layer never imports the store.\n` });
    const out = mkdtempSync(join(tmpdir(), "csh-analyse-out-"));
    dirs.push(out);
    const now = io(dir);
    expect(await csh(["analyse", ".", "--out", out, "--json"], now.io)).toBe(0);
    expect(JSON.parse(now.o.out).told).toHaveLength(2);
    const then = io(dir);
    expect(await csh(["analyse", ".", "--out", out, "--json", "--at", commits[0]!], then.io)).toBe(0);
    const a = JSON.parse(then.o.out);
    expect(a.subject.commit).toBe(commits[0]);
    expect(a.told).toHaveLength(1);
  });

  it("reads a profile beside the subject as given, without a ledger or a key, and compares its expected results", async () => {
    const manifest = {
      schema: "csh-component/v2",
      name: "Shop",
      subject: { repo: "local", commit: "0000000000000000000000000000000000000000" },
      implementation: ["src"],
      sources: [{ name: "Docs", kind: "Documents", at: ".", include: ["README.md"] }],
      practices: [{ id: "docs", name: "Docs", kind: "documents", sources: ["Docs"] }],
    };
    const expected = { schema: "csh-expected/v1", rows: [{ row: 1, title: "the README is read", expect: [], unknown: [{ what: "nothing", reason: "a smoke test" }] }] };
    // A ledger that would need GnuPG to read is never read.
    const { dir } = repo({ ...BASE, "csh/component.json": JSON.stringify(manifest), "csh/expected.json": JSON.stringify(expected), "csh/ledger.ndjson": '{"seq":1}\n', "csh/maintainers.json": "{}" });
    const out = mkdtempSync(join(tmpdir(), "csh-analyse-out-"));
    dirs.push(out);
    const { o, io: x } = io(dir);
    expect(await csh(["analyse", ".", "--out", out, "--json"], x), o.err).toBe(0);
    const a = JSON.parse(o.out);
    expect(a.profile).toEqual({ kind: "given", dir: join(dir, "csh") });
    expect(a.told).toEqual([]);
    expect(a.expect.mismatches).toEqual([]);
    expect(status(dir)).toBe("");
  });

  it("refuses a profile that names no subject, since such a profile sits beside its repository", async () => {
    const { dir } = repo(BASE);
    const profile = mkdtempSync(join(tmpdir(), "csh-analyse-profile-"));
    dirs.push(profile);
    mkdirSync(join(profile, "csh"));
    writeFileSync(join(profile, "csh", "component.json"), JSON.stringify({ schema: "csh-component/v1", name: "Shop", spec: "spec.csl.ts", implementation: ["src"], practices: [] }));
    const { o, io: x } = io(dir);
    expect(await csh(["analyse", ".", "--profile", profile], x)).toBe(1);
    expect(o.err).toContain("names no subject");
  });
});
