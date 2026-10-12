// Tracing items through edges (Ingesting a codebase, stage 22): what names nothing is dangling, a requirement that
// names no mechanism and no test cites is unverified, a rule with no scenario is unverified.
import { describe, expect, it } from "vitest";
import type { Module } from "@csh/kernel";
import { type HistoryPort, prepare, type SourceRun, trace } from "../src/index.ts";

const module: Module = { schema: "csh-ir/v1", system: "S", uses: [], vocabulary: { units: [], enums: [], states: [], events: [] }, transitions: [], policies: [], intents: [], sources: [], claims: [], bindings: [] };
const item = (id: string, kind: "requirement" | "rule" | "scenario" | "test-file" | "document" | "property", attrs?: Record<string, string>) => ({ id, kind, text: id, span: `${id}:1`, textDigest: "sha256:0", ...(attrs !== undefined ? { attrs } : {}) });

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

  it("reports what nothing verifies even when no source read an edge", () => {
    const bare: SourceRun[] = [
      { source: "Charter", kind: "Requirements", files: [], output: { diagnostics: [], items: [item("R-1", "requirement")], edges: [] } },
      { source: "Features", kind: "Features", files: [], output: { diagnostics: [], items: [item("f#r", "rule")] } },
    ];
    expect(trace({ prepared: prepare(module, bare), files }).gaps.map((g) => [g.kind, g.subject])).toEqual([["unverified", "Charter/R-1"], ["unverified", "Features/f#r"]]);
  });
});

describe("trace against code facts (stage 24)", () => {
  const fact = (f: Record<string, unknown>) => ({ schema: "csh-facts/v2", subject: { commit: "c" }, tool: { id: "facts-ts", version: "1" }, ...f }) as never;
  const prose: SourceRun[] = [
    {
      source: "Guides",
      kind: "Documents",
      files: [],
      output: {
        diagnostics: [],
        items: [item("g.md", "document")],
        edges: [
          { from: "g.md", rel: "mentions-symbol", to: "symbol:src/e.ts#LibError", span: "g:1" },
          { from: "g.md", rel: "mentions-symbol", to: "symbol:src/e.ts#buildError", span: "g:2" },
          { from: "g.md", rel: "mentions-symbol", to: "symbol:src/unread.ts#x", span: "g:3" },
          { from: "g.md", rel: "mentions-script", to: "script:gen:types", span: "g:4" },
          { from: "g.md", rel: "mentions-script", to: "script:gone", span: "g:5" },
          { from: "g.md", rel: "mentions-symbol", to: "symbol:src/barrel.ts#Anything", span: "g:6" },
        ],
      },
    },
  ];
  const facts = [
    fact({ kind: "module", name: "src/e.ts" }),
    fact({ kind: "declare", module: "src/e.ts", symbol: "LibError", declares: "class", at: "src/e.ts:1" }),
    fact({ kind: "field", file: "package.json", path: "/scripts/gen:types", value: "x" }),
    fact({ kind: "module", name: "src/barrel.ts" }),
    fact({ kind: "export", module: "src/barrel.ts", symbol: "*", from: "./e", at: "src/barrel.ts" }),
  ];

  it("resolves a symbol in a module that was read and a script package.json names; the rest dangle, but a name a * re-export may supply is not checked", () => {
    const r = trace({ prepared: prepare(module, prose), facts });
    expect(r.gaps).toEqual([{ kind: "dangling-reference", subject: "Guides/g.md", fragments: [], detail: "names what does not exist: g:2 mentions-symbol src/e.ts#buildError; g:5 mentions-script gone" }]);
  });

  it("checks nothing about code it was given no facts for", () => {
    expect(trace({ prepared: prepare(module, prose) }).gaps).toEqual([]);
  });
});

describe("trace with history (stage 25)", () => {
  const dated = (commit: string) => ({ commit, date: `2026-0${commit.length}-01T00:00:00+00:00` });
  // Every line was last changed by "old"; src/a.ts and docs/x.md changed after it, src/b.ts did not.
  const history: HistoryPort = {
    lineCommit: () => dated("old"),
    lineOrigin: () => dated("old"),
    changedSince: (_c, path) => (path === "src/a.ts" || path === "docs/x.md" || path === "src" ? [dated("newer"), dated("new")] : []),
    introduced: () => undefined,
    untraced: () => [],
  };
  const charter: SourceRun[] = [
    {
      source: "Charter",
      kind: "Requirements",
      files: [],
      output: {
        diagnostics: [],
        items: [item("R-1", "requirement", { status: "Enforced" }), item("R-2", "requirement", { status: "Enforced" }), item("R-3", "requirement", { status: "Enforced" }), item("R-4", "requirement", { status: "Practised" })],
        edges: [
          { from: "R-1", rel: "verified-by", to: "file:a.ts", span: "c.md:2" },
          { from: "R-1", rel: "mentions-file", to: "file:src/b.ts", span: "c.md:3" },
          { from: "R-1", rel: "mentions-file", to: "file:docs/x.md", span: "c.md:3" },
          { from: "R-1", rel: "mentions-file", to: "file:src", span: "c.md:4" },
          { from: "R-2", rel: "verified-by", to: "text:npm run check", span: "c.md:6" },
          { from: "R-2", rel: "mentions-script", to: "script:check", span: "c.md:6" },
          { from: "R-3", rel: "verified-by", to: "text:branch protection", span: "c.md:8" },
          { from: "R-3", rel: "mentions-script", to: "script:check", span: "c.md:9" },
          { from: "R-3", rel: "mentions-file", to: "file:c.ts", span: "c.md:9" },
        ],
      },
    },
  ];
  const files = ["src/a.ts", "src/b.ts", "docs/x.md", "x/c.ts", "y/c.ts"];
  const facts = [{ schema: "csh-facts/v2", subject: { commit: "c" }, tool: { id: "facts-ts", version: "1" }, kind: "field", file: "package.json", path: "/scripts/check", value: "x", at: "package.json" }] as never[];

  it("reports a line older than the code file it names, by a bare name too, and never a document or a directory", () => {
    const r = trace({ prepared: prepare(module, charter), files, facts, history });
    expect(r.gaps.filter((g) => g.kind === "stale-prose")).toEqual([{ kind: "stale-prose", subject: "Charter/R-1", fragments: [], detail: "c.md:2 names src/a.ts, changed in 2 commits since the line (newest newer, 2026-05-01)" }]);
    // A bare name two files share is not checked, and so not dangling.
    expect(r.edges.find((e) => e.to === "file:c.ts")?.dangling).toBeUndefined();
    expect(r.gaps.filter((g) => g.kind === "dangling-reference")).toEqual([]);
  });

  it("weighs no change to a volatile file (stage 43)", () => {
    const r = trace({ prepared: prepare(module, charter), files, facts, history: { ...history, volatile: (p) => p === "src/a.ts" } });
    expect(r.gaps.filter((g) => g.kind === "stale-prose")).toEqual([]);
  });

  it("reports an Enforced status that no mechanism it names supports; a script named on the verifying line supports it", () => {
    const r = trace({ prepared: prepare(module, charter), files, facts, history });
    expect(r.gaps.filter((g) => g.kind === "status-unsupported")).toEqual([{ kind: "status-unsupported", subject: "Charter/R-3", fragments: [], detail: "R-3:1: its stated status is Enforced, and nothing it names as a mechanism resolves, and no test cites it" }]);
  });

  it("dates nothing and judges no status without history", () => {
    const gaps = trace({ prepared: prepare(module, charter), files, facts }).gaps;
    expect(gaps.filter((g) => g.kind === "stale-prose" || g.kind === "status-unsupported")).toEqual([]);
  });

  it("counts only a test file's citation, and only the script the verifying command names", () => {
    const more: SourceRun[] = [
      {
        source: "Charter",
        kind: "Requirements",
        files: [],
        output: {
          diagnostics: [],
          items: [item("R-5", "requirement", { status: "Enforced" }), item("R-6", "requirement", { status: "Enforced" }), item("R-7", "requirement", { status: "Enforced" })],
          edges: [
            { from: "R-5", rel: "verified-by", to: "text:branch protection", span: "c.md:20" },
            { from: "R-6", rel: "verified-by", to: "text:npm run gone", span: "c.md:22" },
            { from: "R-6", rel: "mentions-script", to: "script:check", span: "c.md:22" },
            { from: "R-7", rel: "verified-by", to: "text:branch protection", span: "c.md:24" },
          ],
        },
      },
      { source: "Features", kind: "Features", files: [], output: { diagnostics: [], items: [item("f#r", "rule"), item("f#r/s", "scenario")], edges: [{ from: "f#r/s", rel: "exemplifies", to: "f#r", span: "f:2" }, { from: "f#r/s", rel: "cites", to: "R-5", span: "f:1" }] } },
      { source: "Tests", kind: "TestFiles", files: [], output: { diagnostics: [], items: [item("t.test.ts", "test-file")], edges: [{ from: "t.test.ts", rel: "cites", to: "R-7", span: "t:1" }] } },
    ];
    const r = trace({ prepared: prepare(module, more), files, facts, history });
    // A tagged scenario cites R-5 without testing it; R-6's command names a script other than the one on its line.
    expect(r.gaps.filter((g) => g.kind === "status-unsupported").map((g) => g.subject)).toEqual(["Charter/R-5", "Charter/R-6"]);
  });
});

describe("structured trace entries (stage 28)", () => {
  const model: SourceRun[] = [
    {
      source: "Security",
      kind: "Traces",
      files: [],
      output: {
        diagnostics: [],
        items: [item("P1", "property"), item("P2", "property"), item("P3", "property", { silence: "rule", "silence-reason": "stated" }), item("P4", "property", { silence: "rule", "silence-reason": "none" })],
        edges: [],
      },
    },
    { source: "Features", kind: "Features", files: [], output: { diagnostics: [], items: [item("f#r/s", "scenario")], edges: [{ from: "f#r/s", rel: "cites", to: "P1", span: "f:2" }] } },
  ];

  it("passes a cited property, and tells a silence recorded with its reason from a bare one", () => {
    const r = trace({ prepared: prepare(module, model) });
    expect(r.gaps.filter((g) => g.subject.startsWith("Security/"))).toEqual([
      { kind: "unverified", subject: "Security/P2", fragments: [], detail: "P2:1: no scenario or test cites it" },
      { kind: "justified-gap", subject: "Security/P3", fragments: [], detail: "P3:1: no scenario or test cites it, and it records rule as none, with a reason" },
      { kind: "unverified", subject: "Security/P4", fragments: [], detail: "P4:1: no scenario or test cites it; it records rule as none, with no reason" },
    ]);
  });
});
