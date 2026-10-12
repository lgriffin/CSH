import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type Coverage, coverageOfSources, renderCoverage } from "../src/coverage.ts";

const c: Coverage = {
  tracked: 10,
  read: 6,
  sources: [{ name: "Docs", kind: "Documents", files: 4 }, { name: "Code", kind: "Code", files: 2 }, { name: "Tests", kind: "TestFiles", files: 0 }],
  unread: [{ ext: ".rs", files: 3, sample: "verify/src/lib.rs" }, { ext: ".sql", files: 1, sample: "db/a.sql" }],
};

describe("coverage", () => {
  it("lists what each source read, flags one that matches nothing, and groups the rest by extension", () => {
    const text = renderCoverage(c, "Demo");
    expect(text).toContain("coverage Demo: 6 of 10 tracked files read by 3 sources");
    expect(text).toMatch(/Tests\s+TestFiles\s+0 files  \(matches nothing\)/);
    expect(text).toContain("not read: 4 files");
    expect(text).toMatch(/\.rs\s+3  e\.g\. verify\/src\/lib\.rs/);
  });

  it("counts the kinds past the top few rather than listing them all", () => {
    const many: Coverage = { ...c, unread: Array.from({ length: 15 }, (_, i) => ({ ext: `.e${i}`, files: 1, sample: `f${i}` })) };
    expect(renderCoverage(many, "Demo", 5)).toContain("and 10 more kinds");
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
