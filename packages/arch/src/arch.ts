// Architecture rules against a container diagram and dependency facts (Next layers, section 4.3). No solver is
// involved: the elements are a finite set and every comparison is a set comparison, so every result is exact. This
// package is in the trusted base, since it produces verdicts.
import { type ArchRule, type ArchSel, compareCodePoints } from "@csh/kernel";

/** The diagram as this package reads it: elements holding written package names, and relations between them. */
export interface ArchDiagram {
  elements: { id: string; packages: string[]; span: string }[];
  relations: { from: string; to: string; span: string }[];
}

/** One observed dependency between packages. */
export interface ArchDependency {
  from: string;
  to: string;
  at: string;
  typeOnly: boolean;
  via: string;
}

export interface ArchFacts {
  packages: string[];
  depends: ArchDependency[];
}

/** A package name without its scope: "kernel" for "@csh/kernel". */
export function bareName(name: string): string {
  return name.replace(/^@[^/]+\//, "");
}

/** Two package names denote the same package when they are equal once the scope is dropped. */
export function sameName(a: string, b: string): boolean {
  return bareName(a) === bareName(b);
}

/** The elements of the diagram that hold a package, by the names their technology field lists. */
export function containersOf(d: ArchDiagram | undefined, pkgName: string): string[] {
  if (d === undefined) return [];
  return d.elements.filter((e) => e.packages.some((w) => sameName(w, pkgName))).map((e) => e.id);
}

/** Selector identifiers the rule names that the diagram does not have. */
export function unknownContainers(rule: ArchRule, d: ArchDiagram | undefined): string[] {
  const sels = rule.k === "forbid" ? [rule.from, rule.to] : rule.k === "only" ? [rule.from, ...rule.to] : [];
  return sels.filter((s): s is Extract<ArchSel, { k: "container" }> => s.k === "container" && !(d?.elements.some((e) => e.id === s.id) ?? false)).map((s) => s.id);
}

/** Whether a selector selects a package of the facts. */
export function selects(sel: ArchSel, pkgName: string, d: ArchDiagram | undefined): boolean {
  if (sel.k === "any") return true;
  if (sel.k === "package") return sameName(sel.name, pkgName);
  return containersOf(d, pkgName).includes(sel.id);
}

/** Whether a selector selects a name written in the diagram, inside element `elementId`. */
function selectsWritten(sel: ArchSel, name: string, elementId: string, d: ArchDiagram): boolean {
  if (sel.k === "any") return true;
  if (sel.k === "package") return sameName(sel.name, name);
  return elementId === sel.id || containersOf(d, name).includes(sel.id);
}

/** A dependency the facts show between two containers, or within one. */
function containerPairs(d: ArchDiagram, dep: ArchDependency): { from: string[]; to: string[] } {
  return { from: containersOf(d, dep.from), to: containersOf(d, dep.to) };
}

function drawn(d: ArchDiagram, from: string, to: string): boolean {
  return d.relations.some((r) => r.from === from && r.to === to);
}

/** Dependencies between containers that the diagram draws nowhere, grouped by "from->to". */
export function undrawnDependencies(d: ArchDiagram, facts: ArchFacts): Map<string, ArchDependency[]> {
  const out = new Map<string, ArchDependency[]>();
  for (const dep of facts.depends) {
    const p = containerPairs(d, dep);
    if (p.from.length === 0 || p.to.length === 0) continue;
    if (p.from.some((a) => p.to.includes(a))) continue; // within one container
    if (p.from.some((a) => p.to.some((b) => drawn(d, a, b)))) continue;
    const key = `${p.from[0]}->${p.to[0]}`;
    out.set(key, [...(out.get(key) ?? []), dep]);
  }
  return new Map([...out.entries()].sort((a, b) => compareCodePoints(a[0], b[0])));
}

/** The packages of the facts each element holds. */
function holdings(d: ArchDiagram, facts: ArchFacts): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const p of facts.packages) for (const c of containersOf(d, p)) m.set(c, [...(m.get(c) ?? []), p]);
  return m;
}

/**
 * Relations drawn between two elements that both hold packages, which no dependency shows. A relation to a person,
 * an external system or an element whose packages the facts do not list is not compared.
 */
export function unobservedRelations(d: ArchDiagram, facts: ArchFacts): ArchDiagram["relations"] {
  const held = holdings(d, facts);
  return d.relations.filter((r) => {
    const a = held.get(r.from);
    const b = held.get(r.to);
    if (a === undefined || b === undefined || r.from === r.to) return false;
    return !facts.depends.some((dep) => a.some((x) => x === dep.from) && b.some((y) => y === dep.to));
  });
}

/** Packages of the facts that no element of the diagram holds. */
export function unplacedPackages(d: ArchDiagram, facts: ArchFacts): string[] {
  return [...new Set(facts.packages)].filter((p) => containersOf(d, p).length === 0).sort(compareCodePoints);
}

export type RuleResult = { result: "violated"; by: ArchDependency[] } | { result: "holds" } | { result: "unknown"; reason: string };

/** A rule against current facts. `closed` needs the diagram it names. */
export function evaluateRule(rule: ArchRule, facts: ArchFacts, d: ArchDiagram | undefined): RuleResult {
  const missing = unknownContainers(rule, d);
  if (missing.length > 0) return { result: "unknown", reason: `unknown-container: ${missing.join(", ")}` };
  let by: ArchDependency[];
  if (rule.k === "forbid") {
    by = facts.depends.filter((x) => x.from !== x.to && selects(rule.from, x.from, d) && selects(rule.to, x.to, d));
  } else if (rule.k === "only") {
    by = facts.depends.filter((x) => selects(rule.from, x.from, d) && !selects(rule.from, x.to, d) && !rule.to.some((t) => selects(t, x.to, d)));
  } else {
    if (d === undefined) return { result: "unknown", reason: `no-diagram: ${rule.source}` };
    by = [...undrawnDependencies(d, facts).values()].flat();
  }
  return by.length > 0 ? { result: "violated", by } : { result: "holds" };
}

/**
 * Relations the diagram draws that the rule forbids: each element of the relation must be wholly inside what the rule
 * names, so that the arrow cannot be read as some other package's dependency. A `closed` rule never conflicts with
 * its own diagram.
 */
export function conflictingRelations(rule: ArchRule, d: ArchDiagram): ArchDiagram["relations"] {
  if (rule.k === "closed") return [];
  const el = new Map(d.elements.map((e) => [e.id, e]));
  return d.relations.filter((r) => {
    const a = el.get(r.from);
    const b = el.get(r.to);
    if (a === undefined || b === undefined || a.packages.length === 0 || b.packages.length === 0 || a.id === b.id) return false;
    if (!a.packages.every((n) => selectsWritten(rule.from, n, a.id, d))) return false;
    if (rule.k === "forbid") return b.packages.every((n) => selectsWritten(rule.to, n, b.id, d));
    return b.packages.every((n) => !selectsWritten(rule.from, n, b.id, d) && !rule.to.some((t) => selectsWritten(t, n, b.id, d)));
  });
}

/** How a dependency reads as a witness: its file and line, and whether it imports types alone. */
export function describeDependency(x: ArchDependency): string {
  return `${x.at}: ${x.from} -> ${x.to}${x.via === "manifest" ? " (manifest)" : ""}${x.typeOnly ? " (type-only)" : ""}`;
}
