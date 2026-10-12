// Rust code facts on a subject (stage 34): a hexagonal cargo workspace read by the Rust reader of facts-code in the
// isolated adapter process at the subject's pinned commit, and module rules judged on its `mod` and `use` paths.
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
export default system("Hexagon", (s) => {
  const Rules = s.source("Rules", { kind: "Requirements", at: "docs/rules.md" });
  s.policy("Structural", { require: ["FactsCurrent"] });
  s.intent("Layering", { owner: "Owner", value: "Inward", assurance: "Structural" }, (i) => {
    i.architecture("DomainBelowAdapters", forbid(modules("core/src/domain/**"), modules("core/src/adapters/**")), { cites: [{ source: Rules, id: "H-1" }] });
    i.architecture("PortsBelowAdapters", forbid(modules("core/src/ports/**"), modules("core/src/adapters/**")), { cites: [{ source: Rules, id: "H-2" }] });
  });
});
`;

beforeAll(async () => {
  z3 = await createZ3Solver();
  mkdirSync(join(REPO, ".csh-cache"), { recursive: true });
  base = mkdtempSync(join(REPO, ".csh-cache", "rust-"));
  const subject = join(base, "subject");
  mkdirSync(subject);
  git(subject, "init", "-q", "-b", "main");
  write(subject, "docs/rules.md", "| H-1 | The domain shall not use an adapter. |\n| H-2 | The ports shall not use an adapter. |\n");
  write(subject, "Cargo.toml", '[workspace]\nmembers = ["core"]\n');
  write(subject, "core/Cargo.toml", '[package]\nname = "hex-core"\nversion = "0.1.0"\n');
  write(subject, "core/src/lib.rs", "pub mod domain;\npub mod ports;\npub mod adapters;\n");
  write(subject, "core/src/domain/mod.rs", "pub mod order;\n");
  write(subject, "core/src/domain/order.rs", "use crate::adapters::sql::SqlStore;\npub struct Order;\npub fn save(s: &SqlStore) {}\n");
  write(subject, "core/src/ports.rs", "use crate::domain::order::Order;\npub trait Store { fn put(&self, o: Order); }\n");
  write(subject, "core/src/adapters/mod.rs", "pub mod sql;\n");
  write(subject, "core/src/adapters/sql.rs", "use crate::ports::Store;\npub struct SqlStore;\n");
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
      implementation: ["core"],
      sources: [{ name: "Code", kind: "Code", at: ".", include: ["**/*.rs", "**/Cargo.toml"] }],
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

describe("module rules over Rust code facts", () => {
  it("finds the domain using an adapter, and the ports clean", async () => {
    const r = await runComponent({ root: profile, solver: z3 });
    if (!r.ok) throw new Error(r.message);
    const verdicts = Object.fromEntries((r.report.assessments ?? []).map((a) => [a.fragment.split("/").pop(), a.verdict]));
    expect(verdicts).toEqual({ DomainBelowAdapters: "violated", PortsBelowAdapters: "satisfied" });
    const violated = r.report.assessments!.find((a) => a.verdict === "violated")!;
    expect(violated.reasons.join(" ")).toMatch(/core\/src\/domain\/order\.rs:1/);
    expect(r.report.diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
  });
});
