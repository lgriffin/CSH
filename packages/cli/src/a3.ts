// csh a3 open | stage | build | verify (Anchor, harnesses and A3, sections 5.6 to 5.8). The A3 package builds the
// sheet from its two inputs; this module finds those inputs: stage records from stored runs, authority from the
// ledger, and file contents at a stage's commit from git.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { A3_DIR, a3Dir, type Authority, buildA3, type Judgments, readJudgments, readStage, renderHtml, renderMarkdown, skeleton, SLUG, STAGE_FILES, stageDir, stageIntegrity, type StageRecord } from "@csh/a3";
import type { Mode } from "@csh/gate";
import { digestOf, stableJson } from "@csh/kernel";
import { authoredByOf, resolveAuthority } from "@csh/ledger";
import { fileProvenance, ledgerOf, type Project, type RunOptions, runAt, RUNS_DIR, specOf } from "@csh/run";
import type { Args } from "./args.ts";

export interface A3Io {
  out: (s: string) => void;
  err: (s: string) => void;
  runOptions: () => Promise<RunOptions>;
}

/** The ledger name of an A3's judgments: <component>/#a3/<slug>. */
export const a3Fragment = (component: string, slug: string) => `${component}/#a3/${slug}`;

/** Authority of the judgments: approved only when a valid ledger entry approves this digest (section 5.6). */
export async function a3Authority(p: Project, slug: string, digest: string): Promise<Authority> {
  const name = p.component?.manifest.name;
  if (name === undefined) return { authority: "candidate" };
  const ledger = await ledgerOf(p, specOf(p, undefined));
  if (ledger === undefined) return { authority: "candidate" };
  const a = resolveAuthority(ledger, { name: a3Fragment(name, slug), digest, cites: [] });
  if (a.authority === "approved") return { authority: "approved", selfApproved: a.selfApproved === true, ...(a.needsReview === true ? { needsReview: true } : {}) };
  return a.reason !== undefined ? { authority: "candidate", reason: a.reason } : { authority: "candidate" };
}

const MODES: readonly string[] = ["advisory", "enforcing"];

const git = (p: Project, ...args: string[]) => execFileSync("git", args, { cwd: p.root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

/**
 * The stored run of a commit, in the mode asked for when one is, if csh run has made one; the newest by modification
 * when there are several.
 * None while the working tree differs from HEAD in any way: a run names HEAD even when it read untracked files (A-54).
 */
function storedRun(p: Project, commit: string, mode: Mode | undefined): string | undefined {
  const runs = join(p.root, RUNS_DIR);
  if (!existsSync(runs)) return undefined;
  // The A3's own files are left out: no run reads them, and authoring one leaves them uncommitted.
  if (commit === p.head && git(p, "status", "--porcelain", "--", ".", `:(exclude)${A3_DIR}`) !== "") return undefined;
  const found: { dir: string; at: number }[] = [];
  for (const d of readdirSync(runs)) {
    const dir = join(runs, d);
    const file = join(dir, "run.json");
    if (!existsSync(file) || !STAGE_FILES.every((f) => existsSync(join(dir, f)))) continue;
    // A stored run that cannot be read is skipped, never fatal: another can be copied, or the commit run again.
    let rec: { snapshot?: { commit?: string } };
    let gate: { mode?: string };
    try {
      rec = JSON.parse(readFileSync(file, "utf8"));
      if (rec.snapshot?.commit !== commit) continue;
      gate = JSON.parse(readFileSync(join(dir, "gate.json"), "utf8"));
    } catch {
      continue;
    }
    if (mode === undefined || gate.mode === mode) found.push({ dir, at: statSync(file).mtimeMs });
  }
  found.sort((a, b) => b.at - a.at);
  return found[0]?.dir;
}

function resolveCommit(p: Project, at: string): string | undefined {
  try {
    return git(p, "rev-parse", "--verify", `${at}^{commit}`);
  } catch {
    return undefined;
  }
}

/** Copy a commit's run record into the A3's stages, running the commit first when no run of it is stored. */
async function recordStage(p: Project, slug: string, id: string, at: string, io: A3Io, mode?: Mode): Promise<boolean> {
  const commit = resolveCommit(p, at);
  if (commit === undefined) {
    io.err(`csh a3: ${at} is not a commit of the repository at ${p.root}\n`);
    return false;
  }
  let from = storedRun(p, commit, mode);
  if (from === undefined) {
    const r = await runAt({ ...(await io.runOptions()), root: p.root, commit, ...(mode !== undefined ? { mode } : {}) });
    if (!r.ok) {
      io.err(`csh a3: no stored run of ${commit.slice(0, 12)}, and running it failed: ${r.code}: ${r.message}\n`);
      return false;
    }
    from = r.dir;
  }
  const to = stageDir(p.root, slug, id);
  mkdirSync(to, { recursive: true });
  for (const f of STAGE_FILES) copyFileSync(join(from, f), join(to, f));
  io.out(`stage ${id}: the run of ${commit.slice(0, 12)} recorded in ${to.slice(p.root.length + 1)}\n`);
  return true;
}

function writeJudgments(p: Project, slug: string, j: Judgments): void {
  writeFileSync(join(a3Dir(p.root, slug), "judgments.json"), `${JSON.stringify(j, null, 2)}\n`);
}

/** Build the three outputs of an A3 in memory. */
export async function buildOutputs(p: Project, slug: string, o: { authoredBy?: "person" | "agent" | "unknown" } = {}): Promise<{ files: Record<string, string>; problems: string[] } | { error: string }> {
  const read = readJudgments(p.root, slug);
  if (read === undefined) return { error: `no ${a3Dir(p.root, slug).slice(p.root.length + 1)}/judgments.json; csh a3 open ${slug} writes one` };
  if (read.problems.length > 0) return { error: `the judgments cannot be used:\n${read.problems.map((x) => `  ${x}`).join("\n")}` };
  const j = read.judgments;
  const stages: StageRecord[] = [];
  for (const s of j.stages) {
    const rec = readStage(stageDir(p.root, slug, s.id), s.id);
    if (rec !== undefined) stages.push(rec);
  }
  // A stage whose report or gate decision is not the file its run record names is refused, not read (section 5.7).
  const altered = stages.flatMap((rec) => {
    const own = stageIntegrity(rec);
    return own === undefined ? [] : [`${own.problem} ${rec.id}: ${own.detail}`];
  });
  if (altered.length > 0) return { error: `the stage records cannot be used:\n${altered.map((x) => `  ${x}`).join("\n")}` };
  const digest = digestOf(read.bytes);
  const vcs = p.vcs;
  const model = buildA3({
    slug,
    judgments: j,
    judgmentsDigest: digest,
    component: { name: p.component?.manifest.name ?? "", practices: p.component?.manifest.practices ?? [] },
    stages,
    authority: await a3Authority(p, slug, digest),
    authoredBy: o.authoredBy ?? authoredByOf(fileProvenance(p, `csh/a3/${slug}/judgments.json`)),
    readAt: (rec, file) => {
      if (vcs === undefined) return null;
      try {
        return vcs.fileAt(rec.run.snapshot.commit, file);
      } catch {
        return null;
      }
    },
  });
  return {
    files: { "a3.json": stableJson(model), "a3.md": renderMarkdown(model), "a3.html": renderHtml(model) },
    problems: model.problems.map((x) => `${x.kind}${x.stage !== undefined ? ` at ${x.stage}` : ""}: ${x.subject}`),
  };
}

export async function a3Command(p: Project, a: Args, io: A3Io): Promise<number> {
  const sub = a.positional.shift();
  const slug = a.positional.shift();
  const usage = "usage: csh a3 open <slug> | stage <slug> <id> --at <commit> | build <slug> [--check] | verify <slug>\n";
  if (sub === undefined || slug === undefined) {
    io.err(usage);
    return 2;
  }
  if (!SLUG.test(slug)) {
    io.err("csh a3: a slug is lower case letters, digits and hyphens\n");
    return 2;
  }
  if (p.component === undefined) {
    io.err("csh a3: an A3 is about a component, and there is no usable csh/component.json\n");
    return 1;
  }
  const mode = a.options.mode as Mode | undefined;
  if (mode !== undefined && !MODES.includes(mode)) {
    io.err("--mode is advisory or enforcing\n");
    return 2;
  }
  const dir = a3Dir(p.root, slug);
  switch (sub) {
    case "open": {
      if (existsSync(join(dir, "judgments.json"))) {
        io.err(`csh a3: ${dir.slice(p.root.length + 1)}/judgments.json exists; open never overwrites judgments\n`);
        return 2;
      }
      const id = a.options.stage ?? "first";
      if (!SLUG.test(id)) {
        io.err("csh a3: a stage id is lower case letters, digits and hyphens\n");
        return 2;
      }
      if (!(await recordStage(p, slug, id, a.options.at ?? "HEAD", io, mode))) return 1;
      writeJudgments(p, slug, skeleton(id, p.component.manifest.practices));
      return build(p, slug, false, io, `opened ${dir.slice(p.root.length + 1)}: every judged section is empty and every signal unclassified until a cause places it\n`);
    }
    case "stage": {
      const id = a.positional.shift();
      if (id === undefined || !SLUG.test(id) || a.options.at === undefined) {
        io.err(usage);
        return 2;
      }
      const read = readJudgments(p.root, slug);
      if (read === undefined || read.problems.length > 0) {
        io.err(`csh a3: no usable judgments for ${slug}; csh a3 open ${slug} writes them\n`);
        return 1;
      }
      if (!(await recordStage(p, slug, id, a.options.at, io, mode))) return 1;
      if (!read.judgments.stages.some((s) => s.id === id)) {
        read.judgments.stages.push({ id, name: "", what: "" });
        writeJudgments(p, slug, read.judgments);
        io.out(`added stage ${id} to the judgments, unnamed; editing the judgments returns the sheet to candidate\n`);
      }
      return 0;
    }
    case "build":
      return build(p, slug, a.flags.has("check"), io);
    case "verify":
      return verify(p, slug, io);
    default:
      io.err(usage);
      return 2;
  }
}

/**
 * The authoredBy the committed sheet records. A check compares with it rather than recomputing it, since the signer
 * is only known once the judgments are committed, and only where the signer's key is in the keyring (A-91).
 */
function recordedAuthoredBy(p: Project, slug: string): "person" | "agent" | "unknown" | undefined {
  try {
    const v = (JSON.parse(readFileSync(join(a3Dir(p.root, slug), "a3.json"), "utf8")) as { authoredBy?: unknown }).authoredBy;
    return v === "person" || v === "agent" || v === "unknown" ? v : undefined;
  } catch {
    return undefined;
  }
}

async function build(p: Project, slug: string, check: boolean, io: A3Io, lead = ""): Promise<number> {
  const recorded = check ? recordedAuthoredBy(p, slug) : undefined;
  const r = await buildOutputs(p, slug, recorded !== undefined ? { authoredBy: recorded } : {});
  if ("error" in r) {
    io.err(`csh a3: ${r.error}\n`);
    return 1;
  }
  const dir = a3Dir(p.root, slug);
  const rel = dir.slice(p.root.length + 1);
  if (check) {
    const stale = Object.entries(r.files).filter(([f, text]) => !existsSync(join(dir, f)) || readFileSync(join(dir, f), "utf8") !== text).map(([f]) => f);
    if (stale.length > 0) {
      io.err(`csh a3: ${stale.map((f) => `${rel}/${f}`).join(", ")} differ${stale.length === 1 ? "s" : ""} from the built sheet; run csh a3 build ${slug}\n`);
      return 1;
    }
    io.out(`${rel}: a3.json, a3.md and a3.html match the stage records and judgments\n`);
  } else {
    for (const [f, text] of Object.entries(r.files)) writeFileSync(join(dir, f), text);
    io.out(`${lead}wrote ${rel}/a3.json, a3.md and a3.html\n`);
  }
  io.out(r.problems.length === 0 ? "  no problems with the judgments\n" : `  ${r.problems.length} problem${r.problems.length === 1 ? "" : "s"} with the judgments:\n${r.problems.map((x) => `    ${x}`).join("\n")}\n`);
  return 0;
}

/** Re-run every stage at its commit and compare (section 5.7). Nothing that differs is hidden. */
async function verify(p: Project, slug: string, io: A3Io): Promise<number> {
  const read = readJudgments(p.root, slug);
  if (read === undefined || read.problems.length > 0) {
    io.err(`csh a3: no usable judgments for ${slug}\n`);
    return 1;
  }
  let bad = 0;
  for (const s of read.judgments.stages) {
    const rec = readStage(stageDir(p.root, slug, s.id), s.id);
    if (rec === undefined) {
      io.out(`  stage-unverifiable ${s.id}: no stage record\n`);
      bad++;
      continue;
    }
    const own = stageIntegrity(rec);
    if (own !== undefined) {
      io.out(`  ${own.problem} ${s.id}: ${own.detail}\n`);
      bad++;
      continue;
    }
    if (!MODES.includes(rec.gate.mode)) {
      io.out(`  stage-unverifiable ${s.id}: gate.json names mode ${JSON.stringify(rec.gate.mode)}, which is neither advisory nor enforcing\n`);
      bad++;
      continue;
    }
    const r = await runAt({ ...(await io.runOptions()), root: p.root, commit: rec.run.snapshot.commit, mode: rec.gate.mode as Mode });
    if (!r.ok) {
      io.out(`  stage-unverifiable ${s.id}: ${r.code}: ${r.message}\n`);
      bad++;
      continue;
    }
    const diffs = [
      r.record.snapshotDigest !== rec.run.snapshotDigest ? "snapshot" : "",
      r.record.reportDigest !== rec.run.reportDigest ? "report" : "",
      r.record.gateDigest !== rec.run.gateDigest ? "gate decision" : "",
    ].filter((x) => x !== "");
    if (diffs.length > 0) {
      io.out(`  stage-mismatch ${s.id}: the ${diffs.join(", ")} differ${diffs.length === 1 ? "s" : ""} from a fresh run at ${rec.run.snapshot.commit.slice(0, 12)}\n`);
      bad++;
    } else io.out(`  verified ${s.id}: a fresh run at ${rec.run.snapshot.commit.slice(0, 12)} gives the same snapshot, report and gate decision\n`);
  }
  return bad === 0 ? 0 : 1;
}
