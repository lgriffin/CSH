// Tracing items through edges (Ingesting a codebase, stage 22): what names nothing is dangling, a requirement that
// names no mechanism and no test cites is unverified, a rule with no scenario is unverified.
import { describe, expect, it } from "vitest";
import type { Module } from "@csh/kernel";
import { type HistoryPort, prepare, type SourceRun, trace } from "../src/index.ts";

const module: Module = { schema: "csh-ir/v1", system: "S", uses: [], vocabulary: { units: [], enums: [], states: [], events: [] }, transitions: [], policies: [], intents: [], sources: [], claims: [], bindings: [] };
const item = (id: string, kind: "requirement" | "rule" | "scenario" | "test-file" | "document" | "property" | "baseline", attrs?: Record<string, string>) => ({ id, kind, text: id, span: `${id}:1`, textDigest: "sha256:0", ...(attrs !== undefined ? { attrs } : {}) });

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

describe("names of a package's code, and task runners (stages 67 and 68)", () => {
  const fact = (f: Record<string, unknown>) => ({ schema: "csh-facts/v2", subject: { commit: "c" }, tool: { id: "facts-code", version: "1" }, ...f }) as never;
  const run = (edges: { to: string; span: string; absent?: boolean; rel?: string }[]): SourceRun[] => [
    { source: "Docs", kind: "Documents", files: [], output: { diagnostics: [], items: [item("src/fmt/README.md", "document")], edges: edges.map((e) => ({ from: "src/fmt/README.md", rel: (e.rel ?? "mentions-symbol") as never, to: e.to, span: e.span, ...(e.absent === true ? { absent: true } : {}) })) } },
  ];
  const facts = [
    fact({ kind: "module", name: "src/fmt/rules.go" }),
    fact({ kind: "declare", module: "src/fmt/rules.go", symbol: "buildRulesMap", declares: "function", at: "src/fmt/rules.go:1" }),
    fact({ kind: "declare", module: "src/fmt/span.go", symbol: "worker.processPair", declares: "method", at: "src/fmt/span.go:9" }),
    fact({ kind: "module", name: "src/ast/node.go" }),
    fact({ kind: "declare", module: "src/ast/node.go", symbol: "SourceFile", declares: "struct", at: "src/ast/node.go:1" }),
    fact({ kind: "task", runner: "hereby", file: "Herebyfile.mjs", name: "test", at: "Herebyfile.mjs" }),
    fact({ kind: "task", runner: "make", file: "Makefile", name: "lint", at: "Makefile" }),
    fact({ kind: "task", runner: "make", file: "Makefile", name: "*", at: "Makefile" }),
  ];
  const files = ["src/fmt/rules.go", "src/fmt/span.go", "src/ast/node.go", "src/ui/TutorsShell.svelte", "Herebyfile.mjs", "Makefile"];

  it("resolves a name the package declares, by a member's last part; leaves unchecked one declared elsewhere, a file's name, one said gone, or one in a directory that holds no module; and lists the rest as undecided", () => {
    const r = trace({
      prepared: prepare(module, run([
        { to: "symbol:src/fmt/#buildRulesMap", span: "src/fmt/README.md:1" },
        { to: "symbol:src/fmt/#processPair", span: "src/fmt/README.md:2" },
        { to: "symbol:src/fmt/#SourceFile", span: "src/fmt/README.md:3" },
        { to: "symbol:src/fmt/#TutorsShell", span: "src/fmt/README.md:4" },
        { to: "symbol:src/fmt/#oldHelper", span: "src/fmt/README.md:5", absent: true },
        { to: "symbol:src/fmt/#createRulesMap", span: "src/fmt/README.md:6" },
        { to: "symbol:src/fmt/#ReadDirectoryChangesW", span: "src/fmt/README.md:7" },
        { to: "symbol:docs/#ghostName", span: "docs/x.md:1" },
        { to: "symbol:src/#underPackage", span: "src/README.md:1" },
      ])),
      facts,
      files,
    });
    expect(r.gaps).toEqual([{ kind: "symbol-undecided", subject: "Docs/src/fmt/README.md", fragments: [], detail: "names in backticks that no code of the repository declares: src/fmt/README.md:6 createRulesMap; src/fmt/README.md:7 ReadDirectoryChangesW" }]);
    expect(r.edges.some((e) => e.dangling === true)).toBe(false);
  });

  it("checks nothing about a package without facts", () => {
    expect(trace({ prepared: prepare(module, run([{ to: "symbol:src/fmt/#createRulesMap", span: "src/fmt/README.md:6" }])), files }).gaps).toEqual([]);
  });

  it("resolves a task its runner names; one missing is dangling, unless the runner's set is open, its file was not read, or its sentence says it is not built yet", () => {
    const r = trace({
      prepared: prepare(module, run([
        { rel: "mentions-script", to: "task:hereby#test", span: "d.md:1" },
        { rel: "mentions-script", to: "task:hereby#release", span: "d.md:2" },
        { rel: "mentions-script", to: "task:make#anything", span: "d.md:3" },
        { rel: "mentions-script", to: "task:just#fmt", span: "d.md:4" },
        { rel: "mentions-script", to: "task:hereby#seed", span: "d.md:5", absent: true },
      ])),
      facts,
      files,
    });
    expect(r.gaps).toEqual([{ kind: "dangling-reference", subject: "Docs/src/fmt/README.md", fragments: [], detail: "names what does not exist: d.md:2 mentions-script hereby release" }]);
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
        items: [item("R-1", "requirement", { status: "Enforced" }), item("R-2", "requirement", { status: "Enforced" }), item("R-3", "requirement", { status: "Enforced" }), item("R-4", "requirement", { status: "Practised" }), item("R-5", "requirement", { status: "Enforced" })],
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
          { from: "R-5", rel: "verified-by", to: "text:npx hereby test", span: "c.md:11" },
          { from: "R-5", rel: "mentions-script", to: "task:hereby#test", span: "c.md:11" },
        ],
      },
    },
  ];
  const files = ["src/a.ts", "src/b.ts", "docs/x.md", "x/c.ts", "y/c.ts"];
  const facts = [
    { schema: "csh-facts/v2", subject: { commit: "c" }, tool: { id: "facts-ts", version: "1" }, kind: "field", file: "package.json", path: "/scripts/check", value: "x", at: "package.json" },
    { schema: "csh-facts/v2", subject: { commit: "c" }, tool: { id: "facts-code", version: "1" }, kind: "task", runner: "hereby", file: "Herebyfile.mjs", name: "test", at: "Herebyfile.mjs" },
  ] as never[];

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

  it("reports an Enforced status that no mechanism it names supports; a script or a task named on the verifying line supports it", () => {
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

describe("references the tutors run taught (From the tutors run, sections 1, 5 and 6)", () => {
  const run = (items: ReturnType<typeof item>[], edges: NonNullable<SourceRun["output"]["edges"]>, source = "Docs"): SourceRun => ({ source, kind: "Documents", files: [], output: { diagnostics: [], items, edges } });
  const gapsOf = (rs: SourceRun[], files: string[]) => trace({ prepared: prepare(module, rs), files }).gaps.map((g) => `${g.kind} ${g.subject}`);

  it("resolves an identifier with case ignored when exactly one item matches", () => {
    const rs = [run([item("rule-0056", "rule")], [], "Features"), run([item("e2e/search.spec.ts", "test-file")], [{ from: "e2e/search.spec.ts", rel: "cites", to: "RULE-0056", span: "e2e/search.spec.ts:14" }], "Tests")];
    expect(gapsOf(rs, [])).not.toContain("dangling-reference Tests/e2e/search.spec.ts");
    const twice = [run([item("rule-1", "rule"), item("RULE-1", "rule")], [], "Features"), run([item("t.ts", "test-file")], [{ from: "t.ts", rel: "cites", to: "Rule-1", span: "t.ts:1" }], "Tests")];
    expect(gapsOf(twice, [])).toContain("dangling-reference Tests/t.ts");
  });

  it("reads a path from the mentioning file's directory, and leaves absent and elsewhere paths unchecked", () => {
    const files = ["apps/reader/README.md", "apps/reader/tests/e2e/a.spec.ts", "docs/a.md", "docs/b.md", "docs/c.md", "scripts/build.sh"];
    const rs = [
      run([item("apps/reader/README.md", "document"), item("docs/a.md", "document"), item("docs/b.md", "document"), item("docs/c.md", "document")], [
        { from: "apps/reader/README.md", rel: "mentions-file", to: "file:tests/e2e/", span: "apps/reader/README.md:3" },
        { from: "docs/a.md", rel: "mentions-file", to: "file:docs/old.feature", span: "docs/a.md:3", absent: true },
        { from: "docs/b.md", rel: "mentions-file", to: "file:scripts/fetch.sh", span: "docs/b.md:3", repos: ["tutors-sdk/tutors-release-harness"] },
        { from: "docs/c.md", rel: "mentions-file", to: "file:scripts/publish.sh", span: "docs/c.md:3", repos: ["scripts/build.sh"] },
      ]),
    ];
    expect(gapsOf(rs, files).filter((g) => g.startsWith("dangling-reference"))).toEqual(["dangling-reference Docs/docs/c.md"]);
  });

  it("reports a baseline with entries as baselined, and an empty one as nothing", () => {
    const rs = [run([item("known.txt", "baseline", { entries: "6", first: "a\nb\nc\nd\ne" }), item("empty.txt", "baseline", { entries: "0", first: "" })], [])];
    const g = trace({ prepared: prepare(module, rs), files: [] }).gaps;
    expect(g.map((x) => `${x.kind} ${x.subject}`)).toEqual(["baselined Docs/known.txt"]);
    expect(g[0]!.detail).toContain("6 entries");
    expect(g[0]!.detail).toContain("and 1 more");
  });
});

describe("From the Toads run (stage 62)", () => {
  const sc = (id: string, span: string, attrs?: Record<string, string>) => ({ id, kind: "scenario" as const, text: id.slice(id.lastIndexOf("/") + 1), span, textDigest: "sha256:0", ...(attrs !== undefined ? { attrs } : {}) });
  const tf = (id: string, attrs: Record<string, string>) => ({ id, kind: "test-file" as const, text: id, span: `${id}:1`, textDigest: "sha256:0", attrs: { tests: "0", bdd: "pytest-bdd", ...attrs } });
  const of = (items: NonNullable<SourceRun["output"]["items"]>, tests: NonNullable<SourceRun["output"]["items"]>): SourceRun[] => [
    { source: "Features", kind: "Features", files: [], output: { diagnostics: [], items, edges: [] } },
    { source: "Tests", kind: "TestFiles", files: [], output: { diagnostics: [], items: tests, edges: [] } },
  ];
  const kinds = (r: ReturnType<typeof trace>) => r.gaps.map((g) => [g.kind, g.subject]).sort();

  it("decides each scenario of a pytest-bdd repository: bound, step-less, unbound or undecided", () => {
    const items = [
      sc("a.feature#/one", "tests/features/a.feature:3", { steps: "4\tx" }),
      sc("a.feature#/two", "tests/features/a.feature:8", { tags: "@pending" }),
      sc("b.feature#/three", "tests/features/b.feature:3", { steps: "4\tx" }),
      sc("b.feature#/four", "tests/features/b.feature:8", { steps: "9\tx\n10\ty" }),
      sc("c.feature#/five", "tests/features/c.feature:3", { steps: "4\tx" }),
      sc("d.feature#/six", "tests/features/d.feature:3", { steps: "4\tx" }),
    ];
    const tests = [
      tf("tests/step_defs/test_a.py", { bindsFeatures: "../features/a.feature" }),
      tf("tests/step_defs/test_b.py", { bindsTitles: "three" }),
      tf("tests/step_defs/test_c.py", { bindsUndecided: "c.feature" }),
      tf("tests/step_defs/test_d.py", { bindsNamed: "d\nhelpers" }),
    ];
    const r = trace({ prepared: prepare(module, of(items, tests)) });
    expect(kinds(r)).toEqual([
      ["binding-undecided", "Features/c.feature#/five"],
      ["stepless-scenario", "Features/a.feature#/two"],
      ["unbound-scenario", "Features/b.feature#/four"],
    ]);
    expect(r.gaps.find((g) => g.kind === "unbound-scenario")!.detail).toContain("its 2 steps never run");
    expect(r.gaps.find((g) => g.kind === "stepless-scenario")!.detail).toContain("tagged @pending");
    expect(r.checks.get("Features/b.feature#/three")).toEqual(["test file tests/step_defs/test_b.py, by pytest-bdd"]);
    expect(r.checks.get("Features/d.feature#/six")).toEqual(["test file tests/step_defs/test_d.py, by pytest-bdd"]);
  });

  it("binds every feature file under a directory, and a title with its feature file, not by its title alone", () => {
    const items = [
      sc("a.feature#/one", "tests/features/shop/a.feature:3", { steps: "4\tx" }),
      sc("b.feature#/one", "tests/other/b.feature:3", { steps: "4\tx" }),
      sc("c.feature#/Pay", "tests/other/c.feature:3", { steps: "4\tx" }),
      sc("d.feature#/Pay", "tests/other/d.feature:3", { steps: "4\tx" }),
      sc("e.feature#/Refund", "tests/other/e.feature:3", { steps: "4\tx" }),
      sc("f.feature#/Refund", "tests/other/f.feature:3", { steps: "4\tx" }),
    ];
    const tests = [
      tf("tests/step_defs/test_a.py", { bindsDirs: "../features" }),
      tf("tests/step_defs/test_p.py", { bindsPairs: "c.feature\tPay" }),
      tf("tests/step_defs/test_r.py", { bindsTitles: "Refund" }),
    ];
    const r = trace({ prepared: prepare(module, of(items, tests)) });
    expect(kinds(r)).toEqual([
      ["binding-undecided", "Features/e.feature#/Refund"],
      ["binding-undecided", "Features/f.feature#/Refund"],
      ["unbound-scenario", "Features/b.feature#/one"],
      ["unbound-scenario", "Features/d.feature#/Pay"],
    ]);
    expect(r.checks.get("Features/a.feature#/one")).toEqual(["test file tests/step_defs/test_a.py, by pytest-bdd"]);
    expect(r.checks.get("Features/c.feature#/Pay")).toEqual(["test file tests/step_defs/test_p.py, by pytest-bdd"]);
  });

  it("decides nothing when no test file is a pytest-bdd module", () => {
    const r = trace({ prepared: prepare(module, of([sc("a.feature#/one", "a.feature:3")], [{ ...tf("t.py", {}), attrs: { tests: "1" } }])) });
    expect(kinds(r)).toEqual([]);
  });

  it("leaves a missing path the repository ignores unchecked, from the root, the mentioning directory, or as a directory", () => {
    const doc = (to: string, span = "docs/a.md:3"): SourceRun[] => [{ source: "Docs", kind: "Documents", files: [], output: { diagnostics: [], items: [item("docs/a.md", "document")], edges: [{ from: "docs/a.md", rel: "mentions-file", to, span }] } }];
    const files = ["docs/a.md", "config/x.example.yaml"];
    const dangling = (to: string, ignored: string[]) => trace({ prepared: prepare(module, doc(to)), files, ignored }).gaps.some((g) => g.kind === "dangling-reference");
    expect(dangling("file:config/x.yaml", [])).toBe(true);
    expect(dangling("file:config/x.yaml", ["config/x.yaml"])).toBe(false);
    expect(dangling("file:config/gen/", ["config/gen/"])).toBe(false);
    expect(dangling("file:docs/local.md", ["docs/docs/local.md"])).toBe(false);
    expect(dangling("file:config/y.yaml", ["config/x.yaml"])).toBe(true);
  });
});

describe("what prose names, tests exercise (stage 72)", () => {
  const fact = (f: Record<string, unknown>) => ({ schema: "csh-facts/v2", subject: { commit: "c" }, tool: { id: "facts-code", version: "1" }, ...f }) as never;
  const docs = (edges: { to: string; span: string }[]): SourceRun[] => [
    { source: "Docs", kind: "Documents", files: [], output: { diagnostics: [], items: [item("guide.md", "document")], edges: edges.map((e) => ({ from: "guide.md", rel: "mentions-symbol" as never, to: e.to, span: e.span })) } },
  ];
  const facts = [
    fact({ kind: "module", name: "src/a.ts" }),
    fact({ kind: "declare", module: "src/a.ts", symbol: "Shared", declares: "class", at: "src/a.ts:1" }),
    fact({ kind: "declare", module: "src/a.ts", symbol: "Lonely", declares: "class", at: "src/a.ts:2" }),
    fact({ kind: "module", name: "src/B.java" }),
    fact({ kind: "declare", module: "src/B.java", symbol: "Shared", declares: "class", at: "src/B.java:1" }),
  ];
  const mentions = (byName: Record<string, string[]>, unread: Record<string, string[]> = {}) => ({ byName: new Map(Object.entries(byName)), languages: new Set(["typescript", "java"]), unread: new Map(Object.entries(unread)) });

  it("counts a mention a readable test makes even when another test of its language could not be read", () => {
    const r = trace({ prepared: prepare(module, docs([{ to: "symbol:src/a.ts#Shared", span: "g:1" }])), facts, mentions: mentions({ "typescript:Shared": ["t/a.test.ts"] }, { typescript: ["t/broken.test.ts"] }) });
    expect(r.gaps.map((g) => g.kind)).toEqual(["exercised"]);
  });

  it("names the unread files when no test it read mentions the symbol, even when none of that language could be read", () => {
    const m = { byName: new Map<string, string[]>(), languages: new Set<string>(), unread: new Map([["typescript", ["t/broken.test.ts"]]]) };
    const r = trace({ prepared: prepare(module, docs([{ to: "symbol:src/a.ts#Lonely", span: "g:1" }])), facts, mentions: m });
    expect(r.gaps).toEqual([{ kind: "exercise-undecided", subject: "Docs/guide.md", fragments: [], detail: "names `Lonely` (TypeScript code, and t/broken.test.ts could not be read)" }]);
  });

  it("takes a name two languages declare as exercised when a test of either mentions it", () => {
    const r = trace({ prepared: prepare(module, docs([{ to: "symbol:src/#Shared", span: "g:1" }])), facts, mentions: mentions({ "java:Shared": ["t/BTest.java"] }) });
    expect(r.gaps).toEqual([{ kind: "exercised", subject: "Docs/guide.md", fragments: [], detail: "each symbol it names is mentioned by a test, which exercises it and may observe nothing of what is said: `Shared` (t/BTest.java)" }]);
  });

  it("names the tests that could cite an unverified rule, as it does an unverified requirement", () => {
    const rule = { ...item("f#r", "rule"), text: "The `Lonely` class keeps `Shared` apart" };
    const runs: SourceRun[] = [{ source: "Features", kind: "Features", files: [], output: { diagnostics: [], items: [rule], edges: [] } }];
    const r = trace({ prepared: prepare(module, runs), mentions: mentions({ "typescript:Lonely": ["t/a.test.ts", "t/b.test.ts"], "typescript:Shared": ["t/b.test.ts"] }) });
    expect(r.gaps[0]!.detail).toBe("f#r:1: no scenario sits under this rule; tests that mention every term it writes, and could cite it: t/b.test.ts");
  });
});
