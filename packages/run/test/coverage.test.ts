import { describe, expect, it } from "vitest";
import { type Coverage, renderCoverage } from "../src/coverage.ts";

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
});
