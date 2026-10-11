// Structural claims on a subject (Ingesting a codebase, stage 24): claims written in the specification and proposed in
// csh/claims.json are judged against the code facts read at the subject's commit. A refuted claim is a fact-conflict;
// two claims that cannot both hold are a claim-conflict, whatever the code says.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createZ3Solver, type SolverPort } from "@csh/solver";
import { componentQueue, fetchSubject, loadProject, runComponent } from "../src/index.ts";

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

const SPEC = `import { system, inherits, count, same, constant } from "csl";
export default system("Claimed", (s) => {
  const Rules = s.source("Rules", { kind: "Requirements", at: "docs/rules.md" });
  s.policy("Structural", { require: ["FactsCurrent"] });
  s.intent("Errors", { owner: "Owner", value: "Typed", assurance: "Structural" }, (i) => {
    i.claim("OpenIsLib", inherits("OpenError", "LibError"), { at: "docs/rules.md:1", cites: [{ source: Rules, id: "E-1" }] });
    i.claim("OpenIsNotLib", inherits("OpenError", "LibError"), { holds: false, at: "docs/rules.md:2", cites: [{ source: Rules, id: "E-2" }] });
    i.claim("TwoEntries", count("package.json", "/exports", 2), { at: "docs/rules.md:3", cites: [{ source: Rules, id: "E-3" }] });
    i.claim("OneDate", same(constant("src/a.ts", "DATE"), constant("src/b.ts", "DATE")), { cites: [{ source: Rules, id: "E-1" }] });
  });
});
`;

beforeAll(async () => {
  z3 = await createZ3Solver();
  mkdirSync(join(REPO, ".csh-cache"), { recursive: true });
  base = mkdtempSync(join(REPO, ".csh-cache", "claims-"));
  const subject = join(base, "subject");
  mkdirSync(subject);
  git(subject, "init", "-q", "-b", "main");
  write(subject, "docs/rules.md", "| E-1 | Every error shall extend LibError. |\n| E-2 | OpenError shall stand alone. |\n| E-3 | Two entry points. |\n");
  write(subject, "src/err.ts", "export class LibError extends Error {}\nexport class OpenError extends LibError {}\n");
  write(subject, "src/a.ts", "export const DATE = '2026-08-18';\n");
  write(subject, "src/b.ts", "export const DATE = '2025-12-16';\n");
  write(subject, "package.json", JSON.stringify({ name: "claimed", exports: { ".": "./a.js", "./b": "./b.js", "./c": "./c.js" } }));
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
      name: "Claimed",
      spec: "csh/spec.csl.ts",
      subject: { repo: subject, commit: pinned },
      implementation: ["src"],
      sources: [{ name: "Code", kind: "Code", at: ".", include: ["src/**/*.ts", "package.json"] }],
      practices: [
        { id: "rules", name: "Rules", kind: "requirements", sources: ["Rules"] },
        { id: "code", name: "Code", kind: "facts", sources: ["Code"] },
      ],
    }),
  );
  write(profile, "csh/claims.json", JSON.stringify({ schema: "csh-claims/v1", claims: [{ name: "ThreeEntries", intent: "Errors", claim: { k: "claim", holds: true, p: { k: "count", file: "package.json", pointer: "/exports", n: 3 } }, cites: [{ source: "Rules", id: "E-3" }], why: "package.json lists three" }] }));
  write(profile, ".gitignore", ".csh-cache/\nreports/\n");
  commit(profile);
  const f = fetchSubject(loadProject(profile, profile));
  if (!f.ok) throw new Error(f.message);
}, 60000);
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("structural claims over code facts", () => {
  it("judges each claim by the facts, and reports refuted claims and claims in conflict", async () => {
    const r = await runComponent({ root: profile, solver: z3 });
    if (!r.ok) throw new Error(r.message);
    const verdicts = Object.fromEntries((r.report.assessments ?? []).map((a) => [a.fragment.split("/").pop(), a.verdict]));
    // Both members of a claim-conflict are conflicting, the true one too: the sources disagree, and a person settles which.
    expect(verdicts).toEqual({ OpenIsLib: "conflicting", OpenIsNotLib: "conflicting", TwoEntries: "conflicting", ThreeEntries: "conflicting", OneDate: "violated" });
    const kinds = r.report.findings.map((f) => [f.kind, f.members.map((m) => m.fragment.split("/").pop()).join(",")]);
    expect(kinds).toEqual(
      expect.arrayContaining([
        ["fact-conflict", "OpenIsNotLib"],
        ["fact-conflict", "TwoEntries"],
        ["fact-conflict", "OneDate"],
        ["claim-conflict", "OpenIsLib,OpenIsNotLib"],
        ["claim-conflict", "ThreeEntries,TwoEntries"],
      ]),
    );
    const dates = r.report.findings.find((f) => f.kind === "fact-conflict" && (f.reason ?? "").includes("DATE"))!;
    expect(dates.reason).toMatch(/src\/a\.ts:1: DATE is "2026-08-18"; src\/b\.ts:1: DATE is "2025-12-16"/);
  });

  it("traces a proposed claim to the commit that proposed it, as a rule is traced to the one that wrote it", async () => {
    const q = await componentQueue(loadProject(profile, profile), z3);
    if (!q.ok) throw new Error(q.message);
    const proposed = q.queue.entries.find((x) => x.fragment.endsWith("/ThreeEntries"))!;
    expect(proposed.since).toBe(git(profile, "log", "-1", "--format=%H", "--", "csh/claims.json"));
  });
});
