// Java code facts on a subject (stage 32): a hexagonal Maven layout read by facts-java in the isolated adapter process,
// and module rules judged against its imports.
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

const J = "src/main/java/com/x";
const SPEC = `import { system, forbid, modules } from "csl";
export default system("Hexagon", (s) => {
  const Rules = s.source("Rules", { kind: "Requirements", at: "docs/rules.md" });
  s.policy("Structural", { require: ["FactsCurrent"] });
  s.intent("Layering", { owner: "Owner", value: "Inward", assurance: "Structural" }, (i) => {
    i.architecture("DomainBelowAdapters", forbid(modules("${J}/domain/**"), modules("${J}/adapters/**")), { cites: [{ source: Rules, id: "H-1" }] });
    i.architecture("AdaptersBelowApp", forbid(modules("${J}/adapters/**"), modules("${J}/app/**")), { cites: [{ source: Rules, id: "H-2" }] });
  });
});
`;

beforeAll(async () => {
  z3 = await createZ3Solver();
  mkdirSync(join(REPO, ".csh-cache"), { recursive: true });
  base = mkdtempSync(join(REPO, ".csh-cache", "java-"));
  const subject = join(base, "subject");
  mkdirSync(subject);
  git(subject, "init", "-q", "-b", "main");
  write(subject, "docs/rules.md", "| H-1 | The domain shall not import an adapter. |\n| H-2 | The adapters shall not import the application. |\n");
  write(subject, "pom.xml", "<project><groupId>com.x</groupId><artifactId>hex</artifactId><version>1</version></project>\n");
  write(subject, `${J}/domain/Order.java`, "package com.x.domain;\n\nimport com.x.adapters.db.OrderTable;\nimport java.util.List;\n\npublic class Order {}\n");
  write(subject, `${J}/domain/OrderPort.java`, "package com.x.domain;\n\npublic interface OrderPort {}\n");
  write(subject, `${J}/adapters/db/OrderTable.java`, "package com.x.adapters.db;\n\nimport com.x.domain.*;\n\npublic class OrderTable implements OrderPort {}\n");
  write(subject, `${J}/app/Main.java`, "package com.x.app;\n\nimport com.x.adapters.db.OrderTable;\nimport static com.x.domain.Order.*;\n\npublic class Main {}\n");
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
      name: "Hexagon",
      spec: "csh/spec.csl.ts",
      subject: { repo: subject, commit: pinned },
      implementation: ["src"],
      sources: [{ name: "Code", kind: "Code", at: ".", include: ["src/**/*.java", "pom.xml"] }],
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

describe("module rules over Java facts", () => {
  it("finds the domain importing an adapter, and adapters clear of the application", async () => {
    const r = await runComponent({ root: profile, solver: z3 });
    if (!r.ok) throw new Error(r.message);
    const verdicts = Object.fromEntries((r.report.assessments ?? []).map((a) => [a.fragment.split("/").pop(), a.verdict]));
    expect(verdicts).toEqual({ DomainBelowAdapters: "violated", AdaptersBelowApp: "satisfied" });
    const violated = r.report.assessments!.find((a) => a.verdict === "violated")!;
    expect(violated.reasons.join(" ")).toMatch(/src\/main\/java\/com\/x\/domain\/Order\.java:3/);
    expect(r.report.diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
  });
});
