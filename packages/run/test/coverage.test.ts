import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type Coverage, coverageLine, coverageOfSources, renderCoverage } from "../src/coverage.ts";

const c: Coverage = {
  tracked: 10,
  read: 6,
  byName: 0,
  sources: [{ name: "Docs", kind: "Documents", files: 4 }, { name: "Code", kind: "Code", files: 2 }, { name: "Tests", kind: "TestFiles", files: 0 }],
  eligible: 9,
  unread: [{ ext: ".rs", files: 3, sample: "verify/src/lib.rs" }, { ext: ".sql", files: 1, sample: "db/a.sql" }],
  skipped: [{ reason: "with no reader", files: 1, sample: "db/a.sql" }],
  missed: [{ ext: ".rs", files: 3, sample: "verify/src/lib.rs" }],
};

describe("coverage", () => {
  it("lists what each source read, flags one that matches nothing, and groups the rest by extension", () => {
    const text = renderCoverage(c, "Demo");
    expect(text).toContain("coverage Demo: 6 of 9 eligible files read (66%), all parsed; 1 of 10 tracked skipped: 1 with no reader; not read: 3 .rs");
    expect(text).toContain("read by 3 sources:");
    expect(text).toMatch(/Tests\s+TestFiles\s+0 files  \(matches nothing\)/);
    expect(text).toMatch(/with no reader\s+1  e\.g\. db\/a\.sql/);
    expect(text).toContain("eligible, not read: 3 files");
    expect(text).toMatch(/\.rs\s+3  e\.g\. verify\/src\/lib\.rs/);
  });

  it("renders an analysis written before stage 75 as it measured it, claiming no skips", () => {
    const old = { tracked: 10, read: 6, byName: 2, unread: [{ ext: ".rs", files: 4, sample: "a.rs" }] };
    expect(coverageLine(old)).toBe("coverage: 6 of 10 tracked files read (2 by name); not read: 4 .rs");
  });

  it("counts the kinds past the top few rather than listing them all", () => {
    const many: Coverage = { ...c, missed: Array.from({ length: 15 }, (_, i) => ({ ext: `.e${i}`, files: 1, sample: `f${i}` })) };
    expect(renderCoverage(many, "Demo", 5)).toContain("and 10 more kinds");
  });

  it("says why each unread file is skipped, and counts the eligible ones not read (stage 75)", () => {
    const dir = mkdtempSync(join(tmpdir(), "csh-coverage-"));
    try {
      const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: dir, stdio: "ignore" });
      git("init", "-q");
      const files: Record<string, string> = {
        "package.json": "{}\n",
        "src/a.ts": "export const a = 1;\n",
        "src/out/b.ts": "export const b = 1;\n",
        "dist/a.js": "",
        "vendor/lib/x.ts": "",
        "testdata/case.txt": "",
        "LICENSE": "",
        "docs/guide.md": "# Guide\n",
        "docs/c4.mmd": "C4Container\n",
        ".beads/issues.jsonl": "",
        "Makefile": "all:\n",
      };
      for (const [f, text] of Object.entries(files)) {
        mkdirSync(join(dir, f, ".."), { recursive: true });
        writeFileSync(join(dir, f), text);
      }
      git("add", ".");
      git("commit", "-q", "-m", "one");
      const c = coverageOfSources(dir, [{ name: "Code", kind: "Code", at: ".", include: ["**/*.ts", "package.json"], exclude: ["dist/**", "**/vendor/**"] }])!;
      expect(c.read).toBe(3);
      // A diagram, an issues file and a task runner have readers, so a profile that leaves them out misses them.
      expect(c.eligible).toBe(7);
      expect(c.skipped.map((k) => [k.reason, k.files])).toEqual([["build output", 1], ["installed or vendored", 1], ["test data no suite pairs", 1], ["with no reader", 1]]);
      expect(c.missed.map((m) => m.ext).sort()).toEqual([".jsonl", ".md", ".mmd", "Makefile"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("never enters a directory that holds no tracked file (stage 46)", () => {
    const dir = mkdtempSync(join(tmpdir(), "csh-coverage-"));
    try {
      const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: dir, stdio: "ignore" });
      git("init", "-q");
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "src", "a.ts"), "export const a = 1;\n");
      writeFileSync(join(dir, ".gitignore"), "node_modules/\n");
      git("add", ".");
      git("commit", "-q", "-m", "one");
      // An installed tree the commit does not hold, with a link that loops: walking into it would throw.
      mkdirSync(join(dir, "node_modules", "pkg"), { recursive: true });
      writeFileSync(join(dir, "node_modules", "pkg", "index.js"), "");
      symlinkSync("loop", join(dir, "node_modules", "loop"));
      const c = coverageOfSources(dir, [{ name: "Code", kind: "Code", at: ".", include: ["**/*.ts", "**/*.js"] }])!;
      expect(c.sources[0]!.files).toBe(1);
      expect(c.read).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("never follows a link into an untracked directory, even one that loops (stage 46)", () => {
    const dir = mkdtempSync(join(tmpdir(), "csh-coverage-"));
    try {
      const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: dir, stdio: "ignore" });
      git("init", "-q");
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "src", "a.ts"), "export const a = 1;\n");
      git("add", ".");
      git("commit", "-q", "-m", "one");
      // Untracked: a link to a directory that holds a link back to itself, and a dangling link.
      mkdirSync(join(dir, "cache", "deep"), { recursive: true });
      symlinkSync(join(dir, "cache"), join(dir, "cache", "deep", "up"));
      symlinkSync(join(dir, "cache"), join(dir, "src", "cache"));
      symlinkSync(join(dir, "missing"), join(dir, "src", "gone"));
      const c = coverageOfSources(dir, [{ name: "Code", kind: "Code", at: ".", include: ["**/*.ts"] }])!;
      expect(c.sources[0]!.files).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
