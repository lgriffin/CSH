// csh init --subject (From real runs, section 1): the guesses a proposal makes from a checkout's tracked files.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { proposeProfile, selectFiles } from "../src/index.ts";

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

  it("past eight families, proposes their common shape rather than the first eight (stage 45)", () => {
    const text = ["AUTH", "PERF", "SEC", "DATA", "UX", "OPS", "API", "LOG", "CFG", "NET"].map((p) => `${p}-001 ${p}-002`).join("\n");
    const r = propose(checkout({ "docs/x.md": `${text}\n` }));
    expect(r.manifest.practices.find((p) => p.id === "docs")?.settings?.idPattern).toBe("[A-Z]{2,4}-[0-9]{3}");
    expect(r.guesses.join("\n")).toMatch(/and 2 more prefixes of the same form/);
  });

  it("takes no step definition or test under a fixtures directory or a dot-directory (stage 45)", () => {
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
    expect(r.manifest.practices.find((p) => p.id === "tdd")?.settings).toBeUndefined();
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
