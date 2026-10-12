// Architecture obligations (Next layers, section 4.3): typed rules against the diagram of an Architecture source and
// the facts of a Facts source. The comparisons are in @csh/arch; this file finds the inputs in the adapter output,
// decides whether the facts are current, and turns the results into findings, gaps and per-rule results.
import { type ArchDiagram, type ArchFacts, claimConflict, type ClaimFacts, type ClaimResult, conflictingRelations, describeClaim, describeDependency, evaluateClaim, evaluateRule, type RuleResult, undrawnDependencies, unobservedRelations, unplacedPackages } from "@csh/arch";
import { type ArchRule, type Claim, compareCodePoints, digestJson, type Fragment, isArchRule } from "@csh/kernel";
import type { Fact } from "@csh/witness";
import type { Prepared } from "./pool.ts";
import { findingId, sourceColumn } from "./run.ts";
import type { AuthorityInfo, Dated, Finding, Gap, HistoryPort } from "./types.ts";

export interface ArchRuleOutcome {
  /** current: facts taken at the snapshot's commit; stale: facts only from other commits; none: no facts at all. */
  facts: "current" | "stale" | "none";
  result?: RuleResult;
  /** A structural claim's result against the facts (stage 24). */
  claim?: ClaimResult;
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

/** The facts taken at the snapshot's commit, or, for a subject, at its pinned commit (stage 23): the only current ones. */
export function currentFacts(all: Fact[], snapshotCommit: string | undefined, subjectCommit: string | undefined): Fact[] {
  return all.filter((f) => (snapshotCommit !== undefined && f.subject.commit === snapshotCommit) || (subjectCommit !== undefined && f.subject.commit === subjectCommit));
}

const SPAN = /^(.*):(\d+)$/;
const short = (d: Dated) => `${d.commit.slice(0, 12)}, ${d.date.slice(0, 10)}`;

/**
 * Whether a refuted claim's sentence is older than the code that refutes it (stage 25): the sentence was true, or
 * meant to be, when written, and the code moved on. Undefined when the sentence is the newer, or history cannot date
 * either side: the prose was then wrong when written, and the fact-conflict says all there is.
 */
function staleClaim(claim: Claim, evidence: { at: string; text?: string }[], h: HistoryPort): string | undefined {
  const prose = claim.at === undefined ? null : SPAN.exec(claim.at);
  if (prose === null) return undefined;
  const written = h.lineOrigin(prose[1]!, Number(prose[2]));
  if (written === undefined) return undefined;
  let code: { at: string; when: Dated } | undefined;
  for (const e of evidence) {
    const line = SPAN.exec(e.at);
    const when = line !== null ? h.lineCommit(line[1]!, Number(line[2])) : e.text !== undefined ? h.introduced(e.at, e.text) : undefined;
    if (when !== undefined && (code === undefined || Date.parse(when.date) > Date.parse(code.when.date))) code = { at: e.at, when };
  }
  if (code === undefined || Date.parse(code.when.date) <= Date.parse(written.date)) return undefined;
  return `${claim.at}: first written at ${short(written)}; ${code.at} took the form that refutes it later, at ${short(code.when)}`;
}

export function evaluateArchitecture(input: { prepared: Prepared; fragments: Fragment[]; authority: Map<string, AuthorityInfo>; snapshotCommit?: string; subjectCommit?: string; files?: string[]; live: (name: string) => boolean; history?: HistoryPort }): ArchOutcome {
  const { prepared } = input;
  const system = prepared.module.system;
  const diagrams = new Map<string, ArchDiagram>();
  for (const r of [...prepared.runs].sort((a, b) => compareCodePoints(a.source, b.source))) if (r.output.diagram !== undefined) diagrams.set(r.source, r.output.diagram);
  const primary = [...diagrams.entries()][0];
  const all: Fact[] = prepared.runs.flatMap((r) => r.output.facts ?? []);
  // Facts are current when taken at the snapshot's commit, or, for a subject, at the subject's pinned commit (stage 23).
  const current = currentFacts(all, input.snapshotCommit, input.subjectCommit);
  // Only facts that say what the code is (a package or a module) make the graph current: manifest fields or exports alone
  // describe no dependency, and an empty graph from them would satisfy every rule.
  const graph = (f: Fact) => f.kind === "package" || f.kind === "module";
  const factsState: ArchRuleOutcome["facts"] = current.some(graph) ? "current" : all.some(graph) ? "stale" : "none";
  const facts: ArchFacts = {
    packages: current.flatMap((f) => (f.kind === "package" ? [f.name] : [])),
    modules: current.flatMap((f) => (f.kind === "module" ? [f.name] : [])),
    depends: current.flatMap((f) => (f.kind === "depends" ? [{ from: f.from, to: f.to, at: f.at, typeOnly: f.typeOnly, via: f.via, ...(f.namespace === "dotted" ? { dotted: true } : {}) }] : [])),
    // A skipped fact at a file, not a line, is a whole file not read (stage 29).
    unread: current.flatMap((f) => (f.kind === "skipped" && f.at === f.from ? [f.from] : [])).sort(compareCodePoints),
  };

  // Claims are judged by any current fact: a claim about a module or a file that was not read stays unknown by itself.
  const claimState: ArchRuleOutcome["facts"] = current.length > 0 ? "current" : all.length > 0 ? "stale" : "none";
  const claimFacts: ClaimFacts = {
    modules: new Set(current.flatMap((f) => (f.kind === "module" ? [f.name] : []))),
    declares: current.flatMap((f) => (f.kind === "declare" ? [{ module: f.module, symbol: f.symbol, declares: f.declares, at: f.at, ...(f.base !== undefined ? { base: f.base } : {}), ...(f.value !== undefined ? { value: f.value } : {}), ...(f.members !== undefined ? { members: f.members } : {}), ...(f.total !== undefined ? { total: f.total } : {}) }] : [])),
    exports: current.flatMap((f) => (f.kind === "export" ? [{ module: f.module, symbol: f.symbol, at: f.at }] : [])),
    fields: current.flatMap((f) => (f.kind === "field" ? [{ file: f.file, path: f.path, value: f.value, at: f.at }] : [])),
    ...(input.files !== undefined ? { files: new Set(input.files) } : {}),
    languages: new Map(current.flatMap((f) => (f.kind === "module" && f.language !== undefined ? [[f.name, f.language] as const] : []))),
    ...(facts.unread !== undefined ? { unread: facts.unread } : {}),
  };

  const out: ArchOutcome = { findings: [], gaps: [], rules: new Map() };
  const rules = input.fragments.filter((f) => input.live(f.name)).flatMap((f) => {
    const rule = archRuleOf(f);
    return rule === undefined ? [] : [{ f, rule }];
  });
  const approved = (name: string) => input.authority.get(name)?.authority === "approved";

  const member = (f: Fragment) => ({ fragment: f.name, source: f.source, authority: input.authority.get(f.name)?.authority ?? "candidate", digest: f.digest });
  const claims = rules.flatMap((r) => (r.rule.k === "claim" ? [{ f: r.f, claim: r.rule }] : [])).sort((a, b) => compareCodePoints(a.f.name, b.f.name));
  const at = (c: Claim) => (c.at !== undefined ? `${c.at}: ` : "");
  for (const { f, claim } of claims) {
    // Whether a file is tracked is known from the repository itself, without any fact.
    const decidable = claimState === "current" || (claim.p.k === "file" && claimFacts.files !== undefined);
    const o: ArchRuleOutcome = { facts: decidable ? "current" : claimState };
    if (decidable) o.claim = evaluateClaim(claim, claimFacts);
    out.rules.set(f.name, o);
    // A claim the facts refute: the prose and the code disagree.
    if (o.claim?.result === "refuted") {
      out.findings.push({ id: findingId("fact-conflict", [f.name]), kind: "fact-conflict", scope: "implementation", members: [member(f)], context: [], crossSource: false, collisionTerms: [], reason: `${at(claim)}says ${describeClaim(claim)}; ${o.claim.detail}`, query: `Q-CLAIM(${f.local})` });
      const stale = input.history !== undefined ? staleClaim(claim, o.claim.evidence ?? [], input.history) : undefined;
      if (stale !== undefined) out.gaps.push({ kind: "stale-prose", subject: f.name, fragments: [f.name], detail: stale });
    }
  }
  // Two claims that cannot both be true: the sources disagree with each other, whatever the code says.
  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const [a, b] = [claims[i]!, claims[j]!];
      const why = claimConflict(a.claim, b.claim);
      if (why === undefined) continue;
      const names = [a.f.name, b.f.name];
      out.findings.push({ id: findingId("claim-conflict", names), kind: "claim-conflict", scope: "specification", members: [member(a.f), member(b.f)], context: [], crossSource: sourceColumn(a.f) !== sourceColumn(b.f), collisionTerms: [], reason: `${at(a.claim)}${a.f.local} and ${at(b.claim)}${b.f.local}: ${why}`, query: `Q-CLAIM(${a.f.local}, ${b.f.local})` });
    }
  }

  for (const { f, rule } of rules) {
    if (rule.k === "claim") continue;
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

