// Verdict, applicability and methods for every obligation (Semantic contract, section 6).
import { compareCodePoints, digestJson, type Fragment, type Invariant, type Requirement } from "@csh/kernel";
import { type EvidenceStore, judge, type JudgeContext, termsOfObligation } from "./evidence.ts";
import type { SourcedWitness } from "./pool.ts";
import { assumptionsFor, type Pool, type QueryOutcome, stateOfEvent } from "./run.ts";
import type { Applicability, Assessment, AuthorityInfo, EvidenceRecord, Finding, MethodStatus } from "./types.ts";

export interface AssessInput {
  pool: Pool;
  fragments: Fragment[];
  outcome: QueryOutcome;
  witnesses: SourcedWitness[];
  authority: Map<string, AuthorityInfo>;
  store: EvidenceStore;
  /** Digest of the tool, solver and configuration, a dependency of every piece of evidence. */
  toolDigest: string;
  snapshotCommit?: string;
  unchangedSince?: (ancestor: string, commit: string) => boolean;
}

const CONFLICT_KINDS = new Set(["state-conflict", "joint-conflict", "example-conflict"]);
const SPEC_VIOLATION_KINDS = new Set(["not-preserved", "not-met"]);

/** The headline reason code of a detailed reason, such as key-missing from "key-missing: post.balanceMinor". */
function code(reason: string): string {
  return reason.split(":")[0]!.trim();
}

export function assess(input: AssessInput): Assessment[] {
  const { pool, outcome, authority } = input;
  const v = pool.vocabulary;
  const bindings = new Map<string, { fragment: Fragment; key: string; approved: boolean }>();
  for (const f of input.fragments) {
    if (f.kind !== "binding" || !pool.byName.has(f.name)) continue;
    const b = f.node as { key: string };
    bindings.set(f.local, { fragment: f, key: b.key, approved: authority.get(f.name)?.authority === "approved" });
  }
  const approved = (name: string) => authority.get(name)?.authority === "approved";
  const out: Assessment[] = [];
  for (const f of input.fragments) {
    if (!["invariant", "requirement", "architecture", "temporal"].includes(f.kind)) continue;
    if (!pool.byName.has(f.name)) continue; // retired
    const auth = authority.get(f.name) ?? { authority: "candidate" as const };
    const isApproved = auth.authority === "approved";
    // Findings count for an approved obligation only when every member is approved; a candidate is evaluated against all.
    const counts = (fd: Finding) => fd.members.some((m) => m.fragment === f.name) && (!isApproved || fd.members.every((m) => approved(m.fragment)));
    const involved = outcome.findings.filter((fd) => fd.members.some((m) => m.fragment === f.name));
    const a: Assessment = {
      fragment: f.name,
      kind: f.kind,
      source: f.source,
      digest: f.digest,
      authority: auth.authority,
      selfApproved: auth.selfApproved ?? false,
      needsReview: auth.needsReview ?? false,
      verdict: "unknown",
      applicability: "unavailable",
      critical: f.policy?.critical ?? false,
      methods: [],
      evidence: [],
      reasons: [],
      findings: involved.map((fd) => fd.id),
    };
    if (auth.reason !== undefined) a.authorityReason = auth.reason;
    if (f.policy !== undefined) a.policy = f.policy.name;
    if (f.kind === "architecture" || f.kind === "temporal") {
      a.reasons.push("reserved: version 1 has no evaluator for this kind");
      out.push(a);
      continue;
    }
    const node = f.node as Invariant | Requirement;
    const state = node.kind === "invariant" ? node.state : stateOfEvent(v, node.event);
    const event = node.kind === "requirement" ? node.event : undefined;
    const terms = termsOfObligation(node);

    // Evidence: every witness about this obligation's event or state.
    const usedBindings: Record<string, string> = {};
    for (const t of terms) {
      const b = bindings.get(t);
      if (b !== undefined) usedBindings[b.fragment.name] = b.fragment.digest;
    }
    const inForce = node.kind === "requirement" ? assumptionsFor(pool, { state, event: node.event }) : pool.assumptions.filter((x) => assumptionsFor(pool, { state }).some((y) => y.id === x.id) || v.events.filter((e) => e.on === state).some((e) => assumptionsFor(pool, { state, event: e.name }).some((y) => y.id === x.id)));
    const ctx: JudgeContext = {
      vocabulary: v,
      bindings,
      requirementsOn: (ev) => pool.requirements.filter((r) => r.event === ev).map((r) => r.fragment.node as Requirement),
      rejectsMock: f.policy?.reject.includes("MockOnly") ?? false,
      current: {
        obligation: f.digest,
        bindings: usedBindings,
        assumptions: Object.fromEntries(inForce.map((x) => [x.id, pool.byName.get(x.id)?.digest ?? ""]).sort((p, q) => compareCodePoints(p[0]!, q[0]!))),
        tool: input.toolDigest,
      },
      store: input.store,
    };
    if (input.snapshotCommit !== undefined) ctx.snapshotCommit = input.snapshotCommit;
    if (input.unchangedSince !== undefined) ctx.unchangedSince = input.unchangedSince;
    for (const w of input.witnesses) {
      const rec = judge(f, w, ctx);
      if (rec !== undefined) a.evidence.push(rec);
    }
    a.applicability = overallApplicability(a.evidence);

    // Methods.
    const unbound = terms.filter((t) => !(bindings.get(t)?.approved ?? false));
    const methodStatus = (m: string): MethodStatus => {
      if (m === "ApprovedBinding") return unbound.length === 0 ? { method: m, met: true } : { method: m, met: false, reason: `binding-not-approved: ${unbound.join(", ")}` };
      if (m === "BoundaryWitness") {
        if (a.evidence.some((e) => e.applicability === "current" && e.result === "holds" && e.boundary === true)) return { method: m, met: true };
        const why = [...new Set(a.evidence.map((e) => (e.applicability === "current" ? (e.boundary === true ? `witness-${e.result}` : "no-boundary-witness") : (e.reason ?? e.applicability))))];
        return { method: m, met: false, reason: why.length > 0 ? why.join("; ") : "no-witness" };
      }
      // SolverCheck.
      const sc = outcome.solverCheck.get(f.name) ?? [];
      if (sc.length === 0) return { method: m, met: false, reason: outcome.skipped.get(f.name) ?? "no-transition" };
      if (sc.every((s) => s.status === "wanted")) return { method: m, met: true };
      const why = [...new Set(sc.filter((s) => s.status !== "wanted").map((s) => (s.status === "unknown" ? (s.reason ?? "solver-unknown") : `counterexample against ${s.transition}`)))];
      return { method: m, met: false, reason: why.join("; ") };
    };
    a.methods = (f.policy?.require ?? []).map(methodStatus);

    // Verdict, in the order of the Semantic contract, section 6.
    const conflicts = outcome.findings.filter((fd) => CONFLICT_KINDS.has(fd.kind) && counts(fd));
    const specViolations = outcome.findings.filter((fd) => SPEC_VIOLATION_KINDS.has(fd.kind) && counts(fd));
    const implViolations = a.evidence.filter((e) => e.applicability === "current" && e.result === "violated");
    if (conflicts.length > 0) {
      a.verdict = "conflicting";
      a.scope = "specification";
      a.reasons.push(...conflicts.map((fd) => `${fd.kind}: ${fd.id}`));
    } else if (implViolations.length > 0 || specViolations.length > 0) {
      a.verdict = "violated";
      a.scope = implViolations.length > 0 ? "implementation" : "specification";
      a.reasons.push(...implViolations.map((e) => `witness ${e.witness} makes it false`), ...specViolations.map((fd) => `${fd.kind}: ${fd.id}`));
    } else if (f.policy !== undefined && a.methods.every((m) => m.met) && outcome.skipped.get(f.name) === undefined) {
      a.verdict = "satisfied";
      a.reasons.push(...a.methods.map((m) => `${m.method} met`));
    } else {
      a.verdict = "unknown";
      if (f.policy === undefined) a.reasons.push("no-policy");
      const skippedWhy = outcome.skipped.get(f.name);
      if (skippedWhy !== undefined) a.reasons.push(skippedWhy);
      for (const m of a.methods.filter((m) => !m.met)) {
        a.reasons.push(`method-missing: ${m.method}`);
        for (const r of (m.reason ?? "").split("; ")) if (r !== "" && r !== "no-transition") a.reasons.push(r);
      }
      for (const fd of involved) {
        if (fd.kind === "unknown" && fd.reason !== undefined) a.reasons.push(fd.reason);
        if (fd.kind === "vacuous") a.reasons.push("vacuous");
      }
      for (const e of a.evidence) if (e.reason !== undefined) a.reasons.push(e.reason);
    }
    a.reasons = dedupe(a.reasons);
    out.push(a);
  }
  return out.sort((x, y) => compareCodePoints(x.fragment, y.fragment));
}

function dedupe(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  // Headline codes (binding-not-approved, key-missing) are listed on their own as well as in detail.
  for (const x of [...out]) {
    const c = code(x);
    if (c !== x && !seen.has(c) && !c.startsWith("witness ") && !c.startsWith("method-missing")) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

function overallApplicability(ev: EvidenceRecord[]): Applicability {
  if (ev.some((e) => e.applicability === "current")) return "current";
  if (ev.some((e) => e.applicability === "stale")) return "stale";
  if (ev.some((e) => e.applicability === "inapplicable")) return "inapplicable";
  return "unavailable";
}

export function toolDigest(tool: { version: string; solver: string; budgetMs: number }, configDigest = ""): string {
  return digestJson({ ...tool, configDigest });
}
