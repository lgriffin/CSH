// Signals: every item of a report that a reader may have to place, with the fields a rule matches on (Anchor,
// harnesses and A3, section 5.3). The A3 and any later consumer read this one definition.
import { compareCodePoints, digestJson } from "@csh/kernel";
import type { Report } from "./types.ts";

export interface Signal {
  /** Stable across runs: the kind plus the sorted members (and the subject, for a gap). A finding keeps its own id. */
  id: string;
  /** A finding kind, a gap kind, an error code, "not-comparable" or "violated". */
  kind: string;
  /** Qualified names involved, sorted. */
  fragments: string[];
  /** Source names involved, sorted. */
  sources: string[];
  /** Practice ids, through the manifest, sorted. */
  practices: string[];
  /** For gaps: the term, item or obligation. */
  subject?: string;
  detail?: string;
}

export interface Match {
  kind: string;
  /** Exact qualified name, or its last segment. */
  fragment?: string;
  source?: string;
  practice?: string;
  subject?: string;
  not?: Match;
}

/** What signalsOf needs of a component manifest: the practice that owns each source. */
export interface PracticeMap {
  sources: Record<string, string>;
}

const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort(compareCodePoints);
const idOf = (kind: string, fragments: string[], subject?: string) =>
  digestJson({ kind, members: fragments, ...(subject !== undefined ? { subject } : {}) }).slice("sha256:".length, "sha256:".length + 16);

/**
 * Every signal of one report: findings, not comparable, errors and warnings, gaps, and violated rules, in order of
 * kind then id. The practice of each source comes from the manifest when given, else from the report's component.
 */
export function signalsOf(report: Report, manifest?: PracticeMap): Signal[] {
  const practiceOf = manifest?.sources ?? report.component?.sources ?? {};
  // The source of each fragment the report names; a fragment named nowhere else falls back to its @Source segment.
  const sourceOf = new Map<string, string>();
  for (const f of report.findings ?? []) for (const m of f.members) sourceOf.set(m.fragment, m.source);
  for (const a of report.assessments ?? []) sourceOf.set(a.fragment, a.source);
  for (const n of report.notComparable ?? []) sourceOf.set(n.fragment, n.source);
  const srcOf = (fragment: string): string[] => {
    const known = sourceOf.get(fragment);
    if (known !== undefined) return [known];
    const seg = fragment.split("/").find((s) => s.startsWith("@"));
    return seg === undefined ? [] : [seg.slice(1)];
  };
  const make = (kind: string, fragments: string[], sources: string[], extra: { id?: string; subject?: string | undefined; detail?: string | undefined }): Signal => {
    const fs = sorted(fragments);
    const ss = sorted([...sources, ...fs.flatMap(srcOf)]);
    return {
      id: extra.id ?? idOf(kind, fs, extra.subject),
      kind,
      fragments: fs,
      sources: ss,
      practices: sorted(ss.flatMap((s) => (practiceOf[s] !== undefined ? [practiceOf[s]!] : []))),
      ...(extra.subject !== undefined ? { subject: extra.subject } : {}),
      ...(extra.detail !== undefined ? { detail: extra.detail } : {}),
    };
  };
  const out: Signal[] = [];
  for (const f of report.findings ?? []) {
    const detail = [f.query, f.inputs !== undefined ? `inputs ${f.inputs}` : undefined].filter((x) => x !== undefined).join("; ");
    out.push(make(f.kind, f.members.map((m) => m.fragment), f.members.map((m) => m.source), { id: f.id, detail }));
  }
  for (const n of report.notComparable ?? []) out.push(make("not-comparable", [n.fragment], [n.source], { detail: n.reason }));
  for (const e of report.errors ?? []) out.push(make(e.code, e.fragment !== undefined ? [e.fragment] : [], e.source !== undefined ? [e.source] : [], { subject: e.span, detail: e.detail }));
  for (const g of report.gapView?.gaps ?? []) out.push(make(g.kind, g.fragments ?? [], [], { subject: g.subject, detail: g.detail }));
  for (const a of report.assessments ?? []) if (a.verdict === "violated") out.push(make("violated", [a.fragment], [a.source], { detail: a.authority }));
  return out.sort((a, b) => compareCodePoints(a.kind, b.kind) || compareCodePoints(a.id, b.id));
}

const last = (name: string) => name.split("/").pop() ?? name;

/** True when the signal satisfies every field the rule sets, and not its `not` rule. */
export function matches(s: Signal, m: Match): boolean {
  if (s.kind !== m.kind) return false;
  if (m.fragment !== undefined && !s.fragments.some((f) => f === m.fragment || last(f) === m.fragment)) return false;
  if (m.source !== undefined && !s.sources.includes(m.source)) return false;
  if (m.practice !== undefined && !s.practices.includes(m.practice)) return false;
  if (m.subject !== undefined && s.subject !== m.subject && (s.subject === undefined || last(s.subject) !== m.subject)) return false;
  if (m.not !== undefined && matches(s, m.not)) return false;
  return true;
}
