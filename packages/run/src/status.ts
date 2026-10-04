// csh status (Next layers, section 3.2): what is and is not protected, for one component. It reads only: the manifest,
// the specification as emitted, the sources' identified items, the ledger and maintainers history, the configuration and
// the stored gate decision. It writes nothing, and it never says more than the repository shows: branch protection,
// who may edit the workflows and the pinned variable itself are settings of the hosting service, which it cannot see.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TOOL_VERSION } from "@csh/check";
import { type GateDecision, snapshotDigest } from "@csh/gate";
import { digestOf, fragmentsOf } from "@csh/kernel";
import { type AuthorityInfo, type LedgerState, MAINTAINERS_PATH, resolveAuthority } from "@csh/ledger";
import type { SolverPort } from "@csh/solver";
import { emitProject, emissionProblem } from "./evaluate.ts";
import { sourceSettings } from "./pipeline.ts";
import { ledgerOf, type Project, snapshotOf, specOf } from "./project.ts";
import { GATE_PATH } from "./run.ts";
import { runSources } from "./sources.ts";

/** Why a component is not protected. Every reason is a fact the repository shows. */
export type UnprotectedReason = "no-component" | "no-maintainers" | "root-not-pinned" | "pinned-root-unusable" | "nothing-approved" | "advisory";

export interface ComponentStatus {
  schema: "csh-status/v1";
  component: string;
  /**
   * Where the root of trust comes from: pinned by CSH_ROOT_COMMIT outside the repository, taken from history (the first
   * commit that added the maintainers file, A-28), or none, when no maintainers file was ever committed.
   */
  root: { kind: "pinned" | "history" | "none"; commit?: string; problem?: string };
  /** The maintainers file in force at the head of history, as the ledger reads it. */
  maintainers: { name: string; kind: "person" | "agent"; roles: string[]; keys: number }[];
  /** The specification's own fragments by authority; lifted claims are left out, since nobody approves them. */
  fragments: { total: number; approved: number; selfApproved: number; candidate: number; retired: number };
  /**
   * The obligations among them (invariants, requirements, architecture and temporal rules), which are what a gate can
   * block on. An approved binding alone protects nothing, so nothing-approved counts these.
   */
  obligations: { total: number; approved: number };
  /** Each A3's judgments, by slug, with the authority of their digest. */
  a3: { slug: string; authority: string; selfApproved: boolean }[];
  ledger: { head: number; invalid: { seq: number; reason: string }[] };
  /** The gate mode of csh/config.json, advisory when it names none. */
  mode: "advisory" | "enforcing";
  /** The stored decision, reports/csh-gate.json: for the current snapshot, for another one, or none. */
  decision: { state: "current" | "out-of-date" | "none"; snapshotDigest?: string; overall?: string; mode?: string };
  /** The current snapshot's digest, as csh run and csh gate compute it. */
  snapshotDigest: string;
  protection: "protected" | "unprotected";
  reasons: UnprotectedReason[];
  /** What a reader might take for protection that the harness cannot see. Always present. */
  unseen: string[];
}

export const UNSEEN = [
  "branch protection on the default branch",
  "who may change .github/workflows, and so remove the gate job",
  "the CSH_ROOT_COMMIT variable itself, which is a setting of the hosting service",
];

const OBLIGATION_KINDS = new Set(["invariant", "requirement", "architecture", "temporal"]);

export type StatusResult = { ok: true; status: ComponentStatus } | { ok: false; message: string };

/** The A3 slugs of a component: the directories under csh/a3 that hold a judgments file. */
function a3Judgments(root: string): { slug: string; digest: string }[] {
  const dir = join(root, "csh", "a3");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((d) => existsSync(join(dir, d, "judgments.json")))
    .sort()
    .map((slug) => ({ slug, digest: digestOf(readFileSync(join(dir, slug, "judgments.json"))) }));
}

function rootOf(p: Project): ComponentStatus["root"] {
  const pinned = process.env.CSH_ROOT_COMMIT;
  const vcs = p.vcs;
  if (pinned !== undefined && pinned !== "") {
    if (vcs === undefined) return { kind: "pinned", commit: pinned, problem: "the component is not in a git repository" };
    if (vcs.fileAt(pinned, MAINTAINERS_PATH) === undefined) return { kind: "pinned", commit: pinned, problem: `${pinned} is not a commit of this repository that holds ${MAINTAINERS_PATH}` };
    return { kind: "pinned", commit: pinned };
  }
  const first = vcs?.commitsTouching(MAINTAINERS_PATH)[0];
  return first === undefined ? { kind: "none" } : { kind: "history", commit: first };
}

/** The decision stored for the component, judged against the current snapshot. */
function decisionOf(root: string, current: string): ComponentStatus["decision"] {
  const file = join(root, GATE_PATH);
  if (!existsSync(file)) return { state: "none" };
  let d: Partial<GateDecision>;
  try {
    d = JSON.parse(readFileSync(file, "utf8")) as Partial<GateDecision>;
  } catch {
    return { state: "out-of-date" };
  }
  const out: ComponentStatus["decision"] = { state: d.snapshotDigest === current ? "current" : "out-of-date" };
  if (typeof d.snapshotDigest === "string") out.snapshotDigest = d.snapshotDigest;
  if (typeof d.overall === "string") out.overall = d.overall;
  if (typeof d.mode === "string") out.mode = d.mode;
  return out;
}

/** The status of the project's component. Reads only. */
export async function componentStatus(p: Project, solver: SolverPort): Promise<StatusResult> {
  if (p.component === undefined) {
    const why = p.componentProblems.length > 0 ? `the component manifest cannot be used:\n${p.componentProblems.map((e) => `  ${e.code}: ${e.detail}`).join("\n")}` : `no csh/component.json under ${p.root}`;
    return { ok: false, message: why };
  }
  const emission = await emitProject(p, { solver });
  const refused = emissionProblem(emission);
  if (refused !== undefined || !emission.emitted.ok) return { ok: false, message: refused ?? "emission failed" };
  const { module, digest } = emission.emitted;
  const ledger: LedgerState | undefined = await ledgerOf(p, specOf(p, undefined));
  // The items the sources identify, so that an approval whose cited sentence changed counts as candidate, as in a run.
  const perSource = sourceSettings(p.component);
  const runs = await runSources(module, { root: p.root, ...(perSource !== undefined ? { perSource } : {}) });
  const items = new Map<string, string>();
  for (const r of runs) for (const it of r.output.items ?? []) items.set(`${r.source}/${it.id}`, it.textDigest);
  const authorityOf = (f: { name: string; digest: string; cites: { source: string; id: string }[] }): AuthorityInfo => (ledger === undefined ? { authority: "candidate" } : resolveAuthority(ledger, f, items));
  const fragments = { total: 0, approved: 0, selfApproved: 0, candidate: 0, retired: 0 };
  const obligations = { total: 0, approved: 0 };
  for (const f of fragmentsOf(module)) {
    const a = authorityOf(f);
    fragments.total += 1;
    fragments[a.authority] += 1;
    if (OBLIGATION_KINDS.has(f.kind)) {
      obligations.total += 1;
      if (a.authority === "approved") obligations.approved += 1;
    }
    if (a.authority === "approved" && a.selfApproved === true) fragments.selfApproved += 1;
  }
  const name = p.component.manifest.name;
  const a3 = a3Judgments(p.root).map(({ slug, digest: d }) => {
    const a = authorityOf({ name: `${name}/#a3/${slug}`, digest: d, cites: [] });
    return { slug, authority: a.authority, selfApproved: a.selfApproved === true };
  });
  const current = snapshotDigest(snapshotOf(p, digest, ledger, solver.id, TOOL_VERSION));
  const root = rootOf(p);
  const maintainers = (ledger?.maintainers.identities ?? []).map((i) => ({ name: i.name, kind: i.kind, roles: [...i.roles], keys: i.keys.length }));
  const mode = p.config.mode ?? "advisory";
  const reasons: UnprotectedReason[] = [];
  if (maintainers.length === 0) reasons.push("no-maintainers");
  if (root.kind !== "pinned") reasons.push("root-not-pinned");
  else if (root.problem !== undefined) reasons.push("pinned-root-unusable");
  if (obligations.approved === 0) reasons.push("nothing-approved");
  if (mode !== "enforcing") reasons.push("advisory");
  const status: ComponentStatus = {
    schema: "csh-status/v1",
    component: name,
    root,
    maintainers,
    fragments,
    obligations,
    a3,
    ledger: { head: ledger?.head ?? 0, invalid: (ledger?.invalid ?? []).map((e) => ({ seq: e.seq, reason: e.reason })) },
    mode,
    decision: decisionOf(p.root, current),
    snapshotDigest: current,
    protection: reasons.length === 0 ? "protected" : "unprotected",
    reasons,
    unseen: [...UNSEEN],
  };
  return { ok: true, status };
}

const REASON_TEXT: Record<UnprotectedReason, string> = {
  "no-component": "no component",
  "no-maintainers": "no maintainers file",
  "root-not-pinned": "the root of trust is not pinned (CSH_ROOT_COMMIT is not set)",
  "pinned-root-unusable": "the pinned root cannot be used",
  "nothing-approved": "no obligation is approved",
  advisory: "the gate is advisory",
};

const n = (k: number, word: string) => `${k} ${word}${k === 1 ? "" : "s"}`;

/** The status as csh status prints it: one line per question, the answer first. */
export function renderStatus(s: ComponentStatus, where: string): string {
  const lines = [`status ${s.component}${where === "" ? "" : ` (${where})`}`];
  lines.push(`  protection   ${s.protection}${s.reasons.length > 0 ? `: ${s.reasons.map((r) => REASON_TEXT[r]).join("; ")}` : ""}`);
  const root = s.root.kind === "pinned" ? `pinned by CSH_ROOT_COMMIT at ${s.root.commit}${s.root.problem !== undefined ? `, which cannot be used: ${s.root.problem}` : ""}` : s.root.kind === "history" ? `taken from history, the first commit that added ${MAINTAINERS_PATH}: ${s.root.commit} (not pinned)` : `none: no ${MAINTAINERS_PATH} was ever committed`;
  lines.push(`  root         ${root}`);
  lines.push(`  maintainers  ${s.maintainers.length === 0 ? "none" : s.maintainers.map((m) => `${m.name} (${m.kind}; ${m.roles.join(", ") || "no roles"}; ${n(m.keys, "key")})`).join(", ")}`);
  const f = s.fragments;
  lines.push(`  fragments    ${f.approved} approved${f.approved > 0 ? ` (${f.selfApproved} self-approved)` : ""}, ${f.candidate} candidate, ${f.retired} retired, of ${f.total}; ${s.obligations.approved} of ${n(s.obligations.total, "obligation")} approved`);
  if (s.a3.length > 0) lines.push(`  A3           ${s.a3.map((x) => `${x.slug}: ${x.authority}${x.selfApproved ? " (self-approved)" : ""}`).join(", ")}`);
  lines.push(`  ledger       ${s.ledger.head === 0 ? "no valid entries" : `head ${s.ledger.head}`}${s.ledger.invalid.length > 0 ? `; invalid: ${s.ledger.invalid.map((e) => `seq ${e.seq} (${e.reason})`).join(", ")}` : ""}`);
  lines.push(`  gate mode    ${s.mode}`);
  const d = s.decision;
  lines.push(`  decision     ${d.state === "none" ? `none stored in ${GATE_PATH}` : d.state === "current" ? `current: ${d.overall ?? "?"} (${d.mode ?? "?"})` : `out of date: ${GATE_PATH} is for snapshot ${d.snapshotDigest ?? "unknown"}, not the current ${s.snapshotDigest}`}`);
  lines.push(`  not seen     ${s.unseen.join("; ")}`);
  return `${lines.join("\n")}\n`;
}
