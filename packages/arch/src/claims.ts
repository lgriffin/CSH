// Structural claims (Ingesting a codebase, stage 24): a proposition about the code that a source asserts, judged by
// looking it up in the facts. Nothing is solved. A claim the facts refute is a fact-conflict; two claims that cannot
// both be true are a claim-conflict, whatever the facts say. A fact that is missing leaves a claim unknown, never
// refuted: a module that was not read says nothing about what it declares.
import { type Claim, compareCodePoints, type Prop } from "@csh/kernel";

/** The facts a claim is judged by, all taken at the commit under evaluation. */
export interface ClaimFacts {
  /** Every module read, by path. */
  modules: Set<string>;
  declares: { module: string; symbol: string; declares: string; base?: string; value?: string; at: string }[];
  exports: { module: string; symbol: string; at: string }[];
  fields: { file: string; path: string; value: string; at: string }[];
  /** The files the repository tracks; undefined when not known. */
  files?: Set<string>;
}

export type ClaimResult = { result: "holds"; detail: string } | { result: "refuted"; detail: string } | { result: "unknown"; reason: string };

type Truth = { value: boolean; detail: string } | { reason: string };

/** Classes no source declares that end a chain of bases: they extend nothing a claim could name. */
const BUILT_IN_BASES = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "AggregateError", "Object", "Array", "Map", "Set", "Promise", "EventTarget"]);

const unescape = (s: string) => s.replace(/~1/g, "/").replace(/~0/g, "~");
const esc = (s: string) => s.replace(/~/g, "~0").replace(/\//g, "~1");

/** Whether the proposition is true of the facts, with what decided it, or why nothing can. */
export function truthOf(p: Prop, f: ClaimFacts): Truth {
  const notRead = (m: string) => ({ reason: `not-read: ${m}` });
  switch (p.k) {
    case "file": {
      if (f.files === undefined) return { reason: "no-tracked-files" };
      const has = f.files.has(p.path);
      return { value: has, detail: has ? `${p.path} is tracked` : `${p.path} is not tracked` };
    }
    case "declares": {
      if (!f.modules.has(p.module)) return notRead(p.module);
      const d = f.declares.find((x) => x.module === p.module && x.symbol === p.symbol);
      return { value: d !== undefined, detail: d !== undefined ? `${d.at}: ${p.module} declares ${p.symbol}` : `${p.module} declares no ${p.symbol}` };
    }
    case "exports": {
      if (!f.modules.has(p.module)) return notRead(p.module);
      const e = f.exports.find((x) => x.module === p.module && x.symbol === p.symbol);
      if (e !== undefined) return { value: true, detail: `${e.at}: ${p.module} exports ${p.symbol}` };
      if (f.exports.some((x) => x.module === p.module && x.symbol === "*")) return { reason: `star-export: ${p.module} re-exports with *, which is not followed` };
      return { value: false, detail: `${p.module} exports no ${p.symbol}` };
    }
    case "inherits": {
      const classes = new Map<string, { base?: string; at: string }[]>();
      for (const d of f.declares.filter((x) => x.declares === "class")) classes.set(d.symbol, [...(classes.get(d.symbol) ?? []), { ...(d.base !== undefined ? { base: d.base } : {}), at: d.at }]);
      const chain: string[] = [];
      let name = p.cls;
      for (;;) {
        const found = classes.get(name);
        if (found === undefined) {
          if (name === p.cls) return { reason: `no-class: ${p.cls}` };
          if (BUILT_IN_BASES.has(name)) return { value: false, detail: `${chain.join(" -> ")} ends at ${name}` };
          return { reason: `base-not-read: ${name}` };
        }
        const bases = new Set(found.map((x) => x.base ?? ""));
        if (bases.size > 1) return { reason: `ambiguous-class: ${name} is declared ${found.length} times` };
        chain.push(`${name} (${found[0]!.at})`);
        const base = found[0]!.base?.split(".").pop();
        if (base === undefined) return { value: false, detail: `${chain.join(" -> ")} extends nothing` };
        if (base === p.base) return { value: true, detail: `${chain.join(" -> ")} -> ${base}` };
        if (chain.length > 64) return { reason: `cycle: ${name}` };
        name = base;
      }
    }
    case "field": {
      const in_ = f.fields.filter((x) => x.file === p.file);
      if (in_.length === 0) return notRead(p.file);
      const at = in_.find((x) => x.path === p.pointer);
      if (at === undefined) return { value: false, detail: `${p.file} has no value at ${p.pointer}` };
      return { value: at.value === p.value, detail: `${p.file} holds ${JSON.stringify(at.value)} at ${p.pointer}` };
    }
    case "count": {
      const in_ = f.fields.filter((x) => x.file === p.file);
      if (in_.length === 0) return notRead(p.file);
      const prefix = `${p.pointer}/`;
      const except = new Set(p.except ?? []);
      const keys = [...new Set(in_.filter((x) => x.path.startsWith(prefix)).map((x) => unescape(x.path.slice(prefix.length).split("/")[0]!)))].filter((k) => !except.has(k)).sort(compareCodePoints);
      return { value: keys.length === p.n, detail: `${p.file} has ${keys.length} entries at ${p.pointer}${except.size > 0 ? ` less ${[...except].join(", ")}` : ""}` };
    }
    case "script": {
      const in_ = f.fields.filter((x) => x.file === "package.json");
      if (in_.length === 0) return notRead("package.json");
      const has = in_.some((x) => x.path === `/scripts/${esc(p.name)}`);
      return { value: has, detail: has ? `package.json names the script ${p.name}` : `package.json names no script ${p.name}` };
    }
    case "same": {
      const valueOf = (c: { module: string; name: string }): { value: string; at: string } | { reason: string } => {
        if (!f.modules.has(c.module)) return notRead(c.module);
        const d = f.declares.find((x) => x.module === c.module && x.symbol === c.name && x.declares === "const");
        if (d === undefined) return { reason: `no-constant: ${c.module} ${c.name}` };
        return d.value !== undefined ? { value: d.value, at: d.at } : { reason: `not-a-literal: ${d.at}` };
      };
      const a = valueOf(p.a);
      const b = valueOf(p.b);
      if ("reason" in a) return a;
      if ("reason" in b) return b;
      return { value: a.value === b.value, detail: `${a.at}: ${p.a.name} is ${JSON.stringify(a.value)}; ${b.at}: ${p.b.name} is ${JSON.stringify(b.value)}` };
    }
    case "atom":
      return { reason: `no fact decides ${p.name}` };
  }
}

/** A claim against the facts: it holds when the proposition's truth is what the claim says. */
export function evaluateClaim(c: Claim, f: ClaimFacts): ClaimResult {
  const t = truthOf(c.p, f);
  if ("reason" in t) return { result: "unknown", reason: t.reason };
  return t.value === c.holds ? { result: "holds", detail: t.detail } : { result: "refuted", detail: t.detail };
}

/** What a proposition is about, without the value it asserts: two claims about the same thing share it. */
function subjectOf(p: Prop): string {
  if (p.k === "field") return JSON.stringify(["field", p.file, p.pointer]);
  if (p.k === "count") return JSON.stringify(["count", p.file, p.pointer, [...(p.except ?? [])].sort(compareCodePoints)]);
  return JSON.stringify(p);
}

/** The proposition in words, for a reason. */
export function describeProp(p: Prop): string {
  switch (p.k) {
    case "file":
      return `${p.path} exists`;
    case "declares":
      return `${p.module} declares ${p.symbol}`;
    case "exports":
      return `${p.module} exports ${p.symbol}`;
    case "inherits":
      return `${p.cls} extends ${p.base}`;
    case "field":
      return `${p.file} ${p.pointer} is ${JSON.stringify(p.value)}`;
    case "count":
      return `${p.file} ${p.pointer} has ${p.n} entries`;
    case "script":
      return `the script ${p.name} exists`;
    case "same":
      return `${p.a.module} ${p.a.name} equals ${p.b.module} ${p.b.name}`;
    case "atom":
      return p.name;
  }
}

export const describeClaim = (c: Claim): string => `${c.holds ? "" : "not: "}${describeProp(c.p)}`;

/** Why two claims cannot both be true, or undefined when they can. */
export function claimConflict(a: Claim, b: Claim): string | undefined {
  if (subjectOf(a.p) !== subjectOf(b.p)) return undefined;
  if (a.p.k === "field" || a.p.k === "count") {
    const va = a.p.k === "field" ? a.p.value : a.p.n;
    const vb = b.p.k === "field" ? b.p.value : b.p.k === "count" ? b.p.n : undefined;
    if (a.holds && b.holds && va !== vb) return `one says ${describeClaim(a)}, the other ${describeClaim(b)}`;
    if (a.holds !== b.holds && va === vb) return `one says ${describeClaim(a)}, the other ${describeClaim(b)}`;
    return undefined;
  }
  return a.holds !== b.holds ? `one says ${describeClaim(a)}, the other ${describeClaim(b)}` : undefined;
}
