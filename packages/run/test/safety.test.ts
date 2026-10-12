// Process and safety (From real runs, stage 44): warnings about where a profile's subject is.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { githubSlug, isPathRepo, type Exec, localPathWarning, runWarnings, subjectWarnings, VISIBILITY_PATH } from "../src/safety.ts";
import type { Project } from "../src/project.ts";

const project = (repo: string) => ({ root: "/r", sourceRoot: "/r", component: { manifest: { subject: { repo, commit: "0".repeat(40) } } } }) as unknown as Project;
/** A fake that answers `git ls-files` as tracked or not, and `gh` with a visibility or not at all. */
const exec = (tracked: boolean, visibility?: string): Exec => (cmd) => (cmd === "git" ? (tracked ? "csh/component.json\n" : undefined) : visibility === undefined ? undefined : `${visibility}\n`);

describe("subject warnings", () => {
  it("reads a GitHub repository's owner and name from its URL forms", () => {
    expect(githubSlug("https://github.com/lgriffin/ESI.ts")).toBe("lgriffin/ESI.ts");
    expect(githubSlug("https://github.com/lgriffin/ESI.ts.git")).toBe("lgriffin/ESI.ts");
    expect(githubSlug("git@github.com:a/b.git")).toBe("a/b");
    expect(githubSlug("https://gitlab.com/a/b")).toBeUndefined();
    expect(githubSlug("../b")).toBeUndefined();
  });

  it("tells a path from a URL", () => {
    expect(isPathRepo("../subject")).toBe(true);
    expect(isPathRepo("C:\\\\work\\\\subject")).toBe(true);
    expect(isPathRepo("https://github.com/a/b")).toBe(false);
    expect(isPathRepo("git@github.com:a/b.git")).toBe(false);
  });

  it("warns about a local path only in a committed manifest", () => {
    expect(localPathWarning(project("../subject"), exec(true))).toMatch(/local path \.\.\/subject in a committed csh\/component\.json/);
    expect(localPathWarning(project("../subject"), exec(false))).toBeUndefined();
    expect(localPathWarning(project("https://github.com/a/b"), exec(true))).toBeUndefined();
  });

  it("warns about a private or internal subject, and says nothing when gh cannot answer", () => {
    expect(subjectWarnings(project("https://github.com/a/b"), exec(false, "PRIVATE"))).toEqual([
      "the subject a/b is private: a profile for it should not be committed to a public repository; keep it out of git with .git/info/exclude (docs/guides/manifest.md)",
    ]);
    expect(subjectWarnings(project("https://github.com/a/b"), exec(false, "INTERNAL"))[0]).toMatch(/is internal/);
    expect(subjectWarnings(project("https://github.com/a/b"), exec(false, "PUBLIC"))).toEqual([]);
    expect(subjectWarnings(project("https://github.com/a/b"), exec(false))).toEqual([]);
  });

  it("asks a local-path subject's checkout for its origin, and warns when that repository is private (stage 46)", () => {
    const calls: string[][] = [];
    const fake: Exec = (cmd, args, cwd) => {
      calls.push([cmd, ...args, cwd ?? ""]);
      if (cmd === "git" && args[0] === "remote") return "git@github.com:a/secret.git\n";
      if (cmd === "gh") return args[2] === "a/secret" ? "PRIVATE\n" : undefined;
      return undefined;
    };
    expect(subjectWarnings(project("../subject"), fake)).toEqual([
      "the subject a/secret is private: a profile for it should not be committed to a public repository; keep it out of git with .git/info/exclude (docs/guides/manifest.md)",
    ]);
    expect(calls).toContainEqual(["git", "remote", "get-url", "origin", resolve("/r", "../subject")]);
  });

  it("says on a run what the last fetch learnt, only while the manifest is tracked (stage 53)", () => {
    const root = mkdtempSync(join(tmpdir(), "csh-safety-"));
    try {
      const at = (repo: string) => ({ root, sourceRoot: root, component: { manifest: { subject: { repo, commit: "0".repeat(40) } } } }) as unknown as Project;
      const url = "https://github.com/a/b";
      expect(runWarnings(at(url), exec(true))).toEqual([]);
      // The fetch records the answer; the run never asks gh.
      expect(subjectWarnings(at(url), exec(false, "PRIVATE"))).toHaveLength(1);
      const noGh: Exec = (cmd, args, cwd) => (cmd === "gh" ? expect.unreachable() : exec(true)(cmd, args, cwd));
      expect(runWarnings(at(url), noGh)).toEqual([expect.stringMatching(/^the subject a\/b is private/)]);
      expect(runWarnings(at(url), exec(false))).toEqual([]);
      // A record for another repository says nothing of this one.
      expect(runWarnings(at("https://github.com/a/c"), exec(true))).toEqual([]);
      mkdirSync(join(root, ".csh-cache"), { recursive: true });
      writeFileSync(join(root, VISIBILITY_PATH), "not json");
      expect(runWarnings(at(url), exec(true))).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
