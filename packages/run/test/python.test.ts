// Python code facts on a subject (stage 31): module rules and an inherits claim over a src-layout Python project, read by
// facts-code's Python reader in the isolated adapter process at the subject's pinned commit.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createZ3Solver, type SolverPort } from "@csh/solver";
import { fetchSubject, loadProject, runComponent } from "../src/index.ts";

const REPO = resolve(import.meta.dirname, "../../..");
let base: string;
let profile: string;
let z3: SolverPort;

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const write = (root: string, path: string, text: string) => {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), text);
};
const commit = (dir: string) => {
  git(dir, "add", "-A");
  git(dir, "-c", "user.email=test-only@example.invalid", "-c", "user.name=test-only", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "c");
  return git(dir, "rev-parse", "HEAD");
};

const SPEC = `import { system, forbid, modules, inherits } from "csl";
export default system("Snaked", (s) => {
  const Rules = s.source("Rules", { kind: "Requirements", at: "docs/rules.md" });
  s.policy("Structural", { require: ["FactsCurrent"] });
  s.intent("Layering", { owner: "Owner", value: "Inward", assurance: "Structural" }, (i) => {
    i.architecture("DomainBelowAdapters", forbid(modules("src/app/domain/**"), modules("src/app/adapters/**")), { cites: [{ source: Rules, id: "L-1" }] });
    i.architecture("AdaptersBelowApi", forbid(modules("src/app/adapters/**"), modules("src/app/api.py")), { cites: [{ source: Rules, id: "L-2" }] });
    i.claim("NotFoundIsDomain", inherits("NotFound", "DomainError"), { at: "docs/rules.md:3", cites: [{ source: Rules, id: "E-1" }] });
  });
});
`;

beforeAll(async () => {
  z3 = await createZ3Solver();
  mkdirSync(join(REPO, ".csh-cache"), { recursive: true });
  base = mkdtempSync(join(REPO, ".csh-cache", "python-"));
  const subject = join(base, "subject");
  mkdirSync(subject);
  git(subject, "init", "-q", "-b", "main");
  write(subject, "docs/rules.md", "| L-1 | The domain shall not import an adapter. |\n| L-2 | The adapter shall not import the API. |\n| E-1 | The domain error shall extend DomainError. |\n");
  write(subject, "pyproject.toml", '[project]\nname = "app"\nversion = "0.1.0"\n');
  write(subject, "src/app/__init__.py", "");
  write(subject, "src/app/api.py", "from app.domain.orders import place\nfrom .adapters import db\n");
  write(subject, "src/app/domain/__init__.py", "");
  write(subject, "src/app/domain/errors.py", "class DomainError(Exception):\n    pass\n\nclass NotFound(DomainError):\n    pass\n");
  write(subject, "src/app/domain/orders.py", "from typing import TYPE_CHECKING\nfrom ..adapters.db import save\nif TYPE_CHECKING:\n    from app.adapters.db import Session\n\ndef place(): save()\n");
  write(subject, "src/app/adapters/__init__.py", "");
  write(subject, "src/app/adapters/db.py", "import sqlite3\n\ndef save(): pass\n");
  const pinned = commit(subject);
  profile = join(base, "profile");
  mkdirSync(profile);
  git(profile, "init", "-q", "-b", "main");
  write(profile, "csh/spec.csl.ts", SPEC);
  write(
    profile,
    "csh/component.json",
    JSON.stringify({
      schema: "csh-component/v2",
      name: "Snaked",
      spec: "csh/spec.csl.ts",
      subject: { repo: subject, commit: pinned },
      implementation: ["src"],
      sources: [{ name: "Code", kind: "Code", at: ".", include: ["src/**/*.py", "pyproject.toml"] }],
      practices: [
        { id: "rules", name: "Rules", kind: "requirements", sources: ["Rules"] },
        { id: "code", name: "Code", kind: "facts", sources: ["Code"] },
      ],
    }),
  );
  write(profile, ".gitignore", ".csh-cache/\nreports/\n");
  commit(profile);
  const f = fetchSubject(loadProject(profile, profile));
  if (!f.ok) throw new Error(f.message);
}, 60000);
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("module rules and claims over Python code facts", () => {
  it("evaluates each rule and claim against the facts read at the subject's commit", async () => {
    const r = await runComponent({ root: profile, solver: z3 });
    if (!r.ok) throw new Error(r.message);
    const verdicts = Object.fromEntries((r.report.assessments ?? []).map((a) => [a.fragment.split("/").pop(), a.verdict]));
    expect(verdicts).toEqual({ DomainBelowAdapters: "violated", AdaptersBelowApi: "satisfied", NotFoundIsDomain: "satisfied" });
    const violated = r.report.assessments!.find((a) => a.verdict === "violated")!;
    expect(violated.reasons.join(" ")).toMatch(/src\/app\/domain\/orders\.py:2/);
    expect(r.report.diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
  });
});
