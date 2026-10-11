// Tracing items through their edges (Ingesting a codebase, stage 22): each edge an inventory adapter read is resolved
// against every item of every source, or against the files the repository tracks. What does not resolve, and what
// nothing verifies, is a gap. Nothing here judges whether an edge is right: a document that says it implements a
// requirement is taken at its word, and only a reference to nothing is reported.
import { compareCodePoints } from "@csh/kernel";
import type { ItemEdge } from "@csh/witness";
import type { Prepared } from "./pool.ts";
import type { Gap, Report } from "./types.ts";

export interface TraceInput {
  prepared: Prepared;
  /** The files the repository tracks at the evaluated commit, relative to its root; undefined when not known. */
  files?: string[];
}

export interface TraceResult {
  gaps: Gap[];
  edges: NonNullable<Report["edges"]>;
}

const VERIFYING = new Set(["requirement"]);

export function trace(input: TraceInput): TraceResult {
  const { items, edges } = input.prepared;
  const gaps: Gap[] = [];
  const out: TraceResult["edges"] = [];
  const sources = new Set(items.map((i) => i.source));
  const byQualified = new Map(items.map((i) => [`${i.source}/${i.id}`, i]));
  const byId = new Map<string, string[]>();
  for (const i of items) byId.set(i.id, [...(byId.get(i.id) ?? []), `${i.source}/${i.id}`]);
  const files = input.files === undefined ? undefined : new Set(input.files);
  // A path counts as one of the repository's only when its first segment is a top-level entry of it (A-96): prose
  // writes application/json and CJS/ESM in backticks too.
  const top = new Set((input.files ?? []).map((f) => f.split("/")[0]!));
  const dirs = new Set((input.files ?? []).flatMap((f) => f.split("/").slice(0, -1).map((_, n, parts) => parts.slice(0, n + 1).join("/"))));

  /** The item an edge names, as Source/id, preferring the edge's own source; "file" for a tracked path; undefined
   * when it names nothing; null when it cannot be checked (a mechanism in prose, a path outside the repository's
   * top-level entries, or a file edge when the tracked files are unknown). */
  const resolve = (source: string, e: ItemEdge): string | undefined | null => {
    if (e.to.startsWith("text:")) return null;
    if (e.to.startsWith("file:")) {
      if (files === undefined) return null;
      const p = e.to.slice(5).replace(/\/$/, "");
      if (!top.has(p.split("/")[0]!)) return null;
      return files.has(p) || dirs.has(p) ? "file" : undefined;
    }
    const head = e.to.split("/")[0]!;
    if (sources.has(head) && byQualified.has(e.to)) return e.to;
    if (byQualified.has(`${source}/${e.to}`)) return `${source}/${e.to}`;
    const any = byId.get(e.to);
    return any !== undefined ? [...any].sort(compareCodePoints)[0] : undefined;
  };

  const incoming = new Map<string, Set<string>>();
  const verifiedBy = new Set<string>();
  const dangling = new Map<string, string[]>();
  for (const e of edges) {
    const r = resolve(e.source, e);
    const from = `${e.source}/${e.from}`;
    const row: TraceResult["edges"][number] = { source: e.source, from: e.from, rel: e.rel, to: e.to, span: e.span };
    if (r !== undefined && r !== null && r !== "file") row.target = r;
    if (r === undefined && e.rel !== "mentions") {
      row.dangling = true;
      dangling.set(from, [...(dangling.get(from) ?? []), `${e.span} ${e.rel} ${e.to.startsWith("file:") ? e.to.slice(5) : e.to}`]);
    }
    out.push(row);
    if (e.rel === "verified-by") verifiedBy.add(from);
    if (typeof r === "string" && r !== "file") {
      const set = incoming.get(r) ?? new Set<string>();
      set.add(e.rel);
      incoming.set(r, set);
    }
  }
  for (const [subject, refs] of dangling) {
    gaps.push({ kind: "dangling-reference", subject, fragments: [], detail: `names what does not exist: ${refs.join("; ")}` });
  }
  for (const it of items) {
    const q = `${it.source}/${it.id}`;
    const into = incoming.get(q) ?? new Set<string>();
    if (it.kind !== undefined && VERIFYING.has(it.kind) && !verifiedBy.has(q) && !into.has("cites")) {
      const status = it.attrs?.status !== undefined ? `; its stated status is ${it.attrs.status}` : "";
      gaps.push({ kind: "unverified", subject: q, fragments: [], detail: `${it.span}: names no mechanism that verifies it, and no test cites it${status}` });
    } else if (it.kind === "rule" && !into.has("exemplifies")) {
      gaps.push({ kind: "unverified", subject: q, fragments: [], detail: `${it.span}: no scenario sits under this rule` });
    }
  }
  return { gaps, edges: out };
}
