// csh init --subject (From real runs, section 1): the guesses a proposal makes from a checkout's tracked files.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { proposeProfile, selectFiles } from "../src/index.ts";
import { globRegExp } from "@csh/kernel";
import { buildOutputsOf, isBaseline } from "../src/propose.ts";

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

/** A committed checkout holding `files`, with `origin` as its remote when given. */
function checkout(files: Record<string, string>, origin?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "csh-propose-"));
  dirs.push(dir);
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), text);
  }
  const g = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  g("init", "-q", "-b", "main");
  if (origin !== undefined) g("remote", "add", "origin", origin);
  g("add", "-A");
  g("-c", "user.email=test-only@example.invalid", "-c", "user.name=test-only", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "subject");
  return dir;
}

const propose = (dir: string) => {
  const r = proposeProfile(dir);
  if ("error" in r) throw new Error(r.error);
  return r;
};
const reads = (dir: string, r: ReturnType<typeof propose>, name: string) => {
  const s = r.manifest.sources!.find((x) => x.name === name);
  return s === undefined ? undefined : selectFiles(dir, s.at, s.include, s.exclude).map((f) => f.path).sort();
};

describe("proposeProfile", () => {
  it("names the origin remote as the subject and its HEAD as the commit", () => {
    const dir = checkout({ "src/a.ts": "export const a = 1;\n" }, "https://example.invalid/acme/shop.git");
    const r = propose(dir);
    expect(r.manifest.subject?.repo).toBe("https://example.invalid/acme/shop.git");
    expect(r.manifest.subject?.commit).toBe(execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim());
    expect(r.guesses.join("\n")).not.toMatch(/not portable/);
  });

  it("proposes no identifier pattern when no prefix names two identifiers, and says so", () => {
    const dir = checkout({ "README.md": "Uses UTF-8, SHA-1, SHA-256 and RFC-9110; ticket ABC-1.\n", "src/a.ts": "export const a = 1;\n" });
    const r = propose(dir);
    expect(r.guesses.join("\n")).toMatch(/no idPattern/);
    expect(r.manifest.practices.find((p) => p.id === "docs")?.settings).toBeUndefined();
  });

  it("orders identifier families by mentions, naming up to eight", () => {
    const text = ["AA", "BB", "DD", "EE", "FF", "GG", "HH", "II"].map((p, i) => `${`${p}-1 ${p}-2 `.repeat(i + 1)}`).join("\n");
    const r = propose(checkout({ "docs/x.md": `${text}\n` }));
    expect(r.manifest.practices.find((p) => p.id === "docs")?.settings?.idPattern).toBe("(?:II|HH|GG|FF|EE|DD|BB|AA)-[0-9]+");
  });

  it("past eight families, names every prefix in the pattern and the first eight in the guess (stage 46)", () => {
    const prefixes = ["AUTH", "PERF", "SEC", "DATA", "UX", "OPS", "API", "LOG", "CFG", "NET"];
    const text = prefixes.map((p) => `${p}-001 ${p}-002`).join("\n");
    const r = propose(checkout({ "docs/x.md": `${text}\n` }));
    const idPattern = r.manifest.practices.find((p) => p.id === "docs")?.settings?.idPattern as string;
    for (const p of prefixes) expect(idPattern).toContain(p);
    const re = new RegExp(`^${idPattern}$`);
    expect(re.test("NET-001")).toBe(true);
    expect(re.test("UTF-8")).toBe(false);
    expect(re.test("RFC-2119")).toBe(false);
    expect(r.guesses.join("\n")).toMatch(/and 2 more prefixes in the Markdown/);
  });

  it("proposes nothing under a committed Python virtual environment (stage 46)", () => {
    const dir = checkout({
      "app/main.py": "x = 1\n",
      "tests/test_main.py": "def test_x():\n    pass\n",
      ".venv/lib/python3.12/site-packages/pkg/__init__.py": "y = 2\n",
      ".venv/lib/python3.12/site-packages/pkg/test_pkg.py": "def test_y():\n    pass\n",
    });
    const r = propose(dir);
    expect(reads(dir, r, "Code")).toEqual(["app/main.py"]);
    expect(reads(dir, r, "Tests")).toEqual(["tests/test_main.py"]);
  });

  it("takes no step definition or test under a fixtures directory or a dot-directory (stage 46)", () => {
    const dir = checkout({
      "features/a.feature": "Feature: A\n  Scenario: S\n    Given a\n",
      "features/steps/a.steps.js": "Given('a', () => {});\n",
      "tests/suite-health/fixtures/b.steps.js": "Given('b', () => {});\n",
      ".claude/skills/x/c.test.js": "test('c', () => {});\n",
      "src/d.test.js": "test('d', () => {});\n",
    });
    const r = propose(dir);
    expect(reads(dir, r, "Tests")).toEqual(["features/steps/a.steps.js", "src/d.test.js"]);
  });

  it("keeps a Python steps package in Code where no feature file is, and reads it as steps beside features (stage 62)", () => {
    const plain = checkout({ "src/pipeline/steps/load.py": "def load():\n    pass\n", "tests/test_load.py": "def test_x():\n    pass\n" });
    expect(reads(plain, propose(plain), "Code")).toEqual(["src/pipeline/steps/load.py"]);
    const bdd = checkout({ "features/a.feature": "Feature: A\n  Scenario: S\n    Given a\n", "features/steps/a.py": "from behave import given\n\n@given('a')\ndef a(c):\n    pass\n" });
    const r = propose(bdd);
    expect(reads(bdd, r, "Code")).toBeUndefined();
    expect(reads(bdd, r, "Tests")).toEqual(["features/steps/a.py"]);
  });

  it("leaves tests and colocated tests out of Code, and names jest's results", () => {
    const dir = checkout({
      "package.json": JSON.stringify({ name: "@acme/shop-core", devDependencies: { jest: "30.0.0" } }),
      "src/a.ts": "export const a = 1;\n",
      "src/a.test.ts": 'test("a", () => {});\n',
      "lib/b.js": "export const b = 2;\n",
      "lib/b.spec.js": 'it("b", () => {});\n',
      "node_modules/x/index.js": "",
    });
    const r = propose(dir);
    expect(r.manifest.name).toBe("ShopCore");
    expect(reads(dir, r, "Code")).toEqual(["lib/b.js", "package.json", "src/a.ts"]);
    expect(reads(dir, r, "Tests")).toEqual(["lib/b.spec.js", "src/a.test.ts"]);
    expect(r.manifest.implementation).toEqual(["lib", "src"]);
    expect(r.manifest.practices.find((p) => p.id === "tdd")?.executions).toBe("csh/results.json");
    expect(r.guesses.join("\n")).toMatch(/npx jest --json --outputFile=jest.json/);
  });

  it("reads Python, Java, Go and Rust tests by their runners' conventions", () => {
    const dir = checkout({
      "app/cart.py": "X = 1\n",
      "tests/test_cart.py": "def test_x(): pass\n",
      "app/cart_test.py": "def test_y(): pass\n",
      "src/main/java/Cart.java": "class Cart {}\n",
      "src/test/java/CartTest.java": "class CartTest {}\n",
      "src/test/java/CartTests.java": "class CartTests {}\n",
      "cart/cart.go": "package cart\n",
      "cart/cart_test.go": "package cart\n",
      "crate/src/lib.rs": "pub fn a() {}\n",
      "crate/tests/it.rs": "#[test] fn a() {}\n",
    });
    const r = propose(dir);
    expect(reads(dir, r, "Tests")).toEqual(["app/cart_test.py", "cart/cart_test.go", "crate/tests/it.rs", "src/test/java/CartTest.java", "src/test/java/CartTests.java", "tests/test_cart.py"]);
    expect(reads(dir, r, "Code")).toEqual(["app/cart.py", "cart/cart.go", "crate/src/lib.rs", "src/main/java/Cart.java"]);
    // No identifier scheme, so a test title cites nothing (A-221).
    expect(r.manifest.practices.find((p) => p.id === "tdd")?.settings).toEqual({ citePattern: "(?!)" });
    expect(r.guesses.join("\n")).toMatch(/tests cite nothing/);
  });

  it("does not take a tag family as the rules' identifier when one of its tags names two rules, or the feature", () => {
    const feature = (tags: string[]) => `@feat-9\nFeature: F\n\n${tags.map((t, i) => `  ${t}\n  Rule: R${i}\n    Scenario: S${i}\n      Given x\n`).join("\n")}`;
    const r = propose(checkout({ "a.feature": feature(["@rule-1", "@rule-1", "@rule-2"]), "b.feature": feature(["@k-1", "@k-2"]) }));
    // rule-1 names two rules; feat-9 tags the features; k names one rule each.
    expect(r.manifest.practices.find((p) => p.id === "bdd")?.settings).toEqual({ idTag: "(k-[0-9]+)" });
  });

  it("refuses a directory that is not a git checkout", () => {
    const dir = mkdtempSync(join(tmpdir(), "csh-propose-"));
    dirs.push(dir);
    expect(proposeProfile(dir)).toEqual({ error: `${dir} is not a git checkout with a commit` });
  });
});

describe("proposals for csh analyse (stage 55)", () => {
  it("reads nested language manifests as code, but none in a fixture, a dot-directory or a test directory", () => {
    const dir = checkout({ "go.mod": "module a\n", "go.work": "go 1.22\n\nuse ./tools\n", "tools/go.mod": "module a/tools\n", "svc/pom.xml": "<project/>", "tests/data/Cargo.toml": "", "fixtures/x/go.mod": "", ".github/pyproject.toml": "", "main.go": "package main\n", "tools/t.go": "package tools\n" });
    const r = propose(dir);
    expect(reads(dir, r, "Code")).toEqual(["go.mod", "go.work", "main.go", "svc/pom.xml", "tools/go.mod", "tools/t.go"]);
    expect(r.guesses.join("\n")).toContain("and go.mod, go.work, svc/pom.xml, tools/go.mod");
  });

  it("reads the task runner files at the root as code, and none below it (stage 68)", () => {
    const dir = checkout({ "Makefile": "a:\n", "justfile": "b:\n", "Herebyfile.mjs": "export {};\n", "tools/Makefile": "c:\n", "main.go": "package main\n" });
    expect(reads(dir, propose(dir), "Code")).toEqual(["Herebyfile.mjs", "Makefile", "justfile", "main.go"]);
  });

  it("proposes a Code source for a task runner's file where no code is read (stage 68)", () => {
    const dir = checkout({ "Makefile": "a:\n", "justfile": "b:\n", "README.md": "Run `make a`.\n" });
    const r = propose(dir);
    expect(reads(dir, r, "Code")).toEqual(["Makefile", "justfile"]);
    expect(r.guesses.join("\n")).toContain("Code: no source files, and Makefile, justfile");
  });

  it("proposes a Mermaid C4Container diagram in a file of its own as an Architecture source", () => {
    const dir = checkout({ "docs/c4.mmd": "%% the containers\n\nC4Container\nContainer(a, \"A\", \"pkg-a\")\n", "docs/flow.mmd": "flowchart LR\n  a --> b\n", "a.ts": "export {};\n" });
    const r = propose(dir);
    expect(reads(dir, r, "Architecture")).toEqual(["docs/c4.mmd"]);
    expect(r.manifest.practices.find((p) => p.sources.includes("Architecture"))?.kind).toBe("architecture");
  });

  it("sets told: sentences on every Markdown practice when asked to lift, and never for csh init", () => {
    const dir = checkout({ "README.md": "# A\n", "AGENTS.md": "# Agents\n", "docs/reqs.md": "## AB-1 x\n\n## AB-2 y\n", "a.ts": "export {};\n" });
    const lifted = proposeProfile(dir, { lift: true });
    if ("error" in lifted) throw new Error(lifted.error);
    const told = lifted.manifest.practices.filter((p) => p.settings?.told === "sentences").map((p) => p.kind).sort();
    expect(told).toEqual(["documents", "instructions", "requirements"]);
    expect(lifted.guesses.join("\n")).toContain("told sentences");
    expect(propose(dir).manifest.practices.some((p) => p.settings?.told !== undefined)).toBe(false);
  });
});

describe("proposals the tutors run taught (From the tutors run, sections 3 and 6)", () => {
  it("leaves feature files in a fixture or a dot-directory out of Features and out of the idTag guess", () => {
    const rule = (n: string) => `Feature: F\n  @rule-${n}\n  Rule: The reader shall do ${n}.\n    Scenario: s ${n}\n      Given a\n`;
    const dir = checkout({ "features/a.feature": rule("0001"), "features/b.feature": rule("0002"), "tests/fixtures/bad.feature": `${rule("0009")}${rule("0009").replace("Feature: F\n", "")}`, ".claude/x.feature": rule("0001") });
    const r = propose(dir);
    expect(reads(dir, r, "Features")).toEqual(["features/a.feature", "features/b.feature"]);
    expect(r.manifest.practices.find((p) => p.id === "bdd")?.settings?.idTag).toBe("(rule-[0-9]+)");
    expect(r.guesses.join("\n")).toContain("leaving out 2 in fixtures or dot-directories");
  });

  it("reads a dependency-cruiser configuration with the documents, and shrink-only baselines as a source of their own", () => {
    const dir = checkout({ "README.md": "# A\n", ".dependency-cruiser.cjs": "module.exports = {};\n", "tests/arch/known.txt": "# Known.\n# This file may only\n# shrink.\nrule: a -> b\n", "tests/arch/notes.txt": "# Notes\nrule: a -> b\n", "tests/fixtures/known.txt": "# This file may only shrink.\nx\n", "a.ts": "export {};\n" });
    const r = propose(dir);
    expect(reads(dir, r, "Documents")).toEqual([".dependency-cruiser.cjs", "README.md"]);
    expect(reads(dir, r, "Baselines")).toEqual(["tests/arch/known.txt"]);
    expect(r.manifest.practices.find((p) => p.id === "docs")?.sources).toEqual(["Documents", "Baselines"]);
    expect(isBaseline("\n# may only shrink\n")).toBe(true);
    expect(isBaseline("entry\n# may only shrink\n")).toBe(false);
  });

  it("reads baselines with no other document, and a dependency-cruiser configuration with every Markdown source", () => {
    const dir = checkout({ "AGENTS.md": "# Agents\n", ".dependency-cruiser.cjs": "module.exports = {};\n", "tests/arch/known.txt": "# This file may only shrink.\nrule: a -> b\n", "a.ts": "export {};\n" });
    const r = propose(dir);
    expect(reads(dir, r, "Instructions")).toEqual([".dependency-cruiser.cjs", "AGENTS.md"]);
    expect(reads(dir, r, "Baselines")).toEqual(["tests/arch/known.txt"]);
    expect(r.manifest.practices.find((p) => p.id === "docs")?.sources).toEqual(["Baselines"]);
  });

  it("reads test data and suite files as none of Requirements, Instructions or Baselines (stage 70, A-262)", () => {
    const dir = checkout({
      "README.md": "# App\n\n## REQ-1 One\n\n## REQ-2 Two\n",
      "src/a.ts": "export const a = 1;\n",
      "testdata/AGENTS.md": "# Agent instructions in a case\n",
      "testdata/spec.md": "## REQ-3 Three\n\nREQ-1 REQ-2\n",
      "testdata/known.txt": "# baseline: this list may only shrink\nsrc/a.ts\n",
      "tests/input/x.md": "## REQ-4 Four\n",
      "tests/expected/x.md": "## REQ-4 Four\n",
    });
    const r = propose(dir);
    expect(reads(dir, r, "Requirements")).toEqual(["README.md"]);
    expect(reads(dir, r, "Instructions")).toBeUndefined();
    expect(reads(dir, r, "Baselines")).toBeUndefined();
    expect(reads(dir, r, "Outputs")).toEqual(expect.arrayContaining(["tests/expected/x.md", "tests/input/x.md"]));
  });
});

describe("build output (stage 75, A-268)", () => {
  it("is a dist, build, out or target directory at the root or beside a build manifest, never a source directory of that name", () => {
    const o = buildOutputsOf(["build/app.js", "web/package.json", "web/dist/a.js", "tsc/internal/execute/build/build.go", "web/src/out/f.ts"]);
    expect([...o.dirs].sort()).toEqual(["build", "web/dist"]);
    // `build` and `out` name source somewhere, so each is excluded where a build would write it, at the root and beside
    // every manifest, with files there yet or not; `dist` and `target` stay plain.
    expect(o.globs).toEqual(expect.arrayContaining(["**/node_modules/**", "**/dist/**", "build/**", "web/build/**", "out/**", "web/out/**", "**/target/**"]));
    expect(o.globs).not.toContain("**/build/**");
    expect(o.globs).not.toContain("**/out/**");
    const excluded = (p: string) => o.globs.some((g) => globRegExp(g).test(p));
    expect(excluded("web/build/later.js")).toBe(true);
    expect(excluded("tsc/internal/execute/build/build.go")).toBe(false);
    expect(excluded("web/src/out/f.ts")).toBe(false);
  });

  it("keeps the plain globs while no source directory has one of the names", () => {
    expect(buildOutputsOf(["src/a.ts", "package.json", "dist/a.js"]).globs).toEqual(expect.arrayContaining(["**/dist/**", "**/build/**", "**/out/**", "**/target/**"]));
  });
});
