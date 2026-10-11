// Items and edges end to end (Ingesting a codebase, stage 22): the built-in inventory adapters, run isolated, read a
// repository's documents, features and tests through the globs and settings the manifest gives; edges to files
// resolve against what the repository tracks.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createZ3Solver, type SolverPort } from "@csh/solver";
import { globRegExp, runComponent, trackedFiles } from "../src/index.ts";

const REPO = resolve(import.meta.dirname, "../../..");
let base: string;
let z3: SolverPort;

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const write = (path: string, text: string) => {
  mkdirSync(join(base, path, ".."), { recursive: true });
  writeFileSync(join(base, path), text);
};

beforeAll(async () => {
  z3 = await createZ3Solver();
  mkdirSync(join(REPO, ".csh-cache"), { recursive: true });
  base = mkdtempSync(join(REPO, ".csh-cache", "items-"));
  git(base, "init", "-q", "-b", "main");
  write("guides/CHARTER.md", "#### REQ-1 · Enforced\n\nThe service **shall** log.\n\n- **Verified by:** `tests/log.test.ts`.\n\n#### REQ-2 · Practised\n\nThe service **shall** answer.\n\n- **Verified by:** Code review.\n\nSee `src/gone.ts` and `src/service.ts`.\n");
  write("guides/USAGE.md", "**Implements:** REQ-1, REQ-7\n");
  write("guides/draft/NOTES.md", "**Implements:** REQ-8\n");
  write("features/a.feature", "Feature: A\n  Rule: When asked, the service shall answer.\n    Scenario: one\n  Rule: The service shall not crash.\n");
  write("tests/log.test.ts", "it('REQ-1 logs', () => {});\n");
  write("tests/fixtures/x.test.ts", "it('REQ-2 is a fixture', () => {});\n");
  write("src/service.ts", "export {};\n");
  write(
    "csh/component.json",
    JSON.stringify({
      schema: "csh-component/v2",
      name: "Items",
      implementation: ["src"],
      sources: [
        { name: "Charter", kind: "Requirements", at: "guides/CHARTER.md" },
        { name: "Guides", kind: "Documents", at: "./guides", include: ["**/*.md"], exclude: ["CHARTER.md", "draft/**"] },
        { name: "Features", kind: "Features", at: "features" },
        { name: "Tests", kind: "TestFiles", at: ".", include: ["tests/**/*.test.ts"], exclude: ["tests/fixtures/**"] },
      ],
      practices: [
        { id: "charter", name: "Charter", kind: "requirements", sources: ["Charter"], adapter: "@csh/adapter-items/markdown", settings: { headingFields: "status" } },
        { id: "guides", name: "Guides", kind: "documents", sources: ["Guides"] },
        { id: "bdd", name: "BDD", kind: "scenarios", sources: ["Features"] },
        { id: "tdd", name: "TDD", kind: "tests", sources: ["Tests"] },
      ],
    }),
  );
  git(base, "add", "-A");
  git(base, "-c", "user.email=test-only@example.invalid", "-c", "user.name=test-only", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "items");
}, 60000);
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("items and edges", () => {
  it("inventories every source and reports what names nothing and what nothing verifies", async () => {
    const r = await runComponent({ root: base, solver: z3 });
    if (!r.ok) throw new Error(r.message);
    const items = r.report.items.map((i) => `${i.source}/${i.kind}/${i.id}`);
    expect(items).toEqual([
      "Charter/document/guides/CHARTER.md",
      "Charter/requirement/REQ-1",
      "Charter/requirement/REQ-2",
      "Features/feature/features/a.feature",
      "Features/rule/features/a.feature#when-asked-the-service-shall-answer",
      "Features/scenario/features/a.feature#when-asked-the-service-shall-answer/one",
      "Features/rule/features/a.feature#the-service-shall-not-crash",
      "Guides/document/guides/USAGE.md",
      "Tests/test-file/tests/log.test.ts",
    ]);
    expect(r.report.items.find((i) => i.id === "REQ-1")?.attrs).toMatchObject({ status: "Enforced" });
    const gaps = r.report.gapView.gaps.filter((g) => g.kind === "dangling-reference" || g.kind === "unverified").map((g) => `${g.kind} ${g.subject}`);
    expect(gaps).toEqual(["dangling-reference Charter/REQ-2", "dangling-reference Guides/guides/USAGE.md", "unverified Charter/REQ-2", "unverified Features/features/a.feature#the-service-shall-not-crash"]);
    expect(r.report.gapView.gaps.some((g) => g.kind === "uncited")).toBe(false);
    expect(r.report.edges?.find((e) => e.rel === "cites")?.target).toBe("Charter/REQ-1");
  });
});

describe("globs", () => {
  it("match below the source, with ** spanning directories", () => {
    expect(globRegExp("**/*.md").test("a.md")).toBe(true);
    expect(globRegExp("**/*.md").test("x/y/a.md")).toBe(true);
    expect(globRegExp("*.md").test("x/a.md")).toBe(false);
    expect(globRegExp("draft/**").test("draft/a/b.md")).toBe(true);
    expect(globRegExp("a?.ts").test("ab.ts")).toBe(true);
    expect(globRegExp("a.ts").test("abts")).toBe(false);
  });

  it("list tracked files only inside a repository", () => {
    expect(trackedFiles(base)).toContain("guides/CHARTER.md");
    expect(trackedFiles("/")).toBeUndefined();
  });
});
