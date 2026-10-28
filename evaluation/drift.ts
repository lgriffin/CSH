// Seeded drift (The analysis A3 and 1.0, section 4; stage 80): usage node evaluation/drift.ts <checkout> <drifts.json>.
// Each drift edits the checkout the way a repository drifts: a file a document links is deleted, a function a document
// names is renamed, a test stops naming what a document says it exercises, an accepted output is removed. All drifts
// are applied together and committed, the checkout is analysed cold, and every entry a drift should cause must be
// reported and must not be reported before it. Stability: a change to a file no entry names must leave every entry and
// its anchor as they were. Recall and stability go to the job summary; the checkout is reset to its commit afterwards.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

interface Edit {
  /** delete removes the file; replace swaps every occurrence of `from` in it for `to`, and must find one. */
  op: "delete" | "replace";
  path: string;
  from?: string;
  to?: string;
}
interface Expect {
  outcome: string;
  kind: string;
  subject: string;
  detailIncludes?: string[];
}
interface Drift {
  id: string;
  what: string;
  edits: Edit[];
  expect: Expect;
}
interface Drifts {
  schema: "csh-drifts/v1";
  subject: { repo: string; commit: string };
  drifts: Drift[];
  /** A file no entry names, changed by a trailing line, for the stability check. */
  stable: string;
}
interface Entry {
  outcome: string;
  kind: string;
  subject: string;
  detail?: string;
  anchor?: string;
}

const [dir, file] = process.argv.slice(2);
if (dir === undefined || file === undefined) {
  console.error("usage: node evaluation/drift.ts <checkout> <drifts.json>");
  process.exit(2);
}
const checkout = resolve(dir);
const spec = JSON.parse(readFileSync(file, "utf8")) as Drifts;
const cli = resolve(import.meta.dirname, "../packages/cli/bin/csh.js");
const git = (...args: string[]) => execFileSync("git", ["-C", checkout, ...args], { encoding: "utf8" }).trim();
const head = git("rev-parse", "HEAD");
if (head !== spec.subject.commit) {
  console.error(`drift: the drifts are written for ${spec.subject.commit}, and the checkout is at ${head}`);
  process.exit(2);
}
// The checkout is committed to and reset, so local changes would be lost: it must be clean.
if (git("status", "--porcelain", "--untracked-files=all") !== "") {
  console.error(`drift: ${checkout} has local changes or untracked files, which the drifts would commit and the reset would remove`);
  process.exit(2);
}

const analyse = (name: string): Entry[] => {
  const out = execFileSync("node", [cli, "analyse", checkout, "--out", resolve(`reports/drift-${name}`), "--json"], { encoding: "utf8", maxBuffer: 1 << 30 });
  return (JSON.parse(out) as { overview: { entries: Entry[] } }).overview.entries;
};
const commit = (message: string) => {
  git("add", "-A");
  execFileSync("git", ["-C", checkout, "-c", "user.name=csh drift", "-c", "user.email=drift@csh.invalid", "commit", "-q", "--no-verify", "-m", message]);
};
const reset = () => {
  git("reset", "-q", "--hard", head);
  git("clean", "-qfd");
};
const meets = (e: Entry, x: Expect) => e.outcome === x.outcome && e.kind === x.kind && e.subject === x.subject && (x.detailIncludes ?? []).every((d) => (e.detail ?? "").includes(d));
const key = (e: Entry) => `${e.outcome}\u0000${e.kind}\u0000${e.subject}`;

const lines: string[] = [];
let failed = false;
try {
  const before = analyse("before");

  // Recall: every drift at once, each in files of its own.
  const problems: string[] = [];
  for (const d of spec.drifts) {
    if (before.some((e) => meets(e, d.expect))) problems.push(`${d.id}: reported before the drift, so it measures nothing`);
    for (const e of d.edits) {
      const p = join(checkout, e.path);
      if (!existsSync(p)) problems.push(`${d.id}: ${e.path} does not exist`);
      else if (e.op === "delete") rmSync(p);
      else {
        const text = readFileSync(p, "utf8");
        if (e.from === undefined || !text.includes(e.from)) problems.push(`${d.id}: ${e.path} does not hold ${JSON.stringify(e.from)}`);
        else writeFileSync(p, text.split(e.from).join(e.to ?? ""));
      }
    }
  }
  if (problems.length > 0) throw new Error(problems.join("\n"));
  commit("seeded drift");
  const after = analyse("after");
  const found = spec.drifts.filter((d) => after.some((e) => meets(e, d.expect)));
  lines.push(`Recall: ${found.length} of ${spec.drifts.length} seeded drifts reported`);
  for (const d of spec.drifts) lines.push(`  ${found.includes(d) ? "found " : "MISSED"}  ${d.id}: ${d.what}`);
  if (found.length < spec.drifts.length) failed = true;

  // Stability: an unrelated change leaves every entry, and its anchor, as it was.
  reset();
  if (before.some((e) => (e.detail ?? "").includes(spec.stable) || e.subject.includes(spec.stable))) throw new Error(`${spec.stable} is named by an entry, so it cannot test stability`);
  appendFileSync(join(checkout, spec.stable), "\n");
  commit("unrelated change");
  // Entries are compared as a multiset of key and anchor, since a subject may be reported more than once.
  const again = new Map<string, number>();
  const anchored = (e: Entry) => `${key(e)}\u0000${e.anchor}`;
  for (const e of analyse("stable")) again.set(anchored(e), (again.get(anchored(e)) ?? 0) + 1);
  const moved: string[] = [];
  for (const e of before) {
    const n = again.get(anchored(e)) ?? 0;
    if (n === 0) moved.push(`${e.kind} ${e.subject}`);
    else again.set(anchored(e), n - 1);
  }
  const added = [...again.values()].reduce((a, n) => a + n, 0);
  lines.push(`Stability: ${before.length - moved.length} of ${before.length} entries keep their anchor after a change to ${spec.stable}${added !== 0 ? `; ${added} entries new or re-anchored` : ""}`);
  for (const m of moved) lines.push(`  moved or gone: ${m}`);
  if (moved.length > 0 || added !== 0) failed = true;
} catch (err) {
  lines.push(`drift: ${(err as Error).message}`);
  failed = true;
} finally {
  reset();
}
const text = `${lines.join("\n")}\n`;
process.stdout.write(text);
if (process.env.GITHUB_STEP_SUMMARY !== undefined) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n\`\`\`\n${text}\`\`\`\n`);
process.exit(failed ? 1 : 0);
