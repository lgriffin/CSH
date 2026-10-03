// Reference adapter A: witness files (Evidence tab, section 5; Anchor, harnesses and A3, sections 3.2 and 6.2).
// Each record becomes a witness; each passing record is also lifted as an example claim
// through the bindings read in reverse (key to term). A record with no outcome takes it from the execution line of its
// test, joined by test identity; without one, its outcome is unknown and it is never a claim.
import type { Binding, ClaimSet, EventDecl, Example, Expr, Type, Unliftable, Vocabulary } from "@csh/kernel";
import { type Adapter, type AdapterInput, type AdapterOutput, type Diagnostic, type Json, type LocalResult, outcomeOf, parseExecutions, parseWitnesses, type Witness } from "@csh/witness";

export const manifest = {
  id: "csh.adapter.witness-files",
  version: "0.1.0",
  ir: "csh-ir/v1",
  produces: ["claims", "witnesses"],
  inputKinds: ["Witnesses"],
} as const;

type Lift = { ok: true; value: Expr } | { ok: false; reason: string };

/** Type a witness value against a model type (Evidence tab, section 2, rules for values). */
export function liftValue(v: Json | undefined, t: Type): Lift {
  if (t.kind === "int") {
    let digits: string | undefined;
    if (typeof v === "number") digits = Number.isSafeInteger(v) ? String(v) : undefined;
    else if (typeof v === "string" && /^-?(0|[1-9][0-9]*)$/.test(v)) digits = v;
    if (digits === undefined) return { ok: false, reason: "value-not-integer" };
    return { ok: true, value: t.unit === undefined ? { k: "int", v: digits } : { k: "int", v: digits, unit: t.unit } };
  }
  if (t.kind === "bool") return typeof v === "boolean" ? { ok: true, value: { k: "bool", v } } : { ok: false, reason: "value-unmapped" };
  return typeof v === "string" ? { ok: true, value: { k: "enum", enum: t.enum, member: v } } : { ok: false, reason: "value-unmapped" };
}

/** A legal example name derived from a witness id: "w1" becomes "WitnessW1". */
export function exampleName(id: string): string {
  const parts = id.split(/[^A-Za-z0-9]+/).filter((p) => p !== "");
  return `Witness${parts.map((p) => p[0]!.toUpperCase() + p.slice(1)).join("")}`;
}

interface Reverse {
  term: Binding["target"];
  candidate: boolean;
}

function reverseBindings(input: AdapterInput, ev: EventDecl): { field: Map<string, Reverse & { field: string }>; arg: Map<string, Reverse & { name: string }> } {
  const field = new Map<string, Reverse & { field: string }>();
  const arg = new Map<string, Reverse & { name: string }>();
  for (const b of input.bindings) {
    const candidate = b.authority !== "approved";
    if (b.target.k === "field" && b.target.state === ev.on) field.set(b.key, { term: b.target, candidate, field: b.target.field });
    if (b.target.k === "arg" && b.target.event === ev.name) arg.set(b.key, { term: b.target, candidate, name: b.target.name });
  }
  return { field, arg };
}

function liftRecord(w: Witness, v: Vocabulary, input: AdapterInput): { example: Example; candidateBinding: boolean } | { reason: string } {
  const ev = v.events.find((e) => e.name === w.event);
  if (ev === undefined) return { reason: "unknown-term" };
  const st = v.states.find((s) => s.name === ev.on);
  if (st === undefined) return { reason: "unknown-term" };
  const rev = reverseBindings(input, ev);
  let candidateBinding = false;
  const given: Record<string, Expr> = {};
  const then: Expr[] = [];
  for (const [key, val] of Object.entries(w.pre)) {
    const r = rev.field.get(key);
    if (r === undefined) return { reason: "unknown-term" };
    candidateBinding ||= r.candidate;
    const lifted = liftValue(val, st.fields[r.field]!);
    if (!lifted.ok) return { reason: lifted.reason };
    given[r.field] = lifted.value;
  }
  const args: Record<string, Expr> = {};
  for (const [key, val] of Object.entries(w.args)) {
    const r = rev.arg.get(key);
    if (r === undefined) return { reason: "unknown-term" };
    candidateBinding ||= r.candidate;
    const lifted = liftValue(val, ev.args[r.name]!);
    if (!lifted.ok) return { reason: lifted.reason };
    args[r.name] = lifted.value;
  }
  if (w.result !== undefined) {
    if (ev.returns === undefined) return { reason: "unknown-term" };
    const resBinding = input.bindings.find((b) => b.target.k === "result" && b.target.event === ev.name);
    if (resBinding === undefined) return { reason: "unknown-term" };
    candidateBinding ||= resBinding.authority !== "approved";
    const lifted = liftValue(w.result, ev.returns);
    if (!lifted.ok) return { reason: lifted.reason };
    then.push({ k: "eq", l: { k: "result", event: ev.name }, r: lifted.value });
  }
  for (const key of Object.keys(w.post).sort()) {
    const r = rev.field.get(key);
    if (r === undefined) return { reason: "unknown-term" };
    candidateBinding ||= r.candidate;
    const lifted = liftValue(w.post[key], st.fields[r.field]!);
    if (!lifted.ok) return { reason: lifted.reason };
    then.push({ k: "eq", l: { k: "field", state: st.name, field: r.field, at: "post" }, r: lifted.value });
  }
  if (then.length === 0) return { reason: "nothing-asserted" };
  const example: Example = { name: exampleName(w.id), event: ev.name, given, args, then: then.length === 1 ? then[0]! : { k: "and", xs: then } };
  return { example, candidateBinding };
}

/**
 * The outcome of each test identity in the execution files. Two lines for one identity that disagree make it unknown
 * (A-39). Malformed lines are reported.
 */
function readExecutions(input: AdapterInput, diagnostics: Diagnostic[]): { outcomes: Map<string, LocalResult | "unknown">; lines: NonNullable<AdapterOutput["executions"]> } {
  const outcomes = new Map<string, LocalResult | "unknown">();
  const lines: NonNullable<AdapterOutput["executions"]> = [];
  for (const file of input.executions ?? []) {
    const parsed = parseExecutions(new TextDecoder().decode(file.bytes));
    for (const p of parsed.problems) diagnostics.push({ code: "malformed-execution", severity: "error", message: p.message, span: `${file.path}:${p.line}` });
    for (const { e, line } of parsed.executions) {
      const prior = outcomes.get(e.test);
      const outcome = prior === undefined || prior === e.outcome ? e.outcome : "unknown";
      if (prior !== undefined && prior !== e.outcome) diagnostics.push({ code: "ambiguous-test-identity", severity: "warning", message: `${e.test} finished more than once with different outcomes; its outcome is unknown`, span: `${file.path}:${line}` });
      outcomes.set(e.test, outcome);
      lines.push({ test: e.test, outcome: e.outcome, span: `${file.path}:${line}` });
    }
  }
  return { outcomes, lines };
}

/** The record with the outcome the join gives it. A stated outcome is kept (version 1, or a hand-written record). */
function joined(w: Witness, outcomes: Map<string, LocalResult | "unknown">): Witness {
  if (w.execution.localResult !== undefined || w.execution.test === undefined) return w;
  const o = outcomes.get(w.execution.test);
  if (o === undefined || o === "unknown") return w;
  return { ...w, execution: { ...w.execution, localResult: o } };
}

export function run(input: AdapterInput): AdapterOutput {
  const claims: ClaimSet = { source: input.source.name, assumptions: [], obligations: [], examples: [], unliftable: [] };
  const witnesses: Witness[] = [];
  const diagnostics: Diagnostic[] = [];
  const witnessSpans: Record<string, string> = {};
  const names = new Set<string>();
  const executions = readExecutions(input, diagnostics);
  const citedSource = input.config?.cites;
  for (const file of [...input.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const text = new TextDecoder().decode(file.bytes);
    const lines = text.split(/\r?\n/);
    const parsed = parseWitnesses(text);
    for (const p of parsed.problems) {
      const span = `${file.path}:${p.line}`;
      const u: Unliftable = { span, reason: "malformed", text: lines[p.line - 1] ?? "" };
      claims.unliftable.push(u);
      diagnostics.push({ code: "malformed-witness", severity: "error", message: p.message, span });
    }
    for (const { w: recorded, line } of parsed.witnesses) {
      const span = `${file.path}:${line}`;
      const w = joined(recorded, executions.outcomes);
      witnesses.push(w);
      witnessSpans[w.id] = span;
      if (outcomeOf(w) !== "passed") continue; // a failing test, or one whose outcome is unknown, asserts nothing usable as a claim
      const r = liftRecord(w, input.vocabulary, input);
      if ("reason" in r) {
        claims.unliftable.push({ span, reason: r.reason, text: lines[line - 1] ?? "" });
        diagnostics.push({ code: "unliftable", severity: "warning", message: `witness ${w.id}: ${r.reason}`, span });
        continue;
      }
      if (names.has(r.example.name)) {
        claims.unliftable.push({ span, reason: "duplicate-name", text: lines[line - 1] ?? "" });
        continue;
      }
      names.add(r.example.name);
      if (w.cites !== undefined && w.cites.length > 0) {
        if (citedSource === undefined) diagnostics.push({ code: "citation-without-source", severity: "warning", message: `witness ${w.id} cites ${w.cites.join(", ")}, but no practice says which source its citations refer to`, span });
        else r.example.cites = w.cites.map((id) => ({ source: citedSource, id }));
      }
      claims.examples.push(r.example);
      if (r.candidateBinding) diagnostics.push({ code: "depends-on-candidate-binding", severity: "info", message: `${r.example.name} lifts through a candidate binding`, span });
    }
  }
  const out: AdapterOutput = { claims, witnesses, diagnostics, witnessSpans };
  if (input.executions !== undefined) out.executions = executions.lines;
  return out;
}

export const adapter: Adapter = { manifest: { ...manifest, produces: [...manifest.produces], inputKinds: [...manifest.inputKinds] }, run };
