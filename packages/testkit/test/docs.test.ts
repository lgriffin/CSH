// The documentation checks of the Architecture tab, section 6: a test fails when a package has no README or is
// missing from the container diagram source, and when a decision record cited in a README does not exist.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repo = resolve(import.meta.dirname, "../../..");
const packages = readdirSync(join(repo, "packages")).filter((p) => existsSync(join(repo, "packages", p, "package.json"))).sort();
const adrFiles = readdirSync(join(repo, "docs", "adr")).filter((f) => /^ADR-\d\d-.+\.md$/.test(f));
const adrNumbers = new Set(adrFiles.map((f) => f.slice(0, 6)));

const TEMPLATE = ["Purpose", "Where it sits", "Public interface", "Depends on and used by", "Invariants it protects", "Rationale", "How it is tested", "Known limits"];

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "spec" ? [] : markdownFiles(p);
    return e.name.endsWith(".md") ? [p] : [];
  });
}

const readmes = [join(repo, "README.md"), ...packages.map((p) => join(repo, "packages", p, "README.md")).filter(existsSync)];
const documents = [...readmes, join(repo, "ASSUMPTIONS.md"), join(repo, "QUESTIONS.md"), join(repo, "DEPENDENCIES.md"), ...markdownFiles(join(repo, "docs"))];

describe("package READMEs", () => {
  it.each(packages)("%s has a README following the template", (p) => {
    const file = join(repo, "packages", p, "README.md");
    expect(existsSync(file), `packages/${p}/README.md is missing`).toBe(true);
    const headings = readFileSync(file, "utf8").split("\n").filter((l) => l.startsWith("## ")).map((l) => l.slice(3).trim());
    expect(headings).toEqual(TEMPLATE);
  });
});

describe("container diagram", () => {
  const source = readFileSync(join(repo, "docs", "architecture", "containers.mmd"), "utf8");
  it.each(packages)("names %s", (p) => {
    expect(new RegExp(`\\b${p}\\b`).test(source), `docs/architecture/containers.mmd does not name ${p}`).toBe(true);
  });
  it("has a component diagram for every container it draws", () => {
    for (const c of ["cli", "run", "component", "harness", "emission", "adapters", "ledger", "check", "gate", "kernel"]) expect(existsSync(join(repo, "docs", "architecture", `components-${c}.mmd`)), c).toBe(true);
  });
});

describe("decision records", () => {
  it("cover every row of the Rationale tab", () => {
    for (let n = 1; n <= 16; n++) expect(adrNumbers.has(`ADR-${String(n).padStart(2, "0")}`), `ADR-${n}`).toBe(true);
  });

  it.each(adrFiles)("%s has the five headings", (f) => {
    const headings = readFileSync(join(repo, "docs", "adr", f), "utf8").split("\n").filter((l) => l.startsWith("## ")).map((l) => l.slice(3).trim());
    expect(headings).toEqual(["Context", "Decision", "Alternatives", "Consequences", "Status"]);
  });

  it.each(documents.map((d) => [d.slice(repo.length + 1), d]))("every record cited in %s exists", (_name, file) => {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/\bADR-(\d+)\b/g)) expect(adrNumbers.has(`ADR-${m[1]!.padStart(2, "0")}`), `ADR-${m[1]} is cited but has no record`).toBe(true);
    for (const m of text.matchAll(/\]\(([^)#\s]*ADR-\d\d-[^)#\s]+\.md)\)/g)) expect(existsSync(resolve(dirname(file), m[1]!)), `broken link ${m[1]}`).toBe(true);
  });
});

describe("assumptions and questions", () => {
  const assumptions = new Set([...readFileSync(join(repo, "ASSUMPTIONS.md"), "utf8").matchAll(/^\| (A-\d\d) \|/gm)].map((m) => m[1]));
  const questions = new Set([...readFileSync(join(repo, "QUESTIONS.md"), "utf8").matchAll(/^## (Q-\d\d) /gm)].map((m) => m[1]));
  const cited = [...documents, ...markdownFiles(join(repo, "fixtures")), ...packages.flatMap((p) => readdirSync(join(repo, "packages", p, "src")).map((f) => join(repo, "packages", p, "src", f)))];

  it.each(cited.map((d) => [d.slice(repo.length + 1), d]))("every assumption and question cited in %s exists", (_name, file) => {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/\bA-\d\d\b/g)) expect(assumptions.has(m[0]), `${m[0]} is cited but not registered`).toBe(true);
    for (const m of text.matchAll(/\bQ-\d\d\b/g)) expect(questions.has(m[0]), `${m[0]} is cited but not asked`).toBe(true);
  });
});
