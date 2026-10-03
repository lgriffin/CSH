// Canonical JSON and digests (Semantic contract, section 5).
import { createHash } from "node:crypto";
import type {
  Assumption,
  Binding,
  ClaimSet,
  Digest,
  Example,
  Intent,
  Module,
  Obligation,
  Ref,
  Transition,
} from "./model.ts";

export class CanonicalError extends Error {}

/** Compare strings by Unicode code point, not UTF-16 code unit. */
export function compareCodePoints(a: string, b: string): number {
  const ia = a[Symbol.iterator]();
  const ib = b[Symbol.iterator]();
  for (;;) {
    const x = ia.next();
    const y = ib.next();
    if (x.done && y.done) return 0;
    if (x.done) return -1;
    if (y.done) return 1;
    const cx = x.value.codePointAt(0)!;
    const cy = y.value.codePointAt(0)!;
    if (cx !== cy) return cx < cy ? -1 : 1;
  }
}

/**
 * Canonical JSON: object keys sorted by code point, no insignificant
 * whitespace, integers as decimal strings, UTF-8. Undefined members are
 * dropped. Non-integer numbers are refused: the model has no reals.
 */
export function canonicalJson(value: unknown): string {
  return write(value);
}

function write(v: unknown): string {
  if (v === null) return "null";
  switch (typeof v) {
    case "boolean":
      return v ? "true" : "false";
    case "string":
      return JSON.stringify(v);
    case "bigint":
      return JSON.stringify(v.toString());
    case "number":
      if (!Number.isSafeInteger(v)) throw new CanonicalError(`non-integer or unsafe number ${v}`);
      return JSON.stringify(String(v));
    case "object": {
      if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : write(x))).join(",")}]`;
      const keys = Object.keys(v as object)
        .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
        .sort(compareCodePoints);
      return `{${keys.map((k) => `${JSON.stringify(k)}:${write((v as Record<string, unknown>)[k])}`).join(",")}}`;
    }
    default:
      throw new CanonicalError(`cannot canonicalise a ${typeof v}`);
  }
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function digestOf(data: string | Uint8Array): Digest {
  return `sha256:${sha256Hex(data)}`;
}

export function digestJson(value: unknown): Digest {
  return digestOf(canonicalJson(value));
}

export function refName(r: Ref): string {
  if (r.k === "field") return `${r.state}.${r.field}`;
  if (r.k === "arg") return `${r.event}.args.${r.name}`;
  return `${r.event}.result`;
}

const byName = <T extends { name: string }>(xs: T[]): T[] =>
  [...xs].sort((a, b) => compareCodePoints(a.name, b.name));

function canonAssumptions(xs: Assumption[]): Assumption[] {
  return byName(xs);
}
function canonObligations(xs: Obligation[]): Obligation[] {
  return byName(xs);
}
function canonExamples(xs: Example[]): Example[] {
  return byName(xs);
}
function canonBindings(xs: Binding[]): Binding[] {
  return [...xs].sort((a, b) => compareCodePoints(refName(a.target), refName(b.target)) || compareCodePoints(a.key, b.key));
}
function canonTransitions(xs: Transition[]): Transition[] {
  // Transitions have no name; order by event, then by canonical text, so
  // authoring order does not reach the digest.
  return [...xs].sort(
    (a, b) => compareCodePoints(a.event, b.event) || compareCodePoints(canonicalJson(a), canonicalJson(b)),
  );
}

/** Return a copy of the module with every named collection in canonical order. */
export function canonicalModule(m: Module): Module {
  const out: Module = {
    schema: m.schema,
    system: m.system,
    uses: [...m.uses].sort((a, b) => compareCodePoints(a.pack, b.pack)),
    vocabulary: {
      units: [...m.vocabulary.units].sort((a, b) => compareCodePoints(a.id, b.id)),
      enums: byName(m.vocabulary.enums),
      states: byName(m.vocabulary.states),
      events: byName(m.vocabulary.events),
    },
    transitions: canonTransitions(m.transitions),
    policies: byName(m.policies),
    intents: byName(m.intents).map(
      (i): Intent => ({
        ...i,
        assumptions: canonAssumptions(i.assumptions),
        obligations: canonObligations(i.obligations),
        examples: canonExamples(i.examples),
      }),
    ),
    sources: byName(m.sources),
    claims: [...m.claims]
      .sort((a, b) => compareCodePoints(a.source, b.source))
      .map(
        (c): ClaimSet => ({
          ...c,
          assumptions: canonAssumptions(c.assumptions),
          obligations: canonObligations(c.obligations),
          examples: canonExamples(c.examples),
        }),
      ),
    bindings: canonBindings(m.bindings),
  };
  if (m.relaxations !== undefined && m.relaxations.length > 0) {
    out.relaxations = [...m.relaxations].sort((a, b) => compareCodePoints(a.obligation, b.obligation));
  }
  return out;
}

/** Module digest: SHA-256 over the canonical JSON of the whole (canonically ordered) module. */
export function moduleDigest(m: Module): Digest {
  return digestJson(canonicalModule(m));
}
