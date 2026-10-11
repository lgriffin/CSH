// Tracing items through edges (Ingesting a codebase, stage 22): what names nothing is dangling, a requirement that
// names no mechanism and no test cites is unverified, a rule with no scenario is unverified.
import { describe, expect, it } from "vitest";
import type { Module } from "@csh/kernel";
import { prepare, type SourceRun, trace } from "../src/index.ts";

const module: Module = { schema: "csh-ir/v1", system: "S", uses: [], vocabulary: { units: [], enums: [], states: [], events: [] }, transitions: [], policies: [], intents: [], sources: [], claims: [], bindings: [] };
const item = (id: string, kind: "requirement" | "rule" | "scenario" | "test-file" | "document", attrs?: Record<string, string>) => ({ id, kind, text: id, span: `${id}:1`, textDigest: "sha256:0", ...(attrs !== undefined ? { attrs } : {}) });

const runs: SourceRun[] = [
  {
    source: "Charter",
    kind: "Requirements",
    files: [],
    output: {
      diagnostics: [],
      items: [item("R-1", "requirement"), item("R-2", "requirement"), item("R-3", "requirement", { status: "Practised" }), item("doc.md", "document")],
      edges: [
        { from: "R-1", rel: "verified-by", to: "text:npm test", span: "c:1" },
        { from: "R-1", rel: "verified-by", to: "file:src/a.ts", span: "c:2" },
        { from: "R-1", rel: "mentions-file", to: "file:src/gone.ts", span: "c:3" },
        { from: "R-1", rel: "mentions-file", to: "file:application/json", span: "c:4" },
        { from: "R-1", rel: "mentions-file", to: "file:src/", span: "c:5" },
        { from: "doc.md", rel: "implements", to: "R-9", span: "c:6" },
      ],
    },
  },
  {
    source: "Features",
    kind: "Features",
    files: [],
    output: {
      diagnostics: [],
      items: [item("f#r1", "rule"), item("f#r1/s", "scenario"), item("f#r2", "rule")],
      edges: [{ from: "f#r1/s", rel: "exemplifies", to: "f#r1", span: "f:3" }],
    },
  },
  {
    source: "Tests",
    kind: "TestFiles",
    files: [],
    output: { diagnostics: [], items: [item("t.test.ts", "test-file")], edges: [{ from: "t.test.ts", rel: "cites", to: "R-2", span: "t:1" }, { from: "t.test.ts", rel: "mentions", to: "X-1", span: "t:2" }] },
  },
];

describe("trace", () => {
  const files = ["src/a.ts", "src/b/c.ts", "README.md"];

  it("resolves edges against items and tracked files, and reports what names nothing", () => {
    const r = trace({ prepared: prepare(module, runs), files });
    expect(r.gaps).toEqual([
      { kind: "dangling-reference", subject: "Charter/R-1", fragments: [], detail: "names what does not exist: c:3 mentions-file src/gone.ts" },
      { kind: "dangling-reference", subject: "Charter/doc.md", fragments: [], detail: "names what does not exist: c:6 implements R-9" },
      { kind: "unverified", subject: "Charter/R-3", fragments: [], detail: "R-3:1: names no mechanism that verifies it, and no test cites it; its stated status is Practised" },
      { kind: "unverified", subject: "Features/f#r2", fragments: [], detail: "f#r2:1: no scenario sits under this rule" },
    ]);
    expect(r.edges.find((e) => e.to === "R-2")?.target).toBe("Charter/R-2");
    expect(r.edges.find((e) => e.to === "X-1")?.dangling).toBeUndefined();
    expect(r.edges.find((e) => e.to === "file:application/json")?.dangling).toBeUndefined();
  });

  it("leaves file edges unchecked when the tracked files are not known", () => {
    const r = trace({ prepared: prepare(module, runs) });
    expect(r.gaps.filter((g) => g.kind === "dangling-reference").map((g) => g.subject)).toEqual(["Charter/doc.md"]);
  });
});
