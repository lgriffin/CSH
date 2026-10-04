// Architecture obligations (Next layers, section 4.3): typed rules against the diagram of an Architecture source and
// the facts of a Facts source. The comparisons are in @csh/arch; this file finds the inputs in the adapter output,
// decides whether the facts are current, and turns the results into findings, gaps and per-rule results.
import { type ArchDiagram, type ArchFacts, conflictingRelations, describeDependency, evaluateRule, type RuleResult, undrawnDependencies, unobservedRelations, unplacedPackages } from "@csh/arch";
import { type ArchRule, compareCodePoints, digestJson, type Fragment, isArchRule } from "@csh/kernel";
import type { Fact } from "@csh/witness";
import type { Prepared } from "./pool.ts";
import { findingId, sourceColumn } from "./run.ts";
import type { AuthorityInfo, Finding, Gap } from "./types.ts";

export interface ArchRuleOutcome {
  /** current: facts taken at the snapshot's commit; stale: facts only from other commits; none: no facts at all. */
  facts: "current" | "stale" | "none";
  result?: RuleResult;
}

export interface ArchOutcome {
  findings: Finding[];
  gaps: Gap[];
  rules: Map<string, ArchRuleOutcome>;
}

/** The architecture fragments whose value is a typed rule; any other value stays reserved. */
export function archRuleOf(f: Fragment): ArchRule | undefined {
  if (f.kind !== "architecture") return undefined;
  const native = (f.node as { native?: unknown }).native;
  return isArchRule(native) ? native : undefined;
}

export function evaluateArchitecture(input: { prepared: Prepared; fragments: Fragment[]; authority: Map<string, AuthorityInfo>; snapshotCommit?: string; live: (name: string) => boolean }): ArchOutcome {
  const { prepared } = input;
  const system = prepared.module.system;
  const diagrams = new Map<string, ArchDiagram>();
  for (const r of [...prepared.runs].sort((a, b) => compareCodePoints(a.source, b.source))) if (r.output.diagram !== undefined) diagrams.set(r.source, r.output.diagram);
  const primary = [...diagrams.entries()][0];
  const all: Fact[] = prepared.runs.flatMap((r) => r.output.facts ?? []);
  const current = all.filter((f) => input.snapshotCommit !== undefined && f.subject.commit === input.snapshotCommit);
  const factsState: ArchRuleOutcome["facts"] = current.length > 0 ? "current" : all.length > 0 ? "stale" : "none";
  const facts: ArchFacts = {
    packages: current.flatMap((f) => (f.kind === "package" ? [f.name] : [])),
    depends: current.flatMap((f) => (f.kind === "depends" ? [{ from: f.from, to: f.to, at: f.at, typeOnly: f.typeOnly, via: f.via }] : [])),
  };

  const out: ArchOutcome = { findings: [], gaps: [], rules: new Map() };
  const rules = input.fragments.filter((f) => input.live(f.name)).flatMap((f) => {
    const rule = archRuleOf(f);
    return rule === undefined ? [] : [{ f, rule }];
  });
  const approved = (name: string) => input.authority.get(name)?.authority === "approved";

  for (const { f, rule } of rules) {
    const o: ArchRuleOutcome = { facts: factsState };
    if (factsState === "current") o.result = evaluateRule(rule, facts, rule.k === "closed" ? diagrams.get(rule.source) : primary?.[1]);
    out.rules.set(f.name, o);
    // A rule and the diagram: a drawn relation the rule forbids. Each reads correctly alone.
    if (primary === undefined) continue;
    const [diagramSource, diagram] = primary;
    for (const rel of conflictingRelations(rule, diagram)) {
      const relName = `${system}/@${diagramSource}/${rel.from}->${rel.to}`;
      const names = [f.name, relName].sort(compareCodePoints);
      const members = names.map((n) =>
        n === f.name
          ? { fragment: f.name, source: f.source, authority: input.authority.get(f.name)?.authority ?? "candidate", digest: f.digest }
          : { fragment: relName, source: diagramSource, authority: "candidate", digest: digestJson({ from: rel.from, to: rel.to }) },
      );
      out.findings.push({
        id: findingId("arch-conflict", names),
        kind: "arch-conflict",
        scope: "specification",
        members,
        context: [],
        crossSource: sourceColumn(f) !== diagramSource,
        collisionTerms: [],
        reason: `${rel.span}: the diagram draws ${rel.from} -> ${rel.to}, which ${f.name} forbids`,
        query: `Q-ARCH(${f.local})`,
      });
    }
  }

  // The diagram and the facts. An approved closed rule on the diagram turns an undrawn dependency into its violation.
  if (primary !== undefined && factsState === "current") {
    const [diagramSource, diagram] = primary;
    const closedRules = rules.filter((r) => r.rule.k === "closed" && r.rule.source === diagramSource).map((r) => r.f.name);
    if (!closedRules.some(approved)) {
      for (const [subject, deps] of undrawnDependencies(diagram, facts)) out.gaps.push({ kind: "undrawn-dependency", subject, fragments: closedRules, detail: `${deps.map(describeDependency).join("; ")}: no relation is drawn` });
    }
    for (const rel of unobservedRelations(diagram, facts)) out.gaps.push({ kind: "unobserved-relation", subject: `${rel.from}->${rel.to}`, fragments: [], detail: `${rel.span}: drawn, and no import or manifest shows it` });
    for (const p of unplacedPackages(diagram, facts)) {
      const at = current.find((x) => x.kind === "package" && x.name === p)?.at ?? p;
      out.gaps.push({ kind: "unplaced-package", subject: p, fragments: [], detail: `${at}: no container of ${diagramSource} holds it` });
    }
  }
  return out;
}

