// Go code facts on a subject (stage 33): a hexagonal Go module read by facts-code's Go reader in the isolated adapter
// process, and module rules judged against its imports exactly as against TypeScript's.
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

const SPEC = `import { system, forbid, modules } from "csl";
export default system("Shop", (s) => {
  const Rules = s.source("Rules", { kind: "Requirements", at: "docs/rules.md" });
  s.policy("Structural", { require: ["FactsCurrent"] });
  s.intent("Hexagon", { owner: "Owner", value: "Inward", assurance: "Structural" }, (i) => {
    i.architecture("DomainBelowAdapters", forbid(modules("internal/domain/**"), modules("internal/adapters/**")), { cites: [{ source: Rules, id: "H-1" }] });
    i.architecture("InternalBelowCmd", forbid(modules("internal/**"), modules("cmd/**")), { cites: [{ source: Rules, id: "H-2" }] });
  });
});
`;

beforeAll(async () => {
  z3 = await createZ3Solver();
  mkdirSync(join(REPO, ".csh-cache"), { recursive: true });
  base = mkdtempSync(join(REPO, ".csh-cache", "go-"));
  const subject = join(base, "subject");
  mkdirSync(subject);
  git(subject, "init", "-q", "-b", "main");
  write(subject, "docs/rules.md", "| H-1 | The domain shall not import an adapter. |\n| H-2 | The internal code shall not import a command. |\n");
  write(subject, "go.mod", "module example.com/shop\n\ngo 1.22\n");
  write(subject, "internal/domain/order.go", 'package domain\n\nimport "example.com/shop/internal/adapters/db"\n\ntype Order struct{ ID string }\n\nvar _ = db.Repo{}\n');
  write(subject, "internal/adapters/db/repo.go", 'package db\n\nimport (\n\t"database/sql"\n\n\t"example.com/shop/internal/domain"\n)\n\ntype Repo struct{ db *sql.DB }\n\nfunc (r Repo) Save(o domain.Order) error { return nil }\n');
  write(subject, "cmd/shop/main.go", 'package main\n\nimport (\n\t"fmt"\n\n\t"example.com/shop/internal/adapters/db"\n)\n\nfunc main() { fmt.Println(db.Repo{}) }\n');
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
      name: "Shop",
      spec: "csh/spec.csl.ts",
      subject: { repo: subject, commit: pinned },
      implementation: ["internal", "cmd"],
      sources: [{ name: "Code", kind: "Code", at: ".", include: ["**/*.go", "go.mod"] }],
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

describe("module rules over Go code facts", () => {
  it("evaluates each rule against the imports of a hexagonal Go module", async () => {
    const r = await runComponent({ root: profile, solver: z3 });
    if (!r.ok) throw new Error(r.message);
    const verdicts = Object.fromEntries((r.report.assessments ?? []).map((a) => [a.fragment.split("/").pop(), a.verdict]));
    expect(verdicts).toEqual({ DomainBelowAdapters: "violated", InternalBelowCmd: "satisfied" });
    const violated = r.report.assessments!.find((a) => a.verdict === "violated")!;
    expect(violated.reasons.join(" ")).toMatch(/internal\/domain\/order\.go:3/);
    expect(r.report.diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
  });
});
