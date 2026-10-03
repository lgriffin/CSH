// A project-local adapter for BDD scenarios in Gherkin (Evidence tab, section 4; main tab, section 6.4).
// Version 1 ships no scenario adapter, so this example brings its own, configured in csh/config.json.
//
// Lifting a scenario is mechanical in its structure and not in its meaning: "the account is locked" means
// nothing to the harness until something says which key it sets. That something is the step table below,
// the same job Cucumber's step definitions do. Each step sets one key, and the key is lifted to a model term
// through the specification's bindings read in reverse, exactly as the witness adapter does for test records.
//
// A scenario with a step the table does not know is kept whole as unliftable, reason unknown-step, never
// dropped. A step that states a quantity keeps the unit the scenario wrote, so the harness, not the adapter,
// decides whether that unit is comparable. A conversion happens only when the source itself holds one in
// units.json, where a team records it as a decision that can be reviewed. Tags that look like requirement
// identifiers become citations.
import type { ClaimSet, Example, Expr, Type } from "@csh/kernel";
import type { Adapter, AdapterInput, AdapterOutput, Diagnostic } from "@csh/witness";

export const manifest = {
  id: "example.adapter.gherkin",
  version: "0.1.0",
  ir: "csh-ir/v1",
  produces: ["claims"],
  inputKinds: ["Scenarios"],
} as const;

/** The source whose identifiers a scenario's tags cite. */
const CITED_SOURCE = "Product";
const ID_TAG = /^@([A-Z][A-Z0-9]*-[0-9]+)$/;

type Part = "pre" | "args" | "post" | "result";
type Value = { k: "int"; v: string; unit?: string } | { k: "bool"; v: boolean } | { k: "enum"; member: string };
type Effect = { part: Part; key: string; value: Value };

const UNITS: Record<string, string> = { minutes: "time(min)", minute: "time(min)", seconds: "time(s)", second: "time(s)" };

/** Conversions a team has decided, from units.json in the source: { "time(min)": { "to": "time(s)", "factor": 60 } }. */
type Conversions = Record<string, { to: string; factor: number }>;

function convert(v: Value, conversions: Conversions): Value {
  if (v.k !== "int" || v.unit === undefined) return v;
  const c = conversions[v.unit];
  return c === undefined ? v : { k: "int", v: String(BigInt(v.v) * BigInt(c.factor)), unit: c.to };
}

/** The step definitions: a phrase, by keyword, to what it sets. */
const STEPS: { keyword: "Given" | "When" | "Then"; pattern: RegExp; effects: (m: RegExpExecArray) => Effect[] }[] = [
  { keyword: "Given", pattern: /^the account has (\d+) failed attempts?$/, effects: (m) => [{ part: "pre", key: "failedAttempts", value: { k: "int", v: m[1]!, unit: "count(attempts)" } }] },
  { keyword: "Given", pattern: /^the account is (not )?locked$/, effects: (m) => [{ part: "pre", key: "locked", value: { k: "bool", v: m[1] === undefined } }] },
  { keyword: "When", pattern: /^the user signs in with the (correct|wrong) password$/, effects: (m) => [{ part: "args", key: "passwordOk", value: { k: "bool", v: m[1] === "correct" } }] },
  { keyword: "Then", pattern: /^the sign-in is (accepted|refused)$/, effects: (m) => [{ part: "result", key: "result", value: { k: "enum", member: m[1] === "accepted" ? "Accepted" : "Refused" } }] },
  { keyword: "Then", pattern: /^the account is (not )?locked$/, effects: (m) => [{ part: "post", key: "locked", value: { k: "bool", v: m[1] === undefined } }] },
  { keyword: "Then", pattern: /^the account has (\d+) failed attempts?$/, effects: (m) => [{ part: "post", key: "failedAttempts", value: { k: "int", v: m[1]!, unit: "count(attempts)" } }] },
  {
    keyword: "Then",
    pattern: /^the account is locked for (\d+) (minutes?|seconds?)$/,
    effects: (m) => [
      { part: "post", key: "locked", value: { k: "bool", v: true } },
      { part: "post", key: "lockSeconds", value: { k: "int", v: m[1]!, unit: UNITS[m[2]!]! } },
    ],
  },
];

interface Scenario {
  title: string;
  line: number;
  tags: string[];
  steps: { keyword: "Given" | "When" | "Then"; text: string; line: number }[];
}

/** Read Feature, Scenario, tag and step lines. And and But continue the keyword before them. */
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
    const sc = /^Scenario:\s*(.+)$/.exec(line);
    if (sc !== null) {
      current = { title: sc[1]!, line: i + 1, tags, steps: [] };
      scenarios.push(current);
      tags = [];
      last = undefined;
      return;
    }
    const st = /^(Given|When|Then|And|But)\s+(.+)$/.exec(line);
    if (st !== null && current !== undefined) {
      const kw = st[1] === "And" || st[1] === "But" ? last : (st[1] as "Given" | "When" | "Then");
      if (kw === undefined) return;
      last = kw;
      current.steps.push({ keyword: kw, text: st[2]!, line: i + 1 });
    }
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

function lift(sc: Scenario, input: AdapterInput, event: string, conversions: Conversions): { example: Example; candidate: boolean } | { reason: string; at: number } {
  const v = input.vocabulary;
  const ev = v.events.find((e) => e.name === event);
  const st = v.states.find((s) => s.name === ev?.on);
  if (ev === undefined || st === undefined) return { reason: "unknown-term", at: sc.line };
  const effects: Effect[] = [];
  for (const step of sc.steps) {
    const def = STEPS.find((d) => d.keyword === step.keyword && d.pattern.test(step.text));
    if (def === undefined) return { reason: "unknown-step", at: step.line };
    effects.push(...def.effects(def.pattern.exec(step.text)!).map((e) => ({ ...e, value: convert(e.value, conversions) })));
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
  const cites = sc.tags.map((tag) => ID_TAG.exec(tag)?.[1]).filter((id): id is string => id !== undefined).map((id) => ({ source: CITED_SOURCE, id }));
  if (cites.length > 0) example.cites = cites;
  return { example, candidate };
}

export function run(input: AdapterInput): AdapterOutput {
  const claims: ClaimSet = { source: input.source.name, assumptions: [], obligations: [], examples: [], unliftable: [] };
  const diagnostics: Diagnostic[] = [];
  // Every scenario in this example is about the one event the vocabulary declares; a larger project would name it per feature.
  const event = input.vocabulary.events[0]?.name ?? "";
  const unitsFile = input.files.find((f) => f.path.endsWith("/units.json") || f.path === "units.json");
  let conversions: Conversions = {};
  if (unitsFile !== undefined) {
    try {
      conversions = JSON.parse(new TextDecoder().decode(unitsFile.bytes)) as Conversions;
    } catch (err) {
      diagnostics.push({ code: "malformed-units", severity: "error", message: (err as Error).message, span: unitsFile.path });
    }
  }
  for (const file of [...input.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (!file.path.endsWith(".feature")) continue;
    const text = new TextDecoder().decode(file.bytes);
    const lines = text.split(/\r?\n/);
    for (const sc of parse(text).scenarios) {
      const r = lift(sc, input, event, conversions);
      if ("reason" in r) {
        const span = `${file.path}:${r.at}`;
        claims.unliftable.push({ span, reason: r.reason, text: `Scenario: ${sc.title} | ${(lines[r.at - 1] ?? "").trim()}` });
        diagnostics.push({ code: "unliftable", severity: "warning", message: `scenario "${sc.title}": ${r.reason}`, span });
        continue;
      }
      claims.examples.push(r.example);
      if (r.candidate) diagnostics.push({ code: "depends-on-candidate-binding", severity: "info", message: `${r.example.name} lifts through a candidate binding`, span: `${file.path}:${sc.line}` });
    }
  }
  return { claims, diagnostics };
}

export const adapter: Adapter = { manifest: { ...manifest, produces: [...manifest.produces], inputKinds: [...manifest.inputKinds] }, run };
