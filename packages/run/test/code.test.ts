// Code facts on a subject (Ingesting a codebase, stage 23): a profile with a specification of module rules and a source
// the manifest declares beside it, read by facts-ts in the isolated adapter process at the subject's pinned commit.
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
export default system("Coded", (s) => {
  const Rules = s.source("Rules", { kind: "Requirements", at: "docs/rules.md" });
  s.policy("Structural", { require: ["FactsCurrent"] });
  s.intent("Layering", { owner: "Owner", value: "Inward", assurance: "Structural" }, (i) => {
    i.architecture("CoreBelowClients", forbid(modules("src/core/**"), modules("src/clients/**")), { cites: [{ source: Rules, id: "L-1" }] });
    i.architecture("ClientsBelowNothing", forbid(modules("src/clients/**"), modules("src/app.ts")), { cites: [{ source: Rules, id: "L-2" }] });
  });
});
`;

beforeAll(async () => {
  z3 = await createZ3Solver();
  mkdirSync(join(REPO, ".csh-cache"), { recursive: true });
  base = mkdtempSync(join(REPO, ".csh-cache", "code-"));
  const subject = join(base, "subject");
  mkdirSync(subject);
  git(subject, "init", "-q", "-b", "main");
  write(subject, "docs/rules.md", "| L-1 | The core shall not import a client. |\n| L-2 | The client shall not import the app. |\n");
  write(subject, "src/core/pipeline.ts", "import { Client } from '../clients/client.js';\nexport const run = (c: Client) => c;\n");
  write(subject, "src/clients/client.ts", "export class Client {}\n");
  write(subject, "src/app.ts", "import { run } from './core/pipeline';\nexport { run };\n");
  write(subject, "package.json", JSON.stringify({ name: "coded", engines: { node: ">=22" } }));
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
      name: "Coded",
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
  write(profile, ".gitignore", ".csh-cache/\nreports/\n");
  commit(profile);
  const f = fetchSubject(loadProject(profile, profile));
  if (!f.ok) throw new Error(f.message);
}, 60000);
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("module rules over code facts", () => {
  it("evaluates each rule against the facts read at the subject's commit", async () => {
    const r = await runComponent({ root: profile, solver: z3 });
    if (!r.ok) throw new Error(r.message);
    const verdicts = Object.fromEntries((r.report.assessments ?? []).map((a) => [a.fragment.split("/").pop(), a.verdict]));
    expect(verdicts).toEqual({ CoreBelowClients: "violated", ClientsBelowNothing: "satisfied" });
    const violated = r.report.assessments!.find((a) => a.verdict === "violated")!;
    expect(violated.reasons.join(" ")).toMatch(/src\/core\/pipeline\.ts:1/);
    expect(r.report.diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
  });

});
