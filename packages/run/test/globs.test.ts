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
