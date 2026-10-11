// A subject profile (Ingesting a codebase, stage 21): a component with no specification, evaluating a repository it
// does not hold from outside, at a pinned commit, without writing to it.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createZ3Solver, type SolverPort } from "@csh/solver";
import { componentStatus, fetchSubject, loadProject, runAt, runComponent, subjectCheckout } from "../src/index.ts";

const REPO = resolve(import.meta.dirname, "../../..");
let base: string;
let subject: string;
let profile: string;
let pinned: string;
let profileCommit: string;
let z3: SolverPort;

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const repoAt = (dir: string) => {
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "test-only@example.invalid");
  git(dir, "config", "user.name", "test-only");
  git(dir, "config", "commit.gpgsign", "false");
};
const commitAll = (dir: string, message: string) => {
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", message);
  return git(dir, "rev-parse", "HEAD");
};

const manifest = (commit: string) => ({
  schema: "csh-component/v2",
  name: "Subject",
  subject: { repo: subject, commit },
  implementation: ["src"],
  sources: [{ name: "Product", kind: "Requirements", at: "docs/requirements.md" }],
  practices: [{ id: "ears", name: "EARS", kind: "requirements", sources: ["Product"] }],
});

beforeAll(async () => {
  z3 = await createZ3Solver();
  mkdirSync(join(REPO, ".csh-cache"), { recursive: true });
  base = mkdtempSync(join(REPO, ".csh-cache", "subject-"));
  subject = join(base, "subject");
  repoAt(subject);
  mkdirSync(join(subject, "docs"));
  mkdirSync(join(subject, "src"));
  writeFileSync(join(subject, "docs", "requirements.md"), "| REQ-1 | The service shall log every request. |\n| REQ-2 | When asked, the service shall answer. |\n");
  writeFileSync(join(subject, "src", "service.ts"), "export const version = 1;\n");
  pinned = commitAll(subject, "first");
  // A later commit the profile is not pinned to.
  writeFileSync(join(subject, "docs", "requirements.md"), "| REQ-1 | The service shall log every request. |\n");
  commitAll(subject, "second");
  profile = join(base, "profile");
  repoAt(profile);
  mkdirSync(join(profile, "csh"));
  writeFileSync(join(profile, "csh", "component.json"), JSON.stringify(manifest(pinned), null, 2));
  writeFileSync(join(profile, ".gitignore"), "reports/\n.csh-cache/\n");
  profileCommit = commitAll(profile, "profile");
}, 60000);
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("a subject profile", () => {
  it("is unusable until the subject is fetched", async () => {
    const r = await runComponent({ root: profile, solver: z3 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/subject-missing/);
    const status = await componentStatus(loadProject(profile, profile), z3);
    expect(status.ok).toBe(false);
    if (!status.ok) expect(status.message).toMatch(/subject-missing/);
  });

  it("fetches the subject at its pinned commit, once", () => {
    const p = loadProject(profile, profile);
    const first = fetchSubject(p);
    expect(first).toEqual({ ok: true, dir: subjectCheckout(profile, pinned), fetched: true });
    expect(git(subjectCheckout(profile, pinned), "rev-parse", "HEAD")).toBe(pinned);
    expect(fetchSubject(p)).toEqual({ ok: true, dir: subjectCheckout(profile, pinned), fetched: false });
  });

  it("runs with no specification, reads sources from the subject and names it in the snapshot and the report", async () => {
    const r = await runComponent({ root: profile, solver: z3 });
    if (!r.ok) throw new Error(r.message);
    expect(r.report.items.map((i) => i.id)).toEqual(["REQ-1", "REQ-2"]);
    expect(r.report.subject).toEqual({ repo: subject, commit: pinned });
    expect(r.record.snapshot.subject).toEqual({ repo: subject, commit: pinned });
    expect(r.record.snapshot.commit).toBe(profileCommit);
    expect(r.record.component).toBe("Subject");
    expect(r.report.assessments ?? []).toEqual([]);
    expect(r.decision.overall).toBe("allow");
    // Nothing was written to the subject.
    expect(git(subjectCheckout(profile, pinned), "status", "--porcelain")).toBe("");
  });

  it("refuses a checkout at another commit, or with uncommitted changes", async () => {
    const other = await runComponent({ root: profile, solver: z3, subject });
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.message).toMatch(/subject-commit-differs/);
    const checkout = subjectCheckout(profile, pinned);
    writeFileSync(join(checkout, "docs", "requirements.md"), "| REQ-9 | Edited. |\n");
    try {
      const dirty = await runComponent({ root: profile, solver: z3 });
      expect(dirty.ok).toBe(false);
      if (!dirty.ok) expect(dirty.message).toMatch(/subject-dirty/);
    } finally {
      git(checkout, "checkout", "--", ".");
    }
    // An ignored file in a source directory would be read by the run without changing its snapshot.
    writeFileSync(join(checkout, ".git", "info", "exclude"), "*.local\n");
    writeFileSync(join(checkout, "docs", "extra.local"), "| REQ-8 | Ignored. |\n");
    try {
      const ignored = await runComponent({ root: profile, solver: z3 });
      expect(ignored.ok).toBe(false);
      if (!ignored.ok) expect(ignored.message).toMatch(/subject-dirty/);
      // A dirty checkout is never replaced by a fetch: it is reported, and left as it is.
      const f = fetchSubject(loadProject(profile, profile));
      expect(f.ok).toBe(false);
      expect(existsSync(join(checkout, "docs", "extra.local"))).toBe(true);
    } finally {
      rmSync(join(checkout, "docs", "extra.local"));
    }
  });

  it("gives the status of a fetched subject, reading its sources from the checkout", async () => {
    const status = await componentStatus(loadProject(profile, profile), z3);
    if (!status.ok) throw new Error(status.message);
    expect(status.status.component).toBe("Subject");
  });

  it("runs the profile as it stood at a past commit, reading the subject fetched under the component root", async () => {
    const r = await runAt({ root: profile, solver: z3, commit: profileCommit });
    if (!r.ok) throw new Error(r.message);
    expect(r.record.snapshot.commit).toBe(profileCommit);
    expect(r.report.items.map((i) => i.id)).toEqual(["REQ-1", "REQ-2"]);
  });

  it("refuses --subject for a component that names no subject", () => {
    const p = loadProject(subject, subject, { subject });
    expect(p.component).toBeUndefined();
    expect(p.componentProblems.map((x) => x.code)).toEqual(["no-subject"]);
  });
});
