// csh queue (Next layers, section 6.4): what awaits the owner's decision. Candidate fragments, unapproved bindings and
// unapproved A3 judgments, each with who wrote it (6.5), how long it has waited, and what approving it would unlock;
// ordered by what it unlocks, then by age, then by name. Past the configured limit it warns that scope should narrow:
// the formal specification's rule that review queues are bounded. It reads only.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compareCodePoints, digestOf, fragmentsOf } from "@csh/kernel";
import { type AuthoredBy, authoredByOf, type Provenance, resolveAuthority } from "@csh/ledger";
import type { SolverPort } from "@csh/solver";
import { evaluateProject } from "./evaluate.ts";
import { fileProvenance, fragmentProvenance, type Project, specOf } from "./project.ts";

export const DEFAULT_QUEUE_LIMIT = 20;

export interface QueueEntry {
  /** The qualified name a decision names: a rule, a binding (`#binding/...`) or an A3's judgments (`#a3/<slug>`). */
  fragment: string;
  kind: "rule" | "binding" | "a3" | "other";
  authoredBy: AuthoredBy;
  /** Whole days from the commit that last changed it to the head commit; absent when history cannot say. */
  waitedDays?: number;
  /** The commit that last changed it, when history can say. */
  since?: string;
  /** The obligations whose verdict approving it would let count: a rule its own, a binding every rule it holds back. */
  unlocks: string[];
}

export interface Queue {
  schema: "csh-queue/v1";
  component: string;
  limit: number;
  entries: QueueEntry[];
  /** Set when the queue is longer than its limit. */
  warning?: string;
}

export type QueueResult = { ok: true; queue: Queue } | { ok: false; message: string };

const DAY = 24 * 60 * 60 * 1000;

/** The terms an obligation's verdict waits on, from its reasons ("binding-not-approved: A.b, C.d"). */
function heldBackBy(reasons: string[]): string[] {
  return reasons.flatMap((r) => (r.startsWith("binding-not-approved: ") ? r.slice("binding-not-approved: ".length).split(", ") : []));
}

export async function componentQueue(p: Project, solver: SolverPort): Promise<QueueResult> {
  const e = await evaluateProject(p, { solver });
  if (!e.ok) return { ok: false, message: e.message };
  const name = p.component?.manifest.name ?? e.model.system;
  const items = new Map(e.report.items.map((i) => [`${i.source}/${i.id}`, i.textDigest]));
  const provenanceOf = await fragmentProvenance(p, specOf(p, undefined), { withoutMaintainers: true });
  const head = Date.parse(p.commitDate);
  const assessed = new Map((e.report.assessments ?? []).map((a) => [a.fragment, a]));
  const entry = (fragment: string, kind: QueueEntry["kind"], prov: Provenance | undefined, unlocks: string[]): QueueEntry => {
    const out: QueueEntry = { fragment, kind, authoredBy: authoredByOf(prov), unlocks };
    if (prov !== undefined) {
      out.since = prov.commit;
      if (!Number.isNaN(head)) out.waitedDays = Math.max(0, Math.floor((head - Date.parse(prov.date)) / DAY));
    }
    return out;
  };
  const entries: QueueEntry[] = [];
  // The specification's own fragments: a claim lifted from a source (Shop/@Requirements/...) is never approved.
  for (const f of fragmentsOf(e.model).filter((x) => !x.name.split("/").some((seg) => seg.startsWith("@")))) {
    const authority = e.ledger === undefined ? "candidate" : resolveAuthority(e.ledger, f, items).authority;
    if (authority !== "candidate") continue;
    const prov = provenanceOf?.(f.name, f.digest);
    if (f.kind === "binding") {
      const term = f.name.slice(f.name.indexOf("#binding/") + "#binding/".length);
      const unlocks = [...assessed.values()].filter((a) => heldBackBy(a.reasons).includes(term)).map((a) => a.fragment);
      entries.push(entry(f.name, "binding", prov, unlocks.sort(compareCodePoints)));
    } else if (assessed.has(f.name)) entries.push(entry(f.name, "rule", prov, [f.name]));
    else entries.push(entry(f.name, "other", prov, []));
  }
  const a3Dir = join(p.root, "csh", "a3");
  for (const slug of existsSync(a3Dir) ? readdirSync(a3Dir).sort(compareCodePoints) : []) {
    const file = join(a3Dir, slug, "judgments.json");
    if (!existsSync(file)) continue;
    const fragment = `${name}/#a3/${slug}`;
    const authority = e.ledger === undefined ? "candidate" : resolveAuthority(e.ledger, { name: fragment, digest: digestOf(readFileSync(file)), cites: [] }).authority;
    if (authority === "candidate") entries.push(entry(fragment, "a3", fileProvenance(p, `csh/a3/${slug}/judgments.json`), []));
  }
  entries.sort((a, b) => b.unlocks.length - a.unlocks.length || (b.waitedDays ?? -1) - (a.waitedDays ?? -1) || compareCodePoints(a.fragment, b.fragment));
  const limit = p.config.queueLimit ?? DEFAULT_QUEUE_LIMIT;
  const queue: Queue = { schema: "csh-queue/v1", component: name, limit, entries };
  if (entries.length > limit) queue.warning = `the queue holds ${entries.length} decisions, more than its limit of ${limit}: narrow the scope of the work before adding to it`;
  return { ok: true, queue };
}

/** The queue as csh queue prints it: one line per entry, in order. */
export function renderQueue(q: Queue): string {
  const lines = [`queue ${q.component}: ${q.entries.length} awaiting a decision (limit ${q.limit})`];
  for (const x of q.entries) {
    const waited = x.waitedDays === undefined ? "age unknown" : `waited ${x.waitedDays} day${x.waitedDays === 1 ? "" : "s"}`;
    lines.push(`  ${x.fragment}  [${x.kind}; authored by ${x.authoredBy}; ${waited}]  unlocks ${x.unlocks.length === 0 ? "nothing else" : x.unlocks.join(", ")}`);
  }
  if (q.warning !== undefined) lines.push(`warning: ${q.warning}`);
  return `${lines.join("\n")}\n`;
}
