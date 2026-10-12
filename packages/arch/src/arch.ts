// Architecture rules against a container diagram and dependency facts (Next layers, section 4.3). No solver is
// involved: the elements are a finite set and every comparison is a set comparison, so every result is exact. This
// package is in the trusted base, since it produces verdicts.
import { type ArchRule, type ArchSel, compareCodePoints, globRegExp, matchesGlobs } from "@csh/kernel";

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
  /** Packages of the workspace; the source files a modules selector reads are not among them (stage 23). */
  packages: string[];
  depends: ArchDependency[];
  /** Modules read, for telling a rule whose subject selects nothing (a typo, a moved directory) from one that holds. */
  modules?: string[];
  /** Source files a reader could not read, such as a file in a language with no reader (stage 29). */
  unread?: string[];
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
  const sels = rule.k === "forbid" ? [rule.from, rule.to] : rule.k === "only" ? [rule.from, ...rule.to] : rule.k === "acyclic" ? [rule.within] : [];
  return sels.filter((s): s is Extract<ArchSel, { k: "container" }> => s.k === "container" && !(d?.elements.some((e) => e.id === s.id) ?? false)).map((s) => s.id);
}

/** Whether a selector selects a package of the facts. */
export function selects(sel: ArchSel, pkgName: string, d: ArchDiagram | undefined): boolean {
  if (sel.k === "any") return true;
  if (sel.k === "package") return sameName(sel.name, pkgName);
  if (sel.k === "modules") return matchesGlobs(pkgName, sel.globs, sel.except) || coversMembers(pkgName, sel.globs, sel.except ?? []);
  return containersOf(d, pkgName).includes(sel.id);
}

/**
 * A dotted name covers its members: `java.sql.*` and `java.sql.**` select the dependency `java.sql`, which is all the
 * facts know of an import of `java.sql.SQLException` (A-171). A path, which holds a `/`, is never a member of another.
 */
function coversMembers(name: string, globs: readonly string[], except: readonly string[]): boolean {
  if (name.includes("/")) return false;
  const covering = (g: string) => g === `${name}.*` || g === `${name}.**`;
  return globs.some(covering) && !except.some((g) => covering(g) || globRegExp(g).test(name));
}

/** A dependency target that is no module read: a package or library, named as its ecosystem names it. */
function isExternal(facts: ArchFacts, name: string): boolean {
  return facts.modules !== undefined && !facts.modules.includes(name) && !(facts.unread ?? []).includes(name);
}

/** The reason a rule is unknown for globs finer than the facts: each name, its globs and its first dependencies. */
function finerReason(deps: ArchDependency[], globsOf: (x: ArchDependency) => string[]): string {
  const names = [...new Set(deps.map((x) => x.to))].sort(compareCodePoints);
  return names
    .map((n) => {
      const on = deps.filter((x) => x.to === n);
      const at = on.slice(0, 3).map((x) => x.at).join(", ") + (on.length > 3 ? ` and ${on.length - 3} more` : "");
      return `finer-than-facts: modules(${[...new Set(globsOf(on[0]!))].join(", ")}) names part of ${n}, which the facts record whole (${at})`;
    })
    .join("; ");
}

/** The literal text of a glob before its first wildcard. */
const headOf = (glob: string): string => glob.split(/[*?]/, 1)[0]!;

/**
 * The selector's globs that name part of the external name `name` (A-172): their text before the first wildcard
 * starts with `name.`, so a dependency the facts record as `name` whole may or may not be on that part.
 */
function finerGlobs(sel: ArchSel, name: string): string[] {
  if (sel.k !== "modules" || name.includes("/")) return [];
  return sel.globs.filter((g) => headOf(g).startsWith(`${name}.`));
}

/** Whether a selector selects a name written in the diagram, inside element `elementId`. */
function selectsWritten(sel: ArchSel, name: string, elementId: string, d: ArchDiagram): boolean {
  if (sel.k === "any") return true;
  if (sel.k === "package") return sameName(sel.name, name);
  if (sel.k === "modules") return matchesGlobs(name, sel.globs, sel.except);
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

/**
 * A rule's result. A violation lists the dependencies that break it; for `reaches` and `acyclic` each chain or cycle is
 * one entry of `chains`, its dependencies in order (stage 39). A rule that holds may carry notes, such as a target
 * that selects nothing.
 */
export type RuleResult = { result: "violated"; by: ArchDependency[]; chains?: ArchDependency[][] } | { result: "holds"; notes?: string[] } | { result: "unknown"; reason: string };

/** A selector as a person wrote it, for a reason. */
export function describeSel(sel: ArchSel): string {
  if (sel.k === "any") return "anything";
  if (sel.k === "package") return `pkg(${sel.name})`;
  if (sel.k === "modules") return `modules(${sel.globs.join(", ")})`;
  return `container(${sel.id})`;
}

/** The dependencies a rule over `sel` counts: with `values`, not those that import types alone (stage 39). */
const counted = (sel: ArchSel, deps: ArchDependency[]) => (sel.k === "modules" && sel.values === true ? deps.filter((x) => !x.typeOnly) : deps);

/**
 * Every shortest chain of dependencies from a module `from` selects to one `to` selects, one per pair of start and
 * end, shortest first; and the unread modules the chains could pass through. Breadth first from each start, so each
 * chain found is a shortest one.
 */
function chainsOf(from: ArchSel, to: ArchSel, deps: ArchDependency[], unread: Set<string>, d: ArchDiagram | undefined): { chains: ArchDependency[][]; unreadReached: string[] } {
  const out = new Map<string, ArchDependency[]>();
  const next = new Map<string, ArchDependency[]>();
  for (const x of deps) if (x.from !== x.to) next.set(x.from, [...(next.get(x.from) ?? []), x]);
  for (const list of next.values()) list.sort((a, b) => compareCodePoints(a.to, b.to) || compareCodePoints(a.at, b.at));
  const starts = [...new Set(deps.map((x) => x.from))].filter((m) => selects(from, m, d)).sort(compareCodePoints);
  const unreadReached = new Set<string>();
  for (const start of starts) {
    const via = new Map<string, ArchDependency>();
    const seen = new Set([start]);
    let frontier = [start];
    while (frontier.length > 0) {
      const after: string[] = [];
      for (const m of frontier) {
        for (const x of next.get(m) ?? []) {
          if (seen.has(x.to)) continue;
          seen.add(x.to);
          via.set(x.to, x);
          if (unread.has(x.to)) unreadReached.add(x.to);
          if (selects(to, x.to, d)) {
            const chain: ArchDependency[] = [];
            for (let at: string | undefined = x.to; at !== undefined && at !== start; at = via.get(at)?.from) chain.unshift(via.get(at)!);
            out.set(`${start}->${x.to}`, chain);
          }
          after.push(x.to);
        }
      }
      frontier = after;
    }
  }
  const chains = [...out.values()].sort((a, b) => a.length - b.length || compareCodePoints(a[0]!.from, b[0]!.from) || compareCodePoints(a.at(-1)!.to, b.at(-1)!.to));
  return { chains, unreadReached: [...unreadReached].sort(compareCodePoints) };
}

/**
 * Each cycle of dependencies among the modules `within` selects, or between the groups `group` makes of them, once,
 * from its least member. Found by Tarjan's strongly connected components, then one shortest cycle through the least
 * member of each component.
 */
function cyclesOf(within: ArchSel, group: string | undefined, deps: ArchDependency[], d: ArchDiagram | undefined): ArchDependency[][] {
  const groupRe = group === undefined ? undefined : new RegExp(`^${globSource(group)}(?=/)`);
  const node = (m: string): string | undefined => {
    if (!selects(within, m, d)) return undefined;
    if (groupRe === undefined) return m;
    return groupRe.exec(m)?.[0];
  };
  // Edges between nodes, each kept with the dependency that makes it (the first by file and line).
  const edges = new Map<string, Map<string, ArchDependency>>();
  for (const x of [...deps].sort((a, b) => compareCodePoints(a.at, b.at))) {
    const a = node(x.from);
    const b = node(x.to);
    if (a === undefined || b === undefined || a === b) continue;
    const m = edges.get(a) ?? new Map<string, ArchDependency>();
    if (!m.has(b)) m.set(b, x);
    edges.set(a, m);
  }
  const out = (v: string) => [...(edges.get(v) ?? new Map<string, ArchDependency>())].sort((p, q) => compareCodePoints(p[0], q[0]));
  const nodes = [...new Set([...edges.keys(), ...[...edges.values()].flatMap((m) => [...m.keys()])])].sort(compareCodePoints);
  // Tarjan's algorithm.
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const on = new Set<string>();
  const comps: string[][] = [];
  const visit = (v: string) => {
    idx.set(v, index);
    low.set(v, index++);
    stack.push(v);
    on.add(v);
    for (const [w] of out(v)) {
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      for (;;) {
        const w = stack.pop()!;
        on.delete(w);
        comp.push(w);
        if (w === v) break;
      }
      if (comp.length > 1) comps.push(comp.sort(compareCodePoints));
    }
  };
  for (const v of nodes) if (!idx.has(v)) visit(v);
  const cycles: ArchDependency[][] = [];
  for (const comp of comps) {
    const inComp = new Set(comp);
    const start = comp[0]!;
    // The shortest path from the start back to itself inside the component, breadth first.
    const back = new Map<string, { prev: string; dep: ArchDependency }>();
    let frontier = [start];
    let closing: { prev: string; dep: ArchDependency } | undefined;
    while (frontier.length > 0 && closing === undefined) {
      const after: string[] = [];
      for (const v of frontier) {
        for (const [w, dep] of out(v)) {
          if (!inComp.has(w)) continue;
          if (w === start) closing ??= { prev: v, dep };
          else if (!back.has(w)) {
            back.set(w, { prev: v, dep });
            after.push(w);
          }
        }
        if (closing !== undefined) break;
      }
      frontier = after;
    }
    const cycle: ArchDependency[] = [closing!.dep];
    for (let at = closing!.prev; at !== start; at = back.get(at)!.prev) cycle.unshift(back.get(at)!.dep);
    cycles.push(cycle);
  }
  return cycles.sort((a, b) => compareCodePoints(a[0]!.from, b[0]!.from));
}

/** A glob as the source of a regular expression, unanchored. */
function globSource(glob: string): string {
  return globRegExp(glob).source.replace(/^\^/, "").replace(/\$$/, "");
}

/** A rule against current facts. `closed` needs the diagram it names. */
export function evaluateRule(rule: ArchRule, facts: ArchFacts, d: ArchDiagram | undefined): RuleResult {
  const missing = unknownContainers(rule, d);
  if (missing.length > 0) return { result: "unknown", reason: `unknown-container: ${missing.join(", ")}` };
  // A rule over nothing holds of nothing: when its subject selects no module, package or file the facts know, the rule
  // is a typo or points at a directory that moved, and "holds" would say a thing about code it never looked at.
  // (What a forbid names as the target, or an only allows, may well be absent: that is the rule being kept.)
  if ((rule.k === "forbid" || rule.k === "only" || rule.k === "acyclic") && facts.modules !== undefined) {
    const subject = rule.k === "acyclic" ? rule.within : rule.from;
    const universe = [...facts.modules, ...facts.packages, ...facts.depends.map((x) => x.from), ...(facts.unread ?? [])];
    if (!universe.some((m) => selects(subject, m, d))) return { result: "unknown", reason: `selects-nothing: ${describeSel(subject)} matches none of ${facts.modules.length} modules read` };
  }
  const notRead = (unread: string[]): RuleResult => ({ result: "unknown", reason: `not-read: ${unread.slice(0, 3).join(", ")}${unread.length > 3 ? ` and ${unread.length - 3} more` : ""}` });
  let by: ArchDependency[];
  let unreadReached: string[] = [];
  if (rule.k === "forbid" && rule.reaches === true) {
    const deps = counted(rule.from, facts.depends);
    // Once past the first step a chain is no longer the subject's own, so values: true applies to every step.
    const r = chainsOf(rule.from, rule.to, rule.from.k === "modules" && rule.from.values === true ? deps : facts.depends, new Set(facts.unread ?? []), d);
    unreadReached = r.unreadReached;
    if (r.chains.length > 0) return { result: "violated", by: r.chains.flat(), chains: r.chains };
    by = [];
  } else if (rule.k === "forbid") {
    by = counted(rule.from, facts.depends).filter((x) => x.from !== x.to && selects(rule.from, x.from, d) && selects(rule.to, x.to, d));
  } else if (rule.k === "only") {
    const offending = counted(rule.from, facts.depends).filter((x) => selects(rule.from, x.from, d) && !selects(rule.from, x.to, d) && !rule.to.some((t) => selects(t, x.to, d)));
    // An offending dependency on an external name that an allowed glob names part of may be on the allowed part.
    const finer = offending.filter((x) => isExternal(facts, x.to) && rule.to.some((t) => finerGlobs(t, x.to).length > 0));
    by = offending.filter((x) => !finer.includes(x));
    if (by.length === 0 && finer.length > 0) return { result: "unknown", reason: finerReason(finer, (x) => rule.to.flatMap((t) => finerGlobs(t, x.to))) };
  } else if (rule.k === "acyclic") {
    const cycles = cyclesOf(rule.within, rule.group, counted(rule.within, facts.depends), d);
    if (cycles.length > 0) return { result: "violated", by: cycles.flat(), chains: cycles };
    const unread = (facts.unread ?? []).filter((m) => selects(rule.within, m, d));
    return unread.length > 0 ? notRead(unread) : { result: "holds" };
  } else if (rule.k === "claim") {
    return { result: "unknown", reason: "a claim is judged by evaluateClaim" };
  } else {
    if (d === undefined) return { result: "unknown", reason: `no-diagram: ${rule.source}` };
    by = [...undrawnDependencies(d, facts).values()].flat();
  }
  if (by.length > 0) return { result: "violated", by };
  // A file that was not read could depend on anything: a rule over it cannot hold, though what was read can violate it.
  if (rule.k === "forbid" || rule.k === "only") {
    const unread = [...new Set([...(facts.unread ?? []).filter((m) => selects(rule.from, m, d)), ...unreadReached])].sort(compareCodePoints);
    if (unread.length > 0) return notRead(unread);
  }
  // A forbidden target that names part of an external name a selected module depends on: the facts record the name
  // whole, so whether the code uses that part is not known (A-172).
  if (rule.k === "forbid") {
    const finer = counted(rule.from, facts.depends).filter((x) => x.from !== x.to && selects(rule.from, x.from, d) && isExternal(facts, x.to) && finerGlobs(rule.to, x.to).length > 0);
    if (finer.length > 0) return { result: "unknown", reason: finerReason(finer, (x) => finerGlobs(rule.to, x.to)) };
  }
  // A forbidden target that selects nothing the facts know: nothing can depend on it, so the rule holds, and says so,
  // since a mistyped path and a package that is legitimately absent read the same.
  if (rule.k === "forbid" && facts.modules !== undefined) {
    const known = [...facts.modules, ...facts.packages, ...facts.depends.map((x) => x.to), ...(facts.unread ?? [])];
    if (!known.some((m) => selects(rule.to, m, d))) return { result: "holds", notes: [`target-selects-nothing: ${describeSel(rule.to)} matches no module, package or dependency of the facts`] };
  }
  return { result: "holds" };
}

/**
 * Relations the diagram draws that the rule forbids: each element of the relation must be wholly inside what the rule
 * names, so that the arrow cannot be read as some other package's dependency. A `closed` rule never conflicts with
 * its own diagram.
 */
export function conflictingRelations(rule: ArchRule, d: ArchDiagram): ArchDiagram["relations"] {
  if (rule.k === "closed" || rule.k === "claim" || rule.k === "acyclic") return [];
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

/** A chain or cycle as one reason: each step's file and line, in order. */
export function describeChain(chain: ArchDependency[]): string {
  return `${chain.length === 1 ? "" : `${chain.length} steps: `}${chain.map(describeDependency).join(", then ")}`;
}
