// The eight tools of the agent interface (Next layers, section 6.1). Each reads, or writes only the run store or an A3
// skeleton; none approves, rejects, retires, waives, countersigns or drafts a ledger line, in any configuration (A-76).
// Each returns harness-produced fields, with source text only under `quoted` (section 6.2).
import { type Finding, type Report, type Signal, signalsOf } from "@csh/check";
import { a3Command, parseArgs } from "@csh/cli";
import { fragmentsOf, type Module } from "@csh/kernel";
import { printFragment } from "@csh/print";
import { diffProject, type RunDiff } from "@csh/review";
import { componentQueue, componentStatus, evaluateProject, loadProject, type Project, runAt, type RunResult, runComponent, runSources, sourceSettings } from "@csh/run";
import type { SolverPort } from "@csh/solver";
import { type Envelope, fail, ok, quote } from "./envelope.ts";

/** The tool list, fixed: the names, what each takes, and that nothing here decides. */
export const TOOLS = [
  { name: "status", description: "What is and is not protected for this component: root of trust, maintainers, authority counts, gate mode, stored decision. Reads only.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "run", description: "Run the component (each practice's harness, check, gate) for the working tree, or for a commit with `at`, and store the run. Writes only the run store.", inputSchema: { type: "object", properties: { at: { type: "string", description: "A commit; omit for the working tree" } }, additionalProperties: false } },
  { name: "gaps", description: "The gap view of the current state: each gap's id, kind and fragments. Reads only.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "explain", description: "One finding or signal by id, with its members printed and its source text quoted. Reads only.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false } },
  { name: "diff", description: "What a change did to the results, between two commits (or . for the working tree): approvals lost, new violations, rules gone unknown, signals appeared and cleared. `says` is stop or continue, per the agent guide. Reads only.", inputSchema: { type: "object", properties: { base: { type: "string" }, head: { type: "string" } }, required: ["base", "head"], additionalProperties: false } },
  { name: "queue", description: "What awaits the owner's decision, each with who wrote it, how long it has waited and what approving it would unlock. Reads only.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "print", description: "One fragment of the specification in canonical form, by qualified name. Reads only.", inputSchema: { type: "object", properties: { fragment: { type: "string" } }, required: ["fragment"], additionalProperties: false } },
  { name: "a3_open", description: "Open an A3 for a problem a run found: record the run as its first stage and write an empty judgments skeleton. Never overwrites judgments.", inputSchema: { type: "object", properties: { slug: { type: "string" }, at: { type: "string" } }, required: ["slug"], additionalProperties: false } },
] as const;

export type ToolName = (typeof TOOLS)[number]["name"];

export interface ToolContext {
  root: string;
  solver: SolverPort;
  /** Set in continuous integration, where a dirty working tree is refused as a diff side. */
  ci?: boolean;
}

/** A signal in a list: harness-produced fields only. Its subject and detail come back from explain, quoted. */
const listed = (s: Signal) => ({ id: s.id, kind: s.kind, fragments: s.fragments, sources: s.sources, practices: s.practices });

const obligations = (r: Report) => (r.assessments ?? []).map((a) => ({ fragment: a.fragment, authority: a.authority, verdict: a.verdict, applicability: a.applicability, ...(a.authoredBy !== undefined ? { authoredBy: a.authoredBy } : {}) }));

function runResult(r: Extract<RunResult, { ok: true }>, root: string) {
  return {
    component: r.record.component,
    commit: r.record.snapshot.commit,
    snapshotDigest: r.record.snapshotDigest,
    stored: r.dir.startsWith(`${root}/`) ? r.dir.slice(root.length + 1) : r.dir,
    harnesses: r.record.harnesses.map((h) => ({ practice: h.practice, exitCode: h.exitCode, witnesses: h.witnesses, ...(h.executions !== undefined ? { executions: h.executions } : {}) })),
    gate: { overall: r.decision.overall, mode: r.decision.mode },
    obligations: obligations(r.report),
    signals: signalsOf(r.report, r.report.component).map(listed),
  };
}

function explainFinding(f: Finding, m: Module) {
  const frags = fragmentsOf(m);
  return {
    kind: f.kind,
    id: f.id,
    crossSource: f.crossSource,
    members: f.members.map((x) => {
      const fr = frags.find((y) => y.name === x.fragment);
      return { fragment: x.fragment, source: x.source, authority: x.authority, digest: x.digest, ...(fr !== undefined ? { printed: quote(printFragment(m, fr.kind, fr.node)) } : {}) };
    }),
    context: f.context,
    collisionTerms: f.collisionTerms,
    ...(f.witness !== undefined ? { witness: quote(Object.entries(f.witness).map(([k, v]) => `${k} = ${v}`).join(", ")) } : {}),
    ...(f.reason !== undefined ? { reason: quote(f.reason) } : {}),
    readings: ["state-conflict", "joint-conflict", "example-conflict", "arch-conflict"].includes(f.kind) ? ["a member is wrong", "a context is missing", "the intent is undecided"] : [],
  };
}

/** The text of each identified source item, by source/id, as the adapters read it now. */
async function itemTexts(p: Project, m: Module): Promise<Map<string, string>> {
  const perSource = p.component !== undefined ? sourceSettings(p.component) : undefined;
  const runs = await runSources(m, { root: p.root, ...(perSource !== undefined ? { perSource } : {}) });
  return new Map(runs.flatMap((r) => (r.output.items ?? []).map((it) => [`${r.source}/${it.id}`, it.text] as const)));
}

function explainSignal(s: Signal, r: Report, texts: Map<string, string>) {
  const out: Record<string, unknown> = { ...listed(s) };
  const text = s.subject !== undefined ? texts.get(s.subject) : undefined;
  if (text !== undefined) out.text = quote(text);
  if (s.subject !== undefined) out.subject = quote(s.subject);
  if (s.detail !== undefined) out.detail = quote(s.detail);
  // The text the harness could not read, for a gap about a source's unliftable lines.
  const unread = r.unliftable.filter((u) => s.subject !== undefined && (s.subject === u.source || s.subject.startsWith(`${u.source}/`) || s.subject.includes(u.span)));
  if (unread.length > 0) out.unliftable = unread.map((u) => ({ source: u.source, reason: u.reason, span: quote(u.span), text: quote(u.text) }));
  return out;
}

/** The diff, as an agent reads it: the sections of section 5.2 by name, and whether the guide says to stop (6.3). */
function diffResult(d: RunDiff) {
  const lost = d.observations.flatMap((o) => (o.k === "approval-lost" ? [o.fragment] : []));
  const broken = d.obligations.filter((o) => o.authority[1] === "approved" && (o.verdict[1] === "violated" || o.verdict[1] === "conflicting") && o.verdict[0] !== o.verdict[1]);
  const unknown = d.obligations.filter((o) => (o.verdict[1] === "unknown" && o.verdict[0] !== "unknown") || (o.applicability[1] === "stale" && o.applicability[0] !== "stale"));
  const says = lost.length > 0 || broken.length > 0 ? "stop" : "continue";
  return {
    comparison: d.comparison,
    base: "unavailable" in d.base ? { unavailable: quote(d.base.unavailable) } : d.base,
    head: "unavailable" in d.head ? { unavailable: quote(d.head.unavailable) } : d.head,
    says,
    approvalsLost: lost,
    newViolationsAndConflictsOnApprovedRules: broken.map((o) => ({ fragment: o.fragment, verdict: o.verdict, disposition: o.disposition[1] })),
    becameUnknownOrStale: unknown.map((o) => ({ fragment: o.fragment, verdict: o.verdict[1], applicability: o.applicability[1] })),
    signalsAppeared: d.signals.appeared.map(listed),
    signalsCleared: d.signals.cleared.map(listed),
    signalsPersisting: d.signals.persisting,
    authorityMoved: d.obligations.filter((o) => o.authority[0] !== o.authority[1]).map((o) => ({ fragment: o.fragment, authority: o.authority })),
    tests: { added: d.evidence.testsAdded.length, removed: d.evidence.testsRemoved.length },
    observations: d.observations.map((o) => (o.k === "evidence-removed" ? { k: o.k, tests: o.tests.length } : o)),
    inputs: d.inputs,
    gate: d.gate,
    ...(d.alone !== undefined ? { alone: { side: d.alone.side, signals: d.alone.signals.map(listed), obligations: d.alone.obligations } } : {}),
  };
}

async function evaluate(p: Project, c: ToolContext) {
  const e = await evaluateProject(p, { solver: c.solver });
  return e;
}

/** Call one tool. A tool name outside the fixed list is refused. */
export async function callTool(name: string, args: Record<string, unknown>, c: ToolContext): Promise<Envelope> {
  const p = loadProject(c.root, c.root);
  const str = (k: string) => (typeof args[k] === "string" ? (args[k] as string) : undefined);
  const runOptions = async () => ({ root: p.root, solver: c.solver });
  switch (name as ToolName) {
    case "status": {
      const r = await componentStatus(p, c.solver);
      return r.ok ? ok(name, r.status) : fail(name, "status-failed", r.message);
    }
    case "run": {
      const at = str("at");
      const r = at === undefined ? await runComponent(await runOptions()) : await runAt({ ...(await runOptions()), commit: at });
      return r.ok ? ok(name, runResult(r, p.root)) : fail(name, r.code, r.message);
    }
    case "gaps": {
      const e = await evaluate(p, c);
      if (!e.ok) return fail(name, "evaluation-failed", e.message);
      const kinds = new Set(e.report.gapView.gaps.map((g) => g.kind));
      return ok(name, { gaps: signalsOf(e.report, e.report.component).filter((s) => kinds.has(s.kind) && s.subject !== undefined).map(listed) });
    }
    case "explain": {
      const id = str("id");
      if (id === undefined) return fail(name, "missing-argument", "explain needs an id");
      const e = await evaluate(p, c);
      if (!e.ok) return fail(name, "evaluation-failed", e.message);
      const f = e.report.findings.find((x) => x.id === id);
      if (f !== undefined) return ok(name, { finding: explainFinding(f, e.model) });
      const s = signalsOf(e.report, e.report.component).find((x) => x.id === id);
      return s !== undefined ? ok(name, { signal: explainSignal(s, e.report, await itemTexts(p, e.model)) }) : fail(name, "unknown-id", `no finding or signal ${id} in the current evaluation`);
    }
    case "diff": {
      const base = str("base");
      const head = str("head");
      if (base === undefined || head === undefined) return fail(name, "missing-argument", "diff needs a base and a head");
      return ok(name, diffResult(await diffProject(p, base, head, { runOptions, ci: c.ci ?? process.env.CI === "true", cwd: p.root })));
    }
    case "queue": {
      const r = await componentQueue(p, c.solver);
      return r.ok ? ok(name, r.queue) : fail(name, "evaluation-failed", r.message);
    }
    case "print": {
      const fragment = str("fragment");
      if (fragment === undefined) return fail(name, "missing-argument", "print needs a fragment");
      const e = await evaluate(p, c);
      if (!e.ok) return fail(name, "evaluation-failed", e.message);
      const fr = fragmentsOf(e.model).find((x) => x.name === fragment);
      return fr === undefined ? fail(name, "unknown-fragment", `no fragment ${fragment} in the specification`) : ok(name, { fragment: fr.name, kind: fr.kind, digest: fr.digest, printed: quote(printFragment(e.model, fr.kind, fr.node)) });
    }
    case "a3_open": {
      const slug = str("slug");
      if (slug === undefined) return fail(name, "missing-argument", "a3_open needs a slug");
      const at = str("at");
      const err: string[] = [];
      const code = await a3Command(p, parseArgs(["open", slug, ...(at !== undefined ? ["--at", at] : [])]), { out: () => {}, err: (s) => err.push(s), runOptions });
      return code === 0 ? ok(name, { slug, judgments: `csh/a3/${slug}/judgments.json`, sheet: `csh/a3/${slug}/a3.md`, stage: "first" }) : fail(name, "a3-open-refused", err.join(""));
    }
    default:
      return fail(name, "unknown-tool", `there is no tool ${name}; the tools are ${TOOLS.map((t) => t.name).join(", ")}`);
  }
}
