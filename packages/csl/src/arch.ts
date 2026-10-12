// The architecture builders (Next layers, section 4.1). Each returns plain data, an ArchRule or a selector, that
// s.architecture carries as the obligation's value; the check engine evaluates it against the diagram and the facts.
import type { ArchRule, ArchSel, Prop } from "@csh/kernel";
import type { SourceRef } from "./system.ts";

/** One package, by its name in the manifest or the part after its scope ("kernel" for "@csh/kernel"). */
export function pkg(name: string): ArchSel {
  return { k: "package", name };
}

/** Every package a container of the diagram holds, by the container's identifier. */
export function container(id: string): ArchSel {
  return { k: "container", id };
}

/**
 * Source files by path from the repository root: every file a glob matches and no exception does, such as
 * modules("src/core/**", { except: ["src/core/ports/**"] }). The facts are a code scanner's, file by file (stage 23).
 */
export function modules(globs: string | readonly string[], opts: { except?: string | readonly string[]; values?: boolean } = {}): ArchSel {
  const list = (x: string | readonly string[]) => (typeof x === "string" ? [x] : [...x]);
  // values: as a rule's subject, only dependencies that import a value count, not those of types alone (stage 39).
  return { k: "modules", globs: list(globs), ...(opts.except !== undefined ? { except: list(opts.except) } : {}), ...(opts.values === true ? { values: true as const } : {}) };
}

/** Any package at all. */
export const anything: ArchSel = { k: "any" };

/**
 * No package selected by `from` depends on a package selected by `to`. With `reaches`, not through any chain of
 * dependencies either (stage 39).
 */
export function forbid(from: ArchSel, to: ArchSel, opts: { reaches?: boolean } = {}): ArchRule {
  return opts.reaches === true ? { k: "forbid", from, to, reaches: true } : { k: "forbid", from, to };
}

/**
 * No cycle of dependencies among the modules `within` selects. With `group`, a glob over directories such as
 * "packages/*", modules are grouped by the directory it matches and only a cycle between groups counts (stage 39).
 */
export function acyclic(within: ArchSel, opts: { group?: string } = {}): ArchRule {
  return opts.group === undefined ? { k: "acyclic", within } : { k: "acyclic", within, group: opts.group };
}

/** The packages selected by `from` depend only on those selected by one of `to`, and on each other. */
export function only(from: ArchSel, to: readonly ArchSel[]): ArchRule {
  return { k: "only", from, to: [...to] };
}

/** Every dependency observed between containers is drawn in this diagram source: a missing arrow is a prohibition. */
export function closed(source: SourceRef): ArchRule {
  return { k: "closed", source: source.name };
}

// Propositions for structural claims (stage 24), made into claims by i.claim. Paths are from the repository root.

/** The repository tracks this file. */
export function fileExists(path: string): Prop {
  return { k: "file", path };
}

/** The module declares the name at its top level. */
export function declares(module: string, symbol: string): Prop {
  return { k: "declares", module, symbol };
}

/** The module exports the name. */
export function exportsName(module: string, symbol: string): Prop {
  return { k: "exports", module, symbol };
}

/** The class extends the base, directly or through other classes, by name. */
export function inherits(cls: string, base: string): Prop {
  return { k: "inherits", cls, base };
}

/** The JSON file holds this value at the pointer, such as field("package.json", "/engines/node", ">=22"). */
export function field(file: string, pointer: string, value: string): Prop {
  return { k: "field", file, pointer, value };
}

/**
 * The value at the pointer has n entries, less any excepted by key; or, given a modules selector, the selector selects
 * n modules read (stage 39), such as count(modules("src/usecases/*.ts"), 10).
 */
export function count(file: string, pointer: string, n: number, opts?: { except?: readonly string[] }): Prop;
export function count(sel: ArchSel, n: number): Prop;
export function count(a: string | ArchSel, b: string | number, n?: number, opts: { except?: readonly string[] } = {}): Prop {
  if (typeof a !== "string") {
    if (a.k !== "modules" || typeof b !== "number") throw new Error("count over a selector takes modules(...) and a number");
    return { k: "count-modules", globs: [...a.globs], ...(a.except !== undefined ? { except: [...a.except] } : {}), n: b };
  }
  return opts.except === undefined ? { k: "count", file: a, pointer: b as string, n: n! } : { k: "count", file: a, pointer: b as string, n: n!, except: [...opts.except] };
}

/** package.json names this npm script. */
export function script(name: string): Prop {
  return { k: "script", name };
}

/** A top-level constant of a module, for `same`. */
export function constant(module: string, name: string): { module: string; name: string } {
  return { module, name };
}

/** Two constants have the same literal value. */
export function same(a: { module: string; name: string }, b: { module: string; name: string }): Prop {
  return { k: "same", a, b };
}

/**
 * The declaration maps every member of the closed type `over` in a construct the language's compiler checks, so a new
 * member does not compile until it is mapped (The Assertion Ladder, stage 47): a `Record<Over, V>` constant in
 * TypeScript, a `switch` with no `default` in Java, a `match` with no catch-all arm in Rust.
 */
export function total(module: string, symbol: string, over: string): Prop {
  return { k: "total", module, symbol, over };
}

/** A named proposition no fact decides; two sources can still contradict each other about it. */
export function atom(name: string): Prop {
  return { k: "atom", name };
}
