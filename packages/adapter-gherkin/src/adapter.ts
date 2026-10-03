// The scenario adapter (Anchor, harnesses and A3, section 3.3): BDD scenarios in Gherkin, lifted as example claims.
//
// Lifting a scenario is mechanical in its structure and not in its meaning: "the account is locked" means nothing to
// the harness until something says which key it sets. That something is the project's step table, the same job
// Cucumber's step definitions do. The table is the project's own code: the practice's `steps` setting names it, and
// it is loaded here, inside the adapter's sandbox. Each step sets one or more keys, and each key is lifted to a model
// term through the specification's bindings read in reverse, exactly as the witness adapter does for test records.
//
// A scenario with a step the table does not know is kept whole as unliftable, reason unknown-step, never dropped. A
// step that states a quantity keeps the unit the scenario wrote, so the harness, not the adapter, decides whether
// that unit is comparable. A conversion happens only when the source itself holds one in units.json, where a team
// records it as a decision that can be reviewed. Tags that look like requirement identifiers become citations of the
// source the practice's `cites` setting names. Scenarios are read, never executed (A-37).
import type { ClaimSet, Example, Expr, Type } from "@csh/kernel";
import type { Adapter, AdapterInput, AdapterOutput, Diagnostic } from "@csh/witness";

export const manifest = {
  id: "csh.adapter.gherkin",
  version: "0.1.0",
  ir: "csh-ir/v1",
  produces: ["claims"],
  inputKinds: ["Scenarios"],
} as const;

const ID_TAG = /^@([A-Z][A-Z0-9]*-[0-9]+)$/;

export type Part = "pre" | "args" | "post" | "result";
export type Value = { k: "int"; v: string; unit?: string } | { k: "bool"; v: boolean } | { k: "enum"; member: string };
export type Effect = { part: Part; key: string; value: Value };

/** One step definition: a phrase, by keyword, to the witness keys it sets. A project's step table is a list of these. */
export interface StepDefinition {
  keyword: "Given" | "When" | "Then";
  pattern: RegExp;
  effects: (m: RegExpExecArray) => Effect[];
}

/** What the step table module exports: `steps`, and optionally the event its scenarios are about. */
export interface StepTable {
  steps: StepDefinition[];
  event?: string;
}

/** Conversions a team has decided, from units.json in the source: { "time(min)": { "to": "time(s)", "factor": 60 } }. */
type Conversions = Record<string, { to: string; factor: number }>;

/** Keep the well-formed entries of a parsed units.json; report every other one, so one bad entry loses nothing else. */
export function readConversions(v: unknown, span: string, diagnostics: Diagnostic[]): Conversions {
  const out: Conversions = {};
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    diagnostics.push({ code: "malformed-units", severity: "error", message: "units.json must hold an object of conversions", span });
    return out;
  }
  for (const [from, c] of Object.entries(v as Record<string, unknown>)) {
    const e = c as { to?: unknown; factor?: unknown } | null;
    if (typeof e === "object" && e !== null && typeof e.to === "string" && typeof e.factor === "number" && Number.isSafeInteger(e.factor) && e.factor > 0) out[from] = { to: e.to, factor: e.factor };
    else diagnostics.push({ code: "malformed-units", severity: "error", message: `${from}: a conversion needs a string "to" and a positive integer "factor"`, span });
  }
  return out;
}

function convert(v: Value, conversions: Conversions): Value {
  if (v.k !== "int" || v.unit === undefined) return v;
  const c = conversions[v.unit];
  return c === undefined ? v : { k: "int", v: String(BigInt(v.v) * BigInt(c.factor)), unit: c.to };
}

interface Scenario {
  title: string;
  line: number;
  tags: string[];
  /** Set for a construct this adapter does not lift (Scenario Outline, Background); the whole block is unliftable. */
  unsupported?: string;
  /** A step keyword of undefined means a line this adapter cannot read; the scenario is then unliftable. */
  steps: { keyword: "Given" | "When" | "Then" | undefined; text: string; line: number }[];
}

const HEADER = /^(Feature|Rule|Background|Scenario Outline|Scenario Template|Scenario|Example|Examples|Scenarios):\s*(.*)$/;

/**
 * Read Feature, Scenario, tag and step lines. And, But and * continue the keyword before them. Every other line
 * inside a scenario is kept as an unreadable step, so a scenario is lifted whole or not at all.
 */
export function parse(text: string): { scenarios: Scenario[] } {
  const scenarios: Scenario[] = [];
  let tags: string[] = [];
  let current: Scenario | undefined;
  let last: "Given" | "When" | "Then" | undefined;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    if (line.startsWith("@")) {
      tags.push(...line.split(/\s+/));
      return;
    }
    const h = HEADER.exec(line);
    if (h !== null) {
      const kind = h[1]!;
      last = undefined;
      if (kind === "Scenario" || kind === "Example") {
        current = { title: h[2]!, line: i + 1, tags, steps: [] };
        scenarios.push(current);
      } else if (kind === "Background" || kind === "Scenario Outline" || kind === "Scenario Template") {
        current = { title: h[2] !== "" ? h[2]! : kind, line: i + 1, tags, steps: [], unsupported: kind };
        scenarios.push(current);
      } else if (kind === "Examples" || kind === "Scenarios") {
        // An outline's table stays with the outline, which is already unliftable as a whole.
        if (current?.unsupported === undefined) current = undefined;
      } else current = undefined;
      tags = [];
      return;
    }
    if (current === undefined) return; // free text under Feature or Rule
    const st = /^(Given|When|Then|And|But|\*)\s+(.+)$/.exec(line);
    const kw = st === null ? undefined : st[1] === "And" || st[1] === "But" || st[1] === "*" ? last : (st[1] as "Given" | "When" | "Then");
    if (kw !== undefined) last = kw;
    current.steps.push({ keyword: kw, text: st?.[2] ?? line, line: i + 1 });
  });
  return { scenarios };
}

/** A legal example name from a scenario title: "Third failed attempt" becomes "ScenarioThirdFailedAttempt". */
export function exampleName(title: string): string {
  return `Scenario${title.split(/[^A-Za-z0-9]+/).filter((p) => p !== "").map((p) => p[0]!.toUpperCase() + p.slice(1)).join("")}`;
}

function literal(v: Value, t: Type | undefined): Expr {
  if (v.k === "int") return v.unit === undefined ? { k: "int", v: v.v } : { k: "int", v: v.v, unit: v.unit };
  if (v.k === "bool") return { k: "bool", v: v.v };
  return { k: "enum", enum: t?.kind === "enum" ? t.enum : "", member: v.member };
}

function lift(sc: Scenario, input: AdapterInput, event: string, conversions: Conversions, steps: StepDefinition[], citedSource: string | undefined): { example: Example; candidate: boolean; uncitedIds: string[] } | { reason: string; at: number } {
  const v = input.vocabulary;
  const ev = v.events.find((e) => e.name === event);
  const st = v.states.find((s) => s.name === ev?.on);
  if (ev === undefined || st === undefined) return { reason: "unknown-term", at: sc.line };
  if (sc.unsupported !== undefined) return { reason: "unsupported-construct", at: sc.line };
  const effects: Effect[] = [];
  for (const step of sc.steps) {
    // One match per pattern, from the start: a global or sticky pattern keeps its position between calls.
    const match = (d: StepDefinition) => {
      d.pattern.lastIndex = 0;
      return d.pattern.exec(step.text);
    };
    let hit: { def: StepDefinition; m: RegExpExecArray } | undefined;
    for (const d of steps) {
      const m = d.keyword === step.keyword ? match(d) : null;
      if (m !== null) {
        hit = { def: d, m };
        break;
      }
    }
    if (step.keyword === undefined || hit === undefined) return { reason: "unknown-step", at: step.line };
    effects.push(...hit.def.effects(hit.m).map((e) => ({ ...e, value: convert(e.value, conversions) })));
  }
  let candidate = false;
  const given: Record<string, Expr> = {};
  const args: Record<string, Expr> = {};
  const then: Expr[] = [];
  for (const e of effects) {
    const b = input.bindings.find((x) => x.key === e.key && (e.part === "args" ? x.target.k === "arg" : e.part === "result" ? x.target.k === "result" : x.target.k === "field"));
    if (b === undefined) return { reason: "unknown-term", at: sc.line };
    candidate ||= b.authority !== "approved";
    const t = b.target;
    if (t.k === "field") {
      const lit = literal(e.value, st.fields[t.field]);
      if (e.part === "pre") given[t.field] = lit;
      else then.push({ k: "eq", l: { k: "field", state: st.name, field: t.field, at: "post" }, r: lit });
    } else if (t.k === "arg") args[t.name] = literal(e.value, ev.args[t.name]);
    else if (t.k === "result") then.push({ k: "eq", l: { k: "result", event: ev.name }, r: literal(e.value, ev.returns) });
  }
  if (then.length === 0) return { reason: "nothing-asserted", at: sc.line };
  const example: Example = { name: exampleName(sc.title), event: ev.name, given, args, then: then.length === 1 ? then[0]! : { k: "and", xs: then } };
  const ids = sc.tags.map((tag) => ID_TAG.exec(tag)?.[1]).filter((id): id is string => id !== undefined);
  if (ids.length > 0 && citedSource !== undefined) example.cites = ids.map((id) => ({ source: citedSource, id }));
  return { example, candidate, uncitedIds: citedSource === undefined ? ids : [] };
}

/** Check the shape of a loaded step table; a malformed one is an error, never a partial table. */
export function readStepTable(mod: unknown): { table?: StepTable; problem?: string } {
  const m = mod as Partial<StepTable> | null;
  if (m === null || typeof m !== "object" || !Array.isArray(m.steps)) return { problem: "the step table module must export steps, a list of step definitions" };
  for (const [i, d] of m.steps.entries()) {
    const ok = d !== null && typeof d === "object" && ["Given", "When", "Then"].includes((d as StepDefinition).keyword) && (d as StepDefinition).pattern instanceof RegExp && typeof (d as StepDefinition).effects === "function";
    if (!ok) return { problem: `steps[${i}] needs a keyword (Given, When or Then), a pattern (a RegExp) and an effects function` };
  }
  if (m.event !== undefined && typeof m.event !== "string") return { problem: "event, when exported, must be an event name" };
  const table: StepTable = { steps: m.steps };
  if (m.event !== undefined) table.event = m.event;
  return { table };
}

/** Run with a step table already loaded. */
export function runWith(input: AdapterInput, table: StepTable): AdapterOutput {
  const claims: ClaimSet = { source: input.source.name, assumptions: [], obligations: [], examples: [], unliftable: [] };
  const diagnostics: Diagnostic[] = [];
  // The event the scenarios are about: the table names it, or the vocabulary declares only one.
  const event = table.event ?? (input.vocabulary.events.length === 1 ? input.vocabulary.events[0]!.name : "");
  if (event === "") diagnostics.push({ code: "event-unnamed", severity: "error", message: "the vocabulary declares several events; the step table must export event, the one its scenarios are about" });
  const citedSource = input.config?.cites;
  const unitsFile = input.files.find((f) => f.path.endsWith("/units.json") || f.path === "units.json");
  let conversions: Conversions = {};
  if (unitsFile !== undefined) {
    try {
      conversions = readConversions(JSON.parse(new TextDecoder().decode(unitsFile.bytes)), unitsFile.path, diagnostics);
    } catch (err) {
      diagnostics.push({ code: "malformed-units", severity: "error", message: (err as Error).message, span: unitsFile.path });
    }
  }
  for (const file of [...input.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (!file.path.endsWith(".feature")) continue;
    const text = new TextDecoder().decode(file.bytes);
    const lines = text.split(/\r?\n/);
    for (const sc of parse(text).scenarios) {
      const r = lift(sc, input, event, conversions, table.steps, citedSource);
      if ("reason" in r) {
        const span = `${file.path}:${r.at}`;
        claims.unliftable.push({ span, reason: r.reason, text: `Scenario: ${sc.title} | ${(lines[r.at - 1] ?? "").trim()}` });
        diagnostics.push({ code: "unliftable", severity: "warning", message: `scenario "${sc.title}": ${r.reason}`, span });
        continue;
      }
      claims.examples.push(r.example);
      if (r.uncitedIds.length > 0) diagnostics.push({ code: "citation-without-source", severity: "warning", message: `scenario "${sc.title}" is tagged ${r.uncitedIds.join(", ")}, but no practice says which source its citations refer to`, span: `${file.path}:${sc.line}` });
      if (r.candidate) diagnostics.push({ code: "depends-on-candidate-binding", severity: "info", message: `${r.example.name} lifts through a candidate binding`, span: `${file.path}:${sc.line}` });
    }
  }
  return { claims, diagnostics };
}

/**
 * Load the project's step table from the file URL in `config.steps`, then run. The sandbox lets the adapter read that
 * file and nothing else of the project.
 */
export async function run(input: AdapterInput): Promise<AdapterOutput> {
  const at = input.config?.steps;
  if (at === undefined) return { claims: { source: input.source.name, assumptions: [], obligations: [], examples: [], unliftable: [] }, diagnostics: [{ code: "no-step-table", severity: "error", message: "the scenarios practice names no step table (steps in csh/component.json); no scenario can be lifted" }] };
  let loaded: { table?: StepTable; problem?: string };
  try {
    loaded = readStepTable(await import(at));
  } catch (err) {
    loaded = { problem: `the step table could not be loaded: ${(err as Error).message}` };
  }
  if (loaded.table === undefined) return { claims: { source: input.source.name, assumptions: [], obligations: [], examples: [], unliftable: [] }, diagnostics: [{ code: "malformed-step-table", severity: "error", message: loaded.problem! }] };
  return runWith(input, loaded.table);
}

export const adapter: Adapter = { manifest: { ...manifest, produces: [...manifest.produces], inputKinds: [...manifest.inputKinds] }, run };
