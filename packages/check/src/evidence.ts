// Judging a witness against an obligation (Evidence tab, section 3) and the record of
// what each piece of evidence depended on (Authority tab, section 5).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  bindableTerms,
  canonicalJson,
  collectRefs,
  compareCodePoints,
  type EnumVal,
  EvalError,
  evaluateBool,
  type Expr,
  type ExprRefs,
  type Fragment,
  type Invariant,
  mapValuation,
  type Requirement,
  type Type,
  type Value,
  valueToString,
  type Vocabulary,
} from "@csh/kernel";
import { type Json, witnessDigest } from "@csh/witness";
import type { SourcedWitness } from "./pool.ts";
import type { EvidenceRecord } from "./types.ts";

/** The digests a piece of evidence depended on when it was first recorded. */
export interface EvidenceDeps {
  obligation: string;
  bindings: Record<string, string>;
  assumptions: Record<string, string>;
  subject: string;
  tool: string;
}

export interface EvidenceStore {
  get(key: string): EvidenceDeps | undefined;
  set(key: string, deps: EvidenceDeps): void;
  entries(): [string, EvidenceDeps][];
}

export class MemoryEvidenceStore implements EvidenceStore {
  private readonly m = new Map<string, EvidenceDeps>();
  constructor(entries: [string, EvidenceDeps][] = []) {
    for (const [k, v] of entries) this.m.set(k, v);
  }
  get(key: string): EvidenceDeps | undefined {
    return this.m.get(key);
  }
  set(key: string, deps: EvidenceDeps): void {
    this.m.set(key, deps);
  }
  entries(): [string, EvidenceDeps][] {
    return [...this.m.entries()].sort((a, b) => compareCodePoints(a[0], b[0]));
  }
  clone(): MemoryEvidenceStore {
    return new MemoryEvidenceStore(structuredClone(this.entries()));
  }
}

export function loadEvidenceStore(path: string): MemoryEvidenceStore {
  if (!existsSync(path)) return new MemoryEvidenceStore();
  const data = JSON.parse(readFileSync(path, "utf8")) as { schema: string; entries: Record<string, EvidenceDeps> };
  return new MemoryEvidenceStore(Object.entries(data.entries));
}

export function saveEvidenceStore(path: string, store: EvidenceStore): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${canonicalJson({ schema: "csh-evidence/v1", entries: Object.fromEntries(store.entries()) })}\n`);
}

export interface JudgeContext {
  vocabulary: Vocabulary;
  /** Binding fragments by term, with their authority. */
  bindings: Map<string, { fragment: Fragment; key: string; approved: boolean }>;
  /** Requirements in the pool by event, for the boundary condition. */
  requirementsOn: (event: string) => Requirement[];
  rejectsMock: boolean;
  /** The dependency digests as they stand now, for this obligation. */
  current: Omit<EvidenceDeps, "subject">;
  store: EvidenceStore;
  snapshotCommit?: string;
  /** True when `ancestor` is an ancestor of `commit` with no change to implementation paths. */
  unchangedSince?: (ancestor: string, commit: string) => boolean;
}

function exprsOf(o: Invariant | Requirement): Expr[] {
  if (o.kind === "invariant") return [o.body];
  return [...(o.while !== undefined ? [o.while] : []), ...(o.and !== undefined ? [o.and] : []), o.shall, ...o.ensures];
}

export function refsOfObligation(o: Invariant | Requirement): ExprRefs {
  const r = collectRefs(undefined);
  for (const e of exprsOf(o)) collectRefs(e, r);
  return r;
}

export function termsOfObligation(o: Invariant | Requirement): string[] {
  return bindableTerms(refsOfObligation(o));
}

type Lift = { ok: true; v: Value } | { ok: false; reason: string };

/** Type a witness value (Evidence tab, section 2, rules for values). */
export function witnessValue(v: Json | undefined, t: Type | undefined): Lift {
  if (t === undefined) return { ok: false, reason: "value-unmapped" };
  if (t.kind === "int") {
    if (typeof v === "number" && Number.isSafeInteger(v)) return { ok: true, v: BigInt(v) };
    if (typeof v === "string" && /^-?(0|[1-9][0-9]*)$/.test(v)) return { ok: true, v: BigInt(v) };
    return { ok: false, reason: "value-not-integer" };
  }
  if (t.kind === "bool") return typeof v === "boolean" ? { ok: true, v } : { ok: false, reason: "value-unmapped" };
  return typeof v === "string" ? { ok: true, v: { enum: t.enum, member: v } satisfies EnumVal } : { ok: false, reason: "value-unmapped" };
}

function enumOk(v: Value, vocab: Vocabulary): boolean {
  if (typeof v !== "object") return true;
  return vocab.enums.find((e) => e.name === v.enum)?.members.includes(v.member) ?? false;
}

/** Collect every value a set of references needs from a witness, through approved bindings. */
function valuesFor(w: SourcedWitness["witness"], refs: ExprRefs, ctx: JudgeContext, nowAt: ("pre" | "post")[]): { values: Map<string, Value> } | { reason: string; detail: string } {
  const values = new Map<string, Value>();
  const v = ctx.vocabulary;
  for (const f of refs.fields) {
    const b = ctx.bindings.get(`${f.state}.${f.field}`);
    if (b === undefined || !b.approved) return { reason: "binding-not-approved", detail: `${f.state}.${f.field}` };
    const t = v.states.find((s) => s.name === f.state)?.fields[f.field];
    const ats = f.at === "now" ? nowAt : [f.at];
    for (const at of ats) {
      const part = at === "pre" ? w.pre : w.post;
      if (!(b.key in part)) return { reason: "key-missing", detail: `${at}.${b.key}` };
      const lifted = witnessValue(part[b.key], t);
      if (!lifted.ok) return { reason: lifted.reason, detail: `${at}.${b.key}` };
      if (!enumOk(lifted.v, v)) return { reason: "value-unmapped", detail: `${at}.${b.key}` };
      values.set(`${f.state}.${f.field}@${at}`, lifted.v);
    }
  }
  for (const a of refs.args) {
    const b = ctx.bindings.get(`${a.event}.args.${a.name}`);
    if (b === undefined || !b.approved) return { reason: "binding-not-approved", detail: `${a.event}.args.${a.name}` };
    if (!(b.key in w.args)) return { reason: "key-missing", detail: `args.${b.key}` };
    const lifted = witnessValue(w.args[b.key], v.events.find((e) => e.name === a.event)?.args[a.name]);
    if (!lifted.ok) return { reason: lifted.reason, detail: `args.${b.key}` };
    values.set(`${a.event}.args.${a.name}`, lifted.v);
  }
  for (const ev of refs.results) {
    const b = ctx.bindings.get(`${ev}.result`);
    if (b === undefined || !b.approved) return { reason: "binding-not-approved", detail: `${ev}.result` };
    if (w.result === undefined) return { reason: "key-missing", detail: "result" };
    const lifted = witnessValue(w.result, v.events.find((e) => e.name === ev)?.returns);
    if (!lifted.ok) return { reason: lifted.reason, detail: "result" };
    if (!enumOk(lifted.v, v)) return { reason: "value-unmapped", detail: "result" };
    values.set(`${ev}.result`, lifted.v);
  }
  return { values };
}

function trueIn(e: Expr | undefined, values: Map<string, Value>): boolean {
  if (e === undefined) return true;
  try {
    return evaluateBool(e, mapValuation(values));
  } catch (err) {
    if (err instanceof EvalError) return false;
    throw err;
  }
}

function triggerTrue(r: Requirement, w: SourcedWitness["witness"], ctx: JudgeContext): boolean {
  const refs = collectRefs(undefined);
  if (r.while !== undefined) collectRefs(r.while, refs);
  if (r.and !== undefined) collectRefs(r.and, refs);
  const got = valuesFor(w, refs, ctx, ["pre"]);
  if (!("values" in got)) return false;
  return trueIn(r.while, got.values) && trueIn(r.and, got.values);
}

function staleReasons(stored: EvidenceDeps, ctx: JudgeContext): string[] {
  const out: string[] = [];
  const cur = ctx.current;
  if (stored.obligation !== cur.obligation) out.push("obligation-changed");
  if (canonicalJson(stored.bindings) !== canonicalJson(cur.bindings)) out.push("binding-changed");
  if (canonicalJson(stored.assumptions) !== canonicalJson(cur.assumptions)) out.push("assumption-changed");
  if (stored.tool !== cur.tool) out.push("tool-changed");
  if (ctx.snapshotCommit !== undefined && stored.subject !== ctx.snapshotCommit && !(ctx.unchangedSince?.(stored.subject, ctx.snapshotCommit) ?? false)) out.push("subject-changed");
  return out;
}

/**
 * Judge one witness against one obligation. Returns undefined when the witness is about
 * another event (event-mismatch): such a witness is simply not evidence for the obligation.
 */
export function judge(ob: Fragment, sw: SourcedWitness, ctx: JudgeContext): EvidenceRecord | undefined {
  const w = sw.witness;
  const node = ob.node as Invariant | Requirement;
  const state = node.kind === "invariant" ? node.state : ctx.vocabulary.events.find((e) => e.name === node.event)?.on;
  const ev = ctx.vocabulary.events.find((e) => e.name === w.event);
  // 1. Event.
  if (node.kind === "requirement" ? w.event !== node.event : ev?.on !== node.state) return undefined;
  const rec: EvidenceRecord = { witness: w.id, source: sw.source, applicability: "inapplicable" };
  if (sw.span !== undefined) rec.span = sw.span;
  // 2 and 3. Bindings and keys.
  const got = valuesFor(w, refsOfObligation(node), ctx, ["pre", "post"]);
  if (!("values" in got)) {
    rec.reason = `${got.reason}: ${got.detail}`;
    return rec;
  }
  // 4. Policy rejections.
  if (ctx.rejectsMock && state !== undefined && w.execution.mocked.includes(state)) {
    rec.reason = `evidence-rejected: ${state} is mocked`;
    return rec;
  }
  // 5. Freshness.
  const key = `${witnessDigest(w)}|${ob.name}`;
  let stored = ctx.store.get(key);
  if (stored === undefined) {
    stored = { ...ctx.current, subject: w.subject.commit };
    ctx.store.set(key, stored);
  }
  const stale = staleReasons(stored, ctx);
  rec.applicability = stale.length === 0 ? "current" : "stale";
  if (stale.length > 0) rec.reason = `stale: ${stale.join(", ")}`;
  // 6 and 7. Evaluate exactly.
  const values = got.values;
  rec.values = Object.fromEntries([...values.entries()].sort((a, b) => compareCodePoints(a[0], b[0])).map(([k, v]) => [k, valueToString(v)]));
  try {
    if (node.kind === "invariant") {
      const at = (phase: "pre" | "post") => {
        const m = new Map<string, Value>();
        for (const [k, v] of values) if (k.endsWith(`@${phase}`)) m.set(k.replace(/@(pre|post)$/, "@now"), v);
        return evaluateBool(node.body, mapValuation(m));
      };
      if (!at("pre")) rec.result = "precondition-not-met";
      else rec.result = at("post") ? "holds" : "violated";
    } else {
      const trig = trueIn(node.while, values) && trueIn(node.and, values);
      const ok = !trig || [node.shall, ...node.ensures].every((e) => evaluateBool(e, mapValuation(values)));
      rec.result = ok ? "holds" : "violated";
    }
  } catch (err) {
    rec.result = "not-evaluated";
    rec.applicability = "inapplicable";
    rec.reason = `evaluation-failed: ${(err as Error).message}`;
    return rec;
  }
  rec.boundary = ctx.requirementsOn(w.event).some((r) => triggerTrue(r, w, ctx));
  return rec;
}
