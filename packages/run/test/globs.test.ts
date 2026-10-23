import { describe, expect, it } from "vitest";
import { globPattern } from "../src/history.ts";

describe("history globs", () => {
  it("matches a directory and everything under it, a file, and ** across directories", () => {
    expect(globPattern("docs/releases").test("docs/releases/v1.md")).toBe(true);
    expect(globPattern("docs/releases").test("docs/releases-old/v1.md")).toBe(false);
    expect(globPattern("docs/adr/*.md").test("docs/adr/0001-x.md")).toBe(true);
    expect(globPattern("docs/adr/*.md").test("docs/adr/sub/0001-x.md")).toBe(false);
    expect(globPattern("**/features").test("tests/bdd/features/a.feature")).toBe(true);
    expect(globPattern("a.b").test("axb")).toBe(false);
    expect(globPattern(".beads/**").test(".beads/issues.jsonl")).toBe(true);
    expect(globPattern(".beads/**").test(".beads/sub/x.json")).toBe(true);
    expect(globPattern(".beads/**").test(".beadsx/issues.jsonl")).toBe(false);
  });
});

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitHistory } from "../src/history.ts";

describe("history existed", () => {
  it("tells a file that was deleted from one that never existed", () => {
    const dir = mkdtempSync(join(tmpdir(), "csh-existed-"));
    const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { cwd: dir, stdio: "ignore" });
    try {
      git("init", "-q");
      writeFileSync(join(dir, "old.txt"), "x");
      git("add", "."); git("commit", "-qm", "add");
      git("rm", "-q", "old.txt"); git("commit", "-qm", "rm");
      const h = gitHistory(dir, { implementation: ["."] });
      expect(h.existed?.("old.txt")).toBe(true);
      expect(h.existed?.("never.txt")).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("history existed, whatever the checkout holds (stage 41)", () => {
  it("counts a path a merged branch added and removed, and not one only another branch holds", () => {
    const dir = mkdtempSync(join(tmpdir(), "csh-existed-"));
    const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { cwd: dir, stdio: "ignore" });
    try {
      git("init", "-q", "-b", "main");
      writeFileSync(join(dir, "a.txt"), "a");
      git("add", "."); git("commit", "-qm", "base");
      git("checkout", "-qb", "side");
      writeFileSync(join(dir, "tmp.txt"), "x");
      git("add", "."); git("commit", "-qm", "add tmp");
      git("rm", "-q", "tmp.txt"); git("commit", "-qm", "rm tmp");
      git("checkout", "-q", "main");
      writeFileSync(join(dir, "b.txt"), "b");
      git("add", "."); git("commit", "-qm", "b");
      git("merge", "-q", "--no-ff", "-m", "merge side", "side");
      git("branch", "-qD", "side");
      git("checkout", "-qb", "other");
      writeFileSync(join(dir, "elsewhere.txt"), "e");
      git("add", "."); git("commit", "-qm", "elsewhere");
      git("checkout", "-q", "main");
      const h = gitHistory(dir, { implementation: ["."] });
      expect(h.existed?.("tmp.txt")).toBe(true);
      expect(h.existed?.("elsewhere.txt")).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("history prefetch", () => {
  it("answers as one-by-one asks do, whether or not the answers were fetched first", async () => {
    const dir = mkdtempSync(join(tmpdir(), "csh-prefetch-"));
    const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { cwd: dir, stdio: "ignore" });
    try {
      git("init", "-q");
      writeFileSync(join(dir, "doc.md"), "one\ntwo\n");
      writeFileSync(join(dir, "code.ts"), "a\n");
      git("add", "."); git("commit", "-qm", "first");
      writeFileSync(join(dir, "code.ts"), "b\n");
      git("add", "."); git("commit", "-qm", "second");
      writeFileSync(join(dir, "code.ts"), "c\n");
      git("add", "."); git("commit", "-qm", "third");
      const plain = gitHistory(dir, { implementation: ["."] });
      const fetched = gitHistory(dir, { implementation: ["."] });
      await fetched.prefetch?.({ files: ["code.ts", "missing.ts"], documents: ["doc.md"] });
      const line = plain.lineCommit("doc.md", 1)!;
      expect(fetched.lineCommit("doc.md", 1)).toEqual(line);
      expect(fetched.changedSince(line.commit, "code.ts")).toEqual(plain.changedSince(line.commit, "code.ts"));
      expect(plain.changedSince(line.commit, "code.ts")).toHaveLength(2);
      expect(fetched.changedSince(line.commit, "missing.ts")).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
