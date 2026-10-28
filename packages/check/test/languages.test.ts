// What 1.0 promises of each language (The analysis A3 and 1.0, section 3; A-275), and the plain names of kinds.
import { describe, expect, it } from "vitest";
import { CONVERGED_NEXT, experimentalLine, GAP_NEXT, INDETERMINATE_NEXT, KIND_NAME, kindName, languageStatus, readLanguageOf } from "../src/index.ts";

describe("languages", () => {
  it("reads TypeScript and JavaScript as supported, the tree-sitter languages as experimental", () => {
    expect(["a.ts", "b.tsx", "c.mjs", "d.svelte"].map((f) => languageStatus(readLanguageOf(f)!))).toEqual(["supported", "supported", "supported", "supported"]);
    expect(["a.py", "B.java", "c.go", "d.rs"].map((f) => languageStatus(readLanguageOf(f)!))).toEqual(["experimental", "experimental", "experimental", "experimental"]);
    expect(readLanguageOf("README.md")).toBeUndefined();
    expect(languageStatus("kotlin")).toBe("unread");
  });

  it("says once when experimental code was read, and nothing when none was", () => {
    expect(experimentalLine([{ language: "typescript", files: 4, status: "supported" }])).toBeUndefined();
    expect(experimentalLine([{ language: "java", files: 1086, status: "experimental" }, { language: "python", files: 139, status: "experimental" }])).toBe(
      "experimental: Java (1086 files) and Python (139 files) are read by experimental readers; their results may be incomplete or wrong. TypeScript and JavaScript are supported.",
    );
  });
});

describe("kind names", () => {
  it("names every kind the overview places", () => {
    for (const k of [...Object.keys(GAP_NEXT), ...Object.keys(INDETERMINATE_NEXT), ...Object.keys(CONVERGED_NEXT)]) expect(KIND_NAME[k], k).toBeDefined();
    expect(kindName("no-such-kind")).toBe("no-such-kind");
  });
});
