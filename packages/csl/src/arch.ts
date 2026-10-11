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
export function modules(globs: string | readonly string[], opts: { except?: string | readonly string[] } = {}): ArchSel {
  const list = (x: string | readonly string[]) => (typeof x === "string" ? [x] : [...x]);
  return opts.except === undefined ? { k: "modules", globs: list(globs) } : { k: "modules", globs: list(globs), except: list(opts.except) };
}

/** Any package at all. */
export const anything: ArchSel = { k: "any" };

/** No package selected by `from` depends on a package selected by `to`. */
export function forbid(from: ArchSel, to: ArchSel): ArchRule {
  return { k: "forbid", from, to };
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

/** The value at the pointer has n entries, less any excepted by key. */
export function count(file: string, pointer: string, n: number, opts: { except?: readonly string[] } = {}): Prop {
  return opts.except === undefined ? { k: "count", file, pointer, n } : { k: "count", file, pointer, n, except: [...opts.except] };
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

/** A named proposition no fact decides; two sources can still contradict each other about it. */
export function atom(name: string): Prop {
  return { k: "atom", name };
}
