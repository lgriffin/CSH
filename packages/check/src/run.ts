// Steps 3 and 4 of joint evaluation: run the named queries over the pool and turn every
// failing or unknown answer into findings (Joint evaluation, sections 3 and 4).
import { collectRefs, compareCodePoints, digestJson, type Fragment, type Vocabulary, INTENT_SOURCE, MODEL_SOURCE } from "@csh/kernel";
import type { Assumption, Example, Invariant, Requirement, Transition } from "@csh/kernel";
import {
  qEx,
  qFeas,
  qMeet,
  qPres,
  qState,
  qVac,
  type QAssumption,
  type QExample,
  type QInvariant,
  type QRequirement,
  type QTransition,
  type QueryEnv,
  type QueryResult,
} from "@csh/solver";
import type { AuthorityInfo, Finding, FindingKind, Member } from "./types.ts";

export interface Pool {
  vocabulary: Vocabulary;
  assumptions: (QAssumption & { fragment: Fragment })[];
  invariants: (QInvariant & { fragment: Fragment })[];
  requirements: (QRequirement & { fragment: Fragment })[];
  examples: (QExample & { fragment: Fragment })[];
  transitions: (QTransition & { fragment: Fragment })[];
  byName: Map<string, Fragment>;
}

/** Build the solver pool from the fragments in force (retired fragments are excluded). */
export function buildPool(fragments: Fragment[], vocabulary: Vocabulary, authority: Map<string, AuthorityInfo>): Pool {
  const pool: Pool = { vocabulary, assumptions: [], invariants: [], requirements: [], examples: [], transitions: [], byName: new Map() };
  for (const f of fragments) {
    if (authority.get(f.name)?.authority === "retired") continue;
    pool.byName.set(f.name, f);
    switch (f.kind) {
      case "assumption":
        pool.assumptions.push({ id: f.name, body: (f.node as Assumption).body, fragment: f });
        break;
      case "invariant": {
        const n = f.node as Invariant;
        pool.invariants.push({ id: f.name, state: n.state, body: n.body, fragment: f });
        break;
      }
      case "requirement": {
        const n = f.node as Requirement;
        const q: QRequirement & { fragment: Fragment } = { id: f.name, event: n.event, shall: n.shall, ensures: n.ensures, fragment: f };
        if (n.while !== undefined) q.while = n.while;
        if (n.and !== undefined) q.and = n.and;
        pool.requirements.push(q);
        break;
      }
      case "example": {
        const n = f.node as Example;
        pool.examples.push({ id: f.name, event: n.event, given: n.given, args: n.args, then: n.then, fragment: f });
        break;
      }
      case "transition": {
        const n = f.node as Transition;
        const q: QTransition & { fragment: Fragment } = { id: f.name, event: n.event, when: n.when, then: n.then, fragment: f };
        if (n.otherwise !== undefined) q.otherwise = n.otherwise;
        pool.transitions.push(q);
        break;
      }
      default:
        break;
    }
  }
  return pool;
}

/**
 * Which assumptions apply (ASSUMPTIONS.md, A-05): an assumption over arguments applies only
 * to queries about that event; its state references must be to the state in question.
 */
export function assumptionsFor(pool: Pool, scope: { state: string; event?: string }): QAssumption[] {
  return pool.assumptions.filter((a) => {
    const r = collectRefs(a.body);
    if (r.fields.some((f) => f.state !== scope.state)) return false;
    if (r.args.length > 0 && (scope.event === undefined || r.args.some((x) => x.event !== scope.event))) return false;
    return true;
  });
}

export function stateOfEvent(v: Vocabulary, event: string): string {
  return v.events.find((e) => e.name === event)?.on ?? "";
}

/** The column a fragment's source counts under for cross-source: the model and intents are one. */
export function sourceColumn(f: Fragment): string {
  return f.source === MODEL_SOURCE ? INTENT_SOURCE : f.source;
}

export function findingId(kind: FindingKind, members: string[]): string {
  return digestJson({ kind, members: [...members].sort(compareCodePoints) }).slice("sha256:".length, "sha256:".length + 16);
}

export interface SolverCheckStatus {
  transition: string;
  status: "wanted" | "failed" | "unknown";
  reason?: string;
  finding?: string;
}

export interface QueryOutcome {
  findings: Finding[];
  /** Per obligation: Q-PRES (invariant) or Q-MEET (requirement) against each relevant transition. */
  solverCheck: Map<string, SolverCheckStatus[]>;
  /** Obligations whose queries were not run, with why. */
  skipped: Map<string, string>;
}

const KIND_ORDER: FindingKind[] = ["state-conflict", "joint-conflict", "example-conflict", "vacuous", "not-preserved", "not-met", "unknown"];

export function sortFindings(fs: Finding[]): Finding[] {
  return [...fs].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || compareCodePoints(a.members.map((m) => m.fragment).join(","), b.members.map((m) => m.fragment).join(",")) || compareCodePoints(a.id, b.id));
}

export async function runQueries(pool: Pool, env: QueryEnv, authority: Map<string, AuthorityInfo>): Promise<QueryOutcome> {
  const findings = new Map<string, Finding>();
  const solverCheck = new Map<string, SolverCheckStatus[]>();
  const skipped = new Map<string, string>();
  const v = pool.vocabulary;

  const member = (name: string): Member => {
    const f = pool.byName.get(name);
    return { fragment: name, source: f?.source ?? "", authority: authority.get(name)?.authority ?? "candidate", digest: f?.digest ?? "" };
  };
  const add = (kind: FindingKind, query: string, names: string[], extra: Partial<Finding> = {}): Finding => {
    const sorted = [...new Set(names)].sort(compareCodePoints);
    const id = findingId(kind, sorted);
    const existing = findings.get(id);
    if (existing !== undefined) return existing;
    const members = sorted.map(member);
    const cols = new Set(sorted.map((n) => pool.byName.get(n)).filter((f): f is Fragment => f !== undefined).map(sourceColumn));
    const f: Finding = { id, kind, scope: "specification", members, context: [], crossSource: cols.size > 1, collisionTerms: [], query, ...extra };
    findings.set(id, f);
    return f;
  };
  const failedOrUnknown = (r: QueryResult, query: string, onFail: (r: Extract<QueryResult, { status: "failed" }>) => void, unknownMembers: string[], context: string[]) => {
    if (r.status === "failed") onFail(r);
    else if (r.status === "unknown") add("unknown", query, unknownMembers, { reason: r.reason, context: [...context].sort(compareCodePoints) });
  };
  const ids = <T extends { id: string }>(xs: T[]) => xs.map((x) => x.id);

  const states = [...new Set([...v.states.map((s) => s.name)])].sort(compareCodePoints);
  const conflictedStates = new Set<string>();

  // Q-STATE, one query per state.
  for (const st of states) {
    const invs = pool.invariants.filter((i) => i.state === st);
    if (invs.length === 0) continue;
    const as = assumptionsFor(pool, { state: st });
    const r = await qState(env, as, invs);
    failedOrUnknown(r, `Q-STATE(${st})`, (r) => {
      conflictedStates.add(st);
      for (const s of r.sets) add("state-conflict", `Q-STATE(${st})`, s.members, { context: r.context, collisionTerms: s.collisionTerms, ...(r.incomplete ? { incomplete: true } : {}) });
    }, ids(invs), ids(as));
  }

  for (const st of states) {
    if (!conflictedStates.has(st)) continue;
    // A state whose invariants conflict admits no state at all; every other query about it would be vacuously true or false.
    for (const i of pool.invariants.filter((i) => i.state === st)) skipped.set(i.id, "state-conflict");
    for (const r of pool.requirements.filter((r) => stateOfEvent(v, r.event) === st)) skipped.set(r.id, "state-conflict");
  }

  const events = v.events.map((e) => e.name).sort(compareCodePoints);
  for (const ev of events) {
    const st = stateOfEvent(v, ev);
    if (conflictedStates.has(st)) continue;
    const as = assumptionsFor(pool, { state: st, event: ev });
    const invs = pool.invariants.filter((i) => i.state === st);
    const reqs = pool.requirements.filter((r) => r.event === ev);

    // Q-VAC for each requirement.
    for (const req of reqs) {
      const r = await qVac(env, req, as, invs);
      failedOrUnknown(r, `Q-VAC(${req.id})`, (r) => {
        add("vacuous", `Q-VAC(${req.id})`, [req.id], { context: r.context, ...(r.incomplete ? { incomplete: true } : {}) });
      }, [req.id], ids(as));
    }

    // Q-FEAS for the event.
    if (reqs.length > 0) {
      const r = await qFeas(env, ev, as, invs, reqs);
      failedOrUnknown(r, `Q-FEAS(${ev})`, (r) => {
        for (const s of r.sets) {
          const extra: Partial<Finding> = { context: r.context, collisionTerms: s.collisionTerms };
          if (s.witness !== undefined) extra.witness = s.witness;
          if (r.incomplete) extra.incomplete = true;
          add("joint-conflict", `Q-FEAS(${ev})`, s.members, extra);
        }
      }, [...ids(reqs), ...ids(invs)], ids(as));
    }

    // Q-EX for each example.
    for (const x of pool.examples.filter((x) => x.event === ev)) {
      const r = await qEx(env, x, as, invs, reqs);
      failedOrUnknown(r, `Q-EX(${x.id})`, (r) => {
        for (const s of r.sets) add("example-conflict", `Q-EX(${x.id})`, s.members, { context: r.context, collisionTerms: s.collisionTerms, ...(r.incomplete ? { incomplete: true } : {}) });
      }, [x.id, ...ids(reqs), ...ids(invs)], ids(as));
    }

    // Q-PRES and Q-MEET for each transition.
    for (const t of pool.transitions.filter((t) => t.event === ev)) {
      for (const inv of invs) {
        const r = await qPres(env, t, inv, as, invs);
        const status: SolverCheckStatus = { transition: t.id, status: r.status };
        failedOrUnknown(r, `Q-PRES(${t.id}, ${inv.id})`, (r) => {
          const s = r.sets[0]!;
          const extra: Partial<Finding> = { context: r.context, collisionTerms: s.collisionTerms };
          if (s.witness !== undefined) extra.witness = s.witness;
          status.finding = add("not-preserved", `Q-PRES(${t.id}, ${inv.id})`, s.members, extra).id;
        }, [t.id, inv.id], ids(as));
        if (r.status === "unknown") status.reason = r.reason;
        solverCheck.set(inv.id, [...(solverCheck.get(inv.id) ?? []), status]);
      }
      for (const req of reqs) {
        const r = await qMeet(env, t, req, as, invs);
        const status: SolverCheckStatus = { transition: t.id, status: r.status };
        failedOrUnknown(r, `Q-MEET(${t.id}, ${req.id})`, (r) => {
          const s = r.sets[0]!;
          const extra: Partial<Finding> = { context: r.context, collisionTerms: s.collisionTerms };
          if (s.witness !== undefined) extra.witness = s.witness;
          status.finding = add("not-met", `Q-MEET(${t.id}, ${req.id})`, s.members, extra).id;
        }, [t.id, req.id], ids(as));
        if (r.status === "unknown") status.reason = r.reason;
        solverCheck.set(req.id, [...(solverCheck.get(req.id) ?? []), status]);
      }
    }
  }
  return { findings: sortFindings([...findings.values()]), solverCheck, skipped };
}
