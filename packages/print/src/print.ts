// The canonical printer (Language reference, section 8): renders any model as CSL TypeScript.
import {
  canonicalModule,
  compareCodePoints,
  type Assumption,
  type Cite,
  type Example,
  type Expr,
  type Module,
  type Obligation,
  type Transition,
  type Type,
} from "@csh/kernel";

type Ctx = "now" | "step" | "assumption";

const METHOD: Record<string, string> = { add: "plus", sub: "minus", eq: "eq", ne: "ne", lt: "lt", le: "lte", gt: "gt", ge: "gte", implies: "implies" };

function readableUnitConst(id: string): string {
  return `u_${id.replace(/[^A-Za-z0-9]+/g, "_").replace(/_+$/, "")}`;
}

/** One constant name per unit id, distinct even when two ids differ only in punctuation. */
function unitConsts(ids: string[]): Map<string, string> {
  const names = new Map<string, string>();
  const taken = new Set<string>();
  for (const id of [...ids].sort(compareCodePoints)) {
    const base = readableUnitConst(id);
    let name = base;
    for (let i = 2; taken.has(name); i++) name = `${base}_${i}`;
    taken.add(name);
    names.set(id, name);
  }
  return names;
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Property access that stays correct for any member name. */
function member(owner: string, name: string): string {
  return IDENT.test(name) ? `${owner}.${name}` : `${owner}[${JSON.stringify(name)}]`;
}

function str(s: string): string {
  return JSON.stringify(s);
}

function intLiteral(v: string, unit: string | undefined, unitConst: (id: string) => string): string {
  const n = BigInt(v);
  const safe = n <= BigInt(Number.MAX_SAFE_INTEGER) && n >= BigInt(Number.MIN_SAFE_INTEGER);
  const text = safe ? v : `${v}n`;
  return unit === undefined ? `lit(${text})` : `${unitConst(unit)}(${text})`;
}

export class Printer {
  private readonly sourceConst = new Map<string, string>();
  private readonly units: Map<string, string>;
  private readonly m: Module;
  constructor(m: Module) {
    this.m = canonicalModule(m);
    this.units = unitConsts(this.m.vocabulary.units.map((u) => u.id));
    const taken = new Set<string>([...this.m.vocabulary.enums.map((e) => e.name), ...this.m.vocabulary.states.map((s) => s.name), ...this.m.vocabulary.events.map((e) => e.name)]);
    for (const s of this.m.sources) {
      let name = s.name;
      while (taken.has(name)) name = `${name}Source`;
      taken.add(name);
      this.sourceConst.set(s.name, name);
    }
  }

  unitConst(id: string): string {
    return this.units.get(id) ?? readableUnitConst(id);
  }

  expr(e: Expr, ctx: Ctx): string {
    switch (e.k) {
      case "int":
        return intLiteral(e.v, e.unit, (id) => this.unitConst(id));
      case "bool":
        return `truth(${e.v ? "true" : "false"})`;
      case "enum":
        return member(e.enum, e.member);
      case "field":
        if (e.at === "now") return `${e.state}.${e.field}`;
        return `${e.at}.${e.field}`;
      case "arg":
        return ctx === "step" ? `args.${e.name}` : `${e.event}.args.${e.name}`;
      case "result":
        return ctx === "step" ? "result" : `${e.event}.result`;
      case "add":
      case "sub":
      case "eq":
      case "ne":
      case "lt":
      case "le":
      case "gt":
      case "ge":
      case "implies":
        return `${this.expr(e.l, ctx)}.${METHOD[e.k]}(${this.expr(e.r, ctx)})`;
      case "and":
      case "or":
        if (e.xs.length === 2) return `${this.expr(e.xs[0]!, ctx)}.${e.k}(${this.expr(e.xs[1]!, ctx)})`;
        return `${e.k}(${e.xs.map((x) => this.expr(x, ctx)).join(", ")})`;
      case "not":
        return `${this.expr(e.x, ctx)}.not()`;
    }
  }

  type(t: Type): string {
    if (t.kind === "int") return t.unit === undefined ? "int()" : `int(${this.unitConst(t.unit)})`;
    if (t.kind === "bool") return "bool()";
    return t.enum;
  }

  private cites(c: Cite[] | undefined): string | undefined {
    if (c === undefined || c.length === 0) return undefined;
    return `cites: [${c.map((x) => `{ source: ${this.sourceConst.get(x.source) ?? x.source}, id: ${str(x.id)} }`).join(", ")}]`;
  }

  private assumption(b: string, a: Assumption): string {
    return `    ${b}.assume(${str(a.name)}, ${this.expr(a.body, "assumption")});`;
  }

  private obligation(b: string, o: Obligation): string[] {
    if (o.kind === "invariant") {
      const c = this.cites(o.cites);
      return [`    ${b}.invariant(${str(o.name)}, ${this.expr(o.body, "now")}${c === undefined ? "" : `, { ${c} }`});`];
    }
    if (o.kind === "requirement") {
      const lines = [`    ${b}.requirement(${str(o.name)}, {`, `      when: ${o.event},`];
      if (o.while !== undefined) lines.push(`      while: ({ pre }) => ${this.expr(o.while, "step")},`);
      if (o.and !== undefined) lines.push(`      and: ({ pre, args }) => ${this.expr(o.and, "step")},`);
      lines.push(`      shall: ({ pre, post, args, result }) => ${this.expr(o.shall, "step")},`);
      if (o.ensures.length > 0) lines.push(`      ensures: ({ pre, post, args, result }) => [${o.ensures.map((x) => this.expr(x, "step")).join(", ")}],`);
      const c = this.cites(o.cites);
      if (c !== undefined) lines.push(`      ${c},`);
      lines.push("    });");
      return lines;
    }
    const c = this.cites(o.cites);
    return [`    ${b}.${o.kind}(${str(o.name)}, ${JSON.stringify(o.native ?? null)}${c === undefined ? "" : `, { ${c} }`});`];
  }

  private example(b: string, x: Example): string[] {
    const given = Object.keys(x.given)
      .sort(compareCodePoints)
      .map((k) => `${k}: ${this.expr(x.given[k]!, "now")}`);
    const args = Object.keys(x.args)
      .sort(compareCodePoints)
      .map((k) => `${k}: ${this.expr(x.args[k]!, "now")}`);
    const lines = [
      `    ${b}.example(${str(x.name)}, {`,
      `      given: { ${given.join(", ")} },`,
      `      when: ${x.event}({ ${args.join(", ")} }),`,
      `      then: ({ pre, post, args, result }) => ${this.expr(x.then, "step")},`,
    ];
    const c = this.cites(x.cites);
    if (c !== undefined) lines.push(`      ${c},`);
    lines.push("    });");
    return lines;
  }

  private transition(t: Transition): string[] {
    const lines = [
      `  s.transition(${t.event}, ({ pre, post, args, result }) => ({`,
      `    when: ${this.expr(t.when, "step")},`,
      `    then: ${this.expr(t.then, "step")},`,
    ];
    if (t.otherwise !== undefined) lines.push(`    otherwise: ${this.expr(t.otherwise, "step")},`);
    lines.push("  }));");
    return lines;
  }

  /** One fragment in the notation it would have inside its container (used by csh explain and csh approve). */
  fragment(kind: string, node: unknown): string {
    switch (kind) {
      case "assumption":
        return this.assumption("i", node as Assumption).trim();
      case "invariant":
      case "requirement":
      case "architecture":
      case "temporal":
        return this.obligation("i", node as Obligation).map((l) => l.slice(4)).join("\n");
      case "example":
        return this.example("i", node as Example).map((l) => l.slice(4)).join("\n");
      case "transition":
        return this.transition(node as Transition).map((l) => l.slice(2)).join("\n");
      case "binding": {
        const t = (node as Module["bindings"][number]).target;
        const target = t.k === "field" ? `${t.state}.${t.field}` : t.k === "arg" ? `${t.event}.args.${t.name}` : `${t.event}.result`;
        return `s.bind(${target}, ${str((node as Module["bindings"][number]).key)});`;
      }
      default:
        return JSON.stringify(node);
    }
  }

  print(): string {
    const m = this.m;
    const out: string[] = [`import { system, int, bool, unit, lit, truth, and, or } from "csl";`, ""];
    // Units.
    for (const u of m.vocabulary.units) out.push(`const ${this.unitConst(u.id)} = unit(${str(u.dimension)}, ${str(u.symbol)});`);
    if (m.vocabulary.units.length > 0) out.push("");
    out.push(`export default system(${str(m.system)}, (s) => {`);
    // Enumerations, states, events.
    for (const e of m.vocabulary.enums) out.push(`  const ${e.name} = s.enum(${str(e.name)}, [${e.members.map(str).join(", ")}]);`);
    for (const st of m.vocabulary.states) {
      const fields = Object.keys(st.fields)
        .sort(compareCodePoints)
        .map((f) => `${f}: ${this.type(st.fields[f]!)}`);
      out.push(`  const ${st.name} = s.state(${str(st.name)}, { ${fields.join(", ")} });`);
    }
    for (const ev of m.vocabulary.events) {
      const args = Object.keys(ev.args)
        .sort(compareCodePoints)
        .map((a) => `${a}: ${this.type(ev.args[a]!)}`);
      const ret = ev.returns === undefined ? "" : `, returns: ${this.type(ev.returns)}`;
      out.push(`  const ${ev.name} = s.event(${str(ev.name)}, { on: ${ev.on}, args: { ${args.join(", ")} }${ret} });`);
    }
    // Sources come before intents so that citations can name them (ADR-19).
    for (const s of m.sources) out.push(`  const ${this.sourceConst.get(s.name)} = s.source(${str(s.name)}, { kind: ${str(s.kind)}, at: ${str(s.at)} });`);
    for (const t of m.transitions) out.push(...this.transition(t));
    for (const p of m.policies) {
      const parts = [`require: [${p.require.map(str).join(", ")}]`, `reject: [${p.reject.map(str).join(", ")}]`];
      if (p.critical !== undefined) parts.push(`critical: ${p.critical}`);
      out.push(`  s.policy(${str(p.name)}, { ${parts.join(", ")} });`);
    }
    for (const i of m.intents) {
      out.push(`  s.intent(${str(i.name)}, { owner: ${str(i.owner)}, value: ${str(i.value)}, assurance: ${str(i.assurance)} }, (i) => {`);
      for (const a of i.assumptions) out.push(this.assumption("i", a));
      for (const o of i.obligations) out.push(...this.obligation("i", o));
      for (const x of i.examples) out.push(...this.example("i", x));
      out.push("  });");
    }
    for (const c of m.claims) {
      out.push(`  s.claims(${this.sourceConst.get(c.source) ?? c.source}, (c) => {`);
      for (const a of c.assumptions) out.push(this.assumption("c", a));
      for (const o of c.obligations) out.push(...this.obligation("c", o));
      for (const x of c.examples) out.push(...this.example("c", x));
      out.push("  });");
    }
    for (const b of m.bindings) {
      const t = b.target;
      const target = t.k === "field" ? `${t.state}.${t.field}` : t.k === "arg" ? `${t.event}.args.${t.name}` : `${t.event}.result`;
      out.push(`  s.bind(${target}, ${str(b.key)});`);
    }
    out.push("});", "");
    return out.join("\n");
  }
}

/** Render a model as CSL TypeScript. Pack imports and unliftable entries have no source form and are not printed. */
export function printModule(m: Module): string {
  return new Printer(m).print();
}

/** Render one fragment of a module as CSL. */
export function printFragment(m: Module, kind: string, node: unknown): string {
  return new Printer(m).fragment(kind, node);
}

/** Render one expression in the notation of a position. */
export function printExpr(e: Expr, ctx: Ctx = "step"): string {
  return new Printer({ schema: "csh-ir/v1", system: "X", uses: [], vocabulary: { units: [], enums: [], states: [], events: [] }, transitions: [], policies: [], intents: [], sources: [], claims: [], bindings: [] }).expr(e, ctx);
}
