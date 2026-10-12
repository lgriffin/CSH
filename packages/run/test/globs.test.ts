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
