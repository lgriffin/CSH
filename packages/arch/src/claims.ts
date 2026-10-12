// Structural claims (Ingesting a codebase, stage 24): a proposition about the code that a source asserts, judged by
// looking it up in the facts. Nothing is solved. A claim the facts refute is a fact-conflict; two claims that cannot
// both be true are a claim-conflict, whatever the facts say. A fact that is missing leaves a claim unknown, never
// refuted: a module that was not read says nothing about what it declares.
import { type Claim, compareCodePoints, matchesGlobs, type Prop } from "@csh/kernel";

/** The facts a claim is judged by, all taken at the commit under evaluation. */
export interface ClaimFacts {
  /** Every module read, by path. */
  modules: Set<string>;
  declares: { module: string; symbol: string; declares: string; base?: string; value?: string; members?: string[]; total?: string[]; at: string }[];
  exports: { module: string; symbol: string; at: string }[];
  fields: { file: string; path: string; value: string; at: string }[];
  /** The files the repository tracks; undefined when not known. */
  files?: Set<string>;
  /** The language of each module read in a language other than TypeScript or JavaScript (stage 29). */
  languages?: Map<string, string>;
  /** Source files a reader could not read (stage 29), which a count over modules cannot count (stage 39). */
  unread?: string[];
}

/**
 * Where in the code a result was decided: a file, or a file and line, and for a manifest field the value it holds
 * (stage 25). History dates it, so that prose older than the code it contradicts can be told from prose that was wrong
 * when written.
 */
export interface ClaimEvidence {
  at: string;
  text?: string;
}

export type ClaimResult = { result: "holds"; detail: string; evidence?: ClaimEvidence[] } | { result: "refuted"; detail: string; evidence?: ClaimEvidence[] } | { result: "unknown"; reason: string };

type Truth = { value: boolean; detail: string; evidence?: ClaimEvidence[] } | { reason: string };

/**
 * Classes no source declares, by language, each with the built-in class it extends (null for a root). A chain that
 * reaches one goes on through its built-in ancestors and ends at the root: they extend nothing else a claim could name.
 * A name is built in only for the language of the class that extends it, so a TypeScript class extending an imported
 * `Exception` is not taken for Python's (stage 29).
 */
const BUILT_IN_BASES: Record<string, Record<string, string | null>> = {
  javascript: { Object: null, Error: "Object", TypeError: "Error", RangeError: "Error", SyntaxError: "Error", ReferenceError: "Error", AggregateError: "Error", Array: "Object", Map: "Object", Set: "Object", Promise: "Object", EventTarget: "Object" },
  python: {
    object: null,
    BaseException: "object",
    Exception: "BaseException",
    ArithmeticError: "Exception",
    AttributeError: "Exception",
    LookupError: "Exception",
    KeyError: "LookupError",
    IndexError: "LookupError",
    OSError: "Exception",
    IOError: "OSError",
    RuntimeError: "Exception",
    NotImplementedError: "RuntimeError",
    TypeError: "Exception",
    ValueError: "Exception",
    dict: "object",
    list: "object",
    tuple: "object",
    set: "object",
    str: "object",
    int: "object",
  },
  java: {
    Object: null,
    Throwable: "Object",
    Exception: "Throwable",
    Error: "Throwable",
    RuntimeException: "Exception",
    IllegalArgumentException: "RuntimeException",
    IllegalStateException: "RuntimeException",
    UnsupportedOperationException: "RuntimeException",
    IOException: "Exception",
    Enum: "Object",
    Record: "Object",
  },
};

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
      return d !== undefined ? { value: true, detail: `${d.at}: ${p.module} declares ${p.symbol}`, evidence: [{ at: d.at }] } : { value: false, detail: `${p.module} declares no ${p.symbol}` };
    }
    case "exports": {
      if (!f.modules.has(p.module)) return notRead(p.module);
      const e = f.exports.find((x) => x.module === p.module && x.symbol === p.symbol);
      if (e !== undefined) return { value: true, detail: `${e.at}: ${p.module} exports ${p.symbol}`, evidence: [{ at: e.at }] };
      if (f.exports.some((x) => x.module === p.module && x.symbol === "*")) return { reason: `star-export: ${p.module} re-exports with *, which is not followed` };
      return { value: false, detail: `${p.module} exports no ${p.symbol}` };
    }
    case "inherits": {
      const classes = new Map<string, { base?: string; at: string; module: string }[]>();
      for (const d of f.declares.filter((x) => x.declares === "class")) classes.set(d.symbol, [...(classes.get(d.symbol) ?? []), { ...(d.base !== undefined ? { base: d.base } : {}), at: d.at, module: d.module }]);
      const chain: string[] = [];
      const seen: string[] = [];
      let name = p.cls;
      let language = "javascript";
      for (;;) {
        const found = classes.get(name);
        if (found === undefined) {
          if (name === p.cls) return { reason: `no-class: ${p.cls}` };
          const builtIns = BUILT_IN_BASES[language] ?? {};
          if (!Object.hasOwn(builtIns, name)) return { reason: `base-not-read: ${name}` };
          const evidence = seen.map((at) => ({ at }));
          const ancestors: string[] = [];
          for (let b: string | null = name; b !== null; b = builtIns[b] ?? null) {
            ancestors.push(b);
            if (b === p.base) return { value: true, detail: [...chain, ...ancestors].join(" -> "), evidence };
          }
          return { value: false, detail: `${chain.join(" -> ")} ends at ${ancestors.join(" -> ")}`, evidence };
        }
        // Declarations are matched by name, not by binding: a name declared twice could be either class.
        if (found.length > 1) return { reason: `ambiguous-class: ${name} is declared ${found.length} times` };
        chain.push(`${name} (${found[0]!.at})`);
        seen.push(found[0]!.at);
        language = f.languages?.get(found[0]!.module) ?? "javascript";
        const base = found[0]!.base;
        if (base === undefined) return { value: false, detail: `${chain.join(" -> ")} extends nothing`, evidence: seen.map((at) => ({ at })) };
        // A qualified or computed base names a class through a binding that is not followed.
        if (!/^[A-Za-z_$][\w$]*$/.test(base)) return { reason: `qualified-base: ${name} extends ${base}` };
        if (base === p.base) return { value: true, detail: `${chain.join(" -> ")} -> ${base}`, evidence: seen.map((at) => ({ at })) };
        if (chain.length > 64) return { reason: `cycle: ${name}` };
        name = base;
      }
    }
    case "field": {
      const in_ = f.fields.filter((x) => x.file === p.file);
      if (in_.length === 0) return notRead(p.file);
      const at = in_.find((x) => x.path === p.pointer);
      // No fact at the pointer says nothing: a file may be read in part, as package.json is (A-108).
      if (at === undefined) return { reason: `not-read: ${p.file} ${p.pointer}` };
      return { value: at.value === p.value, detail: `${p.file} holds ${JSON.stringify(at.value)} at ${p.pointer}`, evidence: [{ at: p.file, text: at.value }] };
    }
    case "count": {
      const in_ = f.fields.filter((x) => x.file === p.file);
      if (in_.length === 0) return notRead(p.file);
      const prefix = `${p.pointer}/`;
      // A container is known from its leaves, or from its own fact when it is empty (A-108).
      if (!in_.some((x) => x.path === p.pointer || x.path.startsWith(prefix))) return { reason: `not-read: ${p.file} ${p.pointer}` };
      const except = new Set(p.except ?? []);
      const keys = [...new Set(in_.filter((x) => x.path.startsWith(prefix)).map((x) => unescape(x.path.slice(prefix.length).split("/")[0]!)))].filter((k) => !except.has(k)).sort(compareCodePoints);
      return { value: keys.length === p.n, detail: `${p.file} has ${keys.length} entries at ${p.pointer}${except.size > 0 ? ` less ${[...except].join(", ")}` : ""}` };
    }
    case "count-modules": {
      const sel = `modules(${p.globs.join(", ")})${p.except !== undefined ? ` less ${p.except.join(", ")}` : ""}`;
      const unread = (f.unread ?? []).filter((m) => matchesGlobs(m, p.globs, p.except));
      if (unread.length > 0) return { reason: `not-read: ${unread.slice(0, 3).join(", ")}${unread.length > 3 ? ` and ${unread.length - 3} more` : ""}` };
      const n = [...f.modules].filter((m) => matchesGlobs(m, p.globs, p.except)).length;
      return { value: n === p.n, detail: `${n} modules match ${sel}` };
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
      return { value: a.value === b.value, detail: `${a.at}: ${p.a.name} is ${JSON.stringify(a.value)}; ${b.at}: ${p.b.name} is ${JSON.stringify(b.value)}`, evidence: [{ at: a.at }, { at: b.at }] };
    }
    case "total":
      return totalOf(p, f);
    case "atom":
      return { reason: `no fact decides ${p.name}` };
  }
}

/** What checks a mapping is complete, by the language of the module that holds it (The Assertion Ladder, stage 47). */
const COMPILERS: Record<string, string> = { javascript: "tsc", java: "javac", rust: "rustc" };
/** Languages whose compiler checks no mapping for completeness, with why: the claim is unknown, never refuted. */
const NO_PREVENTION: Record<string, string> = { python: "no-compiler: python checks no mapping for completeness when it runs", go: "no-closed-types: go has no closed type to map completely" };

/**
 * total(module, symbol, over): the declaration maps every member of the closed type `over` in a construct the compiler
 * checks. Unknown when the module was not read, when its language has no such compiler, or when no closed type `over`
 * was read; refuted when the module was read and the declaration is absent, or maps no such type, or `over` is
 * declared and is not closed.
 */
function totalOf(p: Extract<Prop, { k: "total" }>, f: ClaimFacts): Truth {
  if (!f.modules.has(p.module)) return { reason: `not-read: ${p.module}` };
  const language = f.languages?.get(p.module) ?? "javascript";
  const none = NO_PREVENTION[language];
  if (none !== undefined) return { reason: none };
  const compiler = COMPILERS[language] ?? language;
  const d = f.declares.filter((x) => x.module === p.module && x.symbol === p.symbol);
  if (d.length === 0) return { value: false, detail: `${p.module} declares no ${p.symbol}` };
  // A closed type is matched by name; one declared twice could be either, so both must be closed for it to count.
  const types = f.declares.filter((x) => x.symbol === p.over && (f.languages?.get(x.module) ?? "javascript") === language);
  const closed = types.filter((x) => x.members !== undefined);
  const mapping = d.find((x) => (x.total ?? []).includes(p.over));
  if (types.length === 0) return mapping !== undefined ? { reason: `not-read: no closed type ${p.over} was read` } : { value: false, detail: `${d[0]!.at}: ${p.symbol} maps no closed type ${p.over} completely` };
  if (closed.length < types.length) {
    const open = types.find((x) => x.members === undefined)!;
    return { value: false, detail: `${open.at}: ${p.over} is not a closed type, so no mapping over it is complete` };
  }
  if (mapping === undefined) return { value: false, detail: `${d[0]!.at}: ${p.symbol} maps no closed type ${p.over} completely in a form ${compiler} checks`, evidence: [{ at: d[0]!.at }] };
  const t = closed[0]!;
  return { value: true, detail: `${mapping.at}: ${p.symbol} maps every member of ${p.over} (${t.at}: ${t.members!.join(", ")}), and ${compiler} rejects a member left unmapped`, evidence: [{ at: mapping.at }, { at: t.at }] };
}

/** A claim against the facts: it holds when the proposition's truth is what the claim says. */
export function evaluateClaim(c: Claim, f: ClaimFacts): ClaimResult {
  const t = truthOf(c.p, f);
  if ("reason" in t) return { result: "unknown", reason: t.reason };
  const evidence = t.evidence !== undefined ? { evidence: t.evidence } : {};
  return t.value === c.holds ? { result: "holds", detail: t.detail, ...evidence } : { result: "refuted", detail: t.detail, ...evidence };
}

/** What a proposition is about, without the value it asserts: two claims about the same thing share it. */
function subjectOf(p: Prop): string {
  if (p.k === "field") return JSON.stringify(["field", p.file, p.pointer]);
  if (p.k === "count") return JSON.stringify(["count", p.file, p.pointer, [...(p.except ?? [])].sort(compareCodePoints)]);
  if (p.k === "count-modules") return JSON.stringify(["count-modules", [...p.globs].sort(compareCodePoints), [...(p.except ?? [])].sort(compareCodePoints)]);
  // Equality is symmetric: the operands are ordered so that either way round names the same subject.
  if (p.k === "same") return JSON.stringify(["same", ...[p.a, p.b].map((c) => `${c.module}#${c.name}`).sort(compareCodePoints)]);
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
    case "count-modules":
      return `modules(${p.globs.join(", ")}) selects ${p.n} modules`;
    case "script":
      return `the script ${p.name} exists`;
    case "same":
      return `${p.a.module} ${p.a.name} equals ${p.b.module} ${p.b.name}`;
    case "total":
      return `${p.module} ${p.symbol} maps every member of ${p.over}`;
    case "atom":
      return p.name;
  }
}

export const describeClaim = (c: Claim): string => `${c.holds ? "" : "not: "}${describeProp(c.p)}`;

/** Why two claims cannot both be true, or undefined when they can. */
export function claimConflict(a: Claim, b: Claim): string | undefined {
  if (subjectOf(a.p) !== subjectOf(b.p)) return undefined;
  if (a.p.k === "field" || a.p.k === "count" || a.p.k === "count-modules") {
    const va = a.p.k === "field" ? a.p.value : a.p.n;
    const vb = b.p.k === "field" ? b.p.value : b.p.k === "count" || b.p.k === "count-modules" ? b.p.n : undefined;
    if (a.holds && b.holds && va !== vb) return `one says ${describeClaim(a)}, the other ${describeClaim(b)}`;
    if (a.holds !== b.holds && va === vb) return `one says ${describeClaim(a)}, the other ${describeClaim(b)}`;
    return undefined;
  }
  return a.holds !== b.holds ? `one says ${describeClaim(a)}, the other ${describeClaim(b)}` : undefined;
}
