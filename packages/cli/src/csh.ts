// The csh command (Joint evaluation, section 7; Authority tab, sections 3.4 and 6).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { cachingSolver, type Finding, loadEvidenceStore, renderGaps, renderReport, type Report, saveEvidenceStore, SolverCache, TOOL_VERSION } from "@csh/check";
import { exitCode, formatDecision as formatGate, gate, type GateDecision, type Mode, snapshotDigest, type Waiver } from "@csh/gate";
import { fragmentsOf, type Module, stableJson } from "@csh/kernel";
import { appendDecision, type DecisionKind, isCalendarDate, LEDGER_PATH, persons, waiversFor } from "@csh/ledger";
import { printFragment } from "@csh/print";
import { createZ3Solver, type SolverPort } from "@csh/solver";
import { type Args, parseArgs } from "./args.ts";
import { evaluateSpec } from "./pipeline.ts";
import { CACHE_DIR, ledgerOf, loadProject, MODEL_PATH, type Project, REPORT_PATH, snapshotOf, specOf, unchangedSince } from "./project.ts";

const USAGE = `csh: the Composable Specification Harness

  csh check [spec] [--out report.json] [--json] [--budget ms] [--no-cache]
                                  Run every check and write the report. Exits 0 when the run completed.
  csh gaps [spec]                 Print the gap view only.
  csh explain <finding-id>        Print one finding, members rendered through the printer.
  csh approve <fragment> --actor <name> --rationale <text>
  csh reject <fragment> --actor <name> --rationale <text>
  csh retire <fragment> --actor <name> --rationale <text>
  csh waive <fragment> --scope <finding-id|obligation> --expires <YYYY-MM-DD> --actor <name> --rationale <text>
  csh countersign <seq> --actor <name> --rationale <text>
                                  Draft a ledger line. The tool never commits or signs: commit
                                  csh/ledger.ndjson alone, signed with your own key.
  csh gate [--mode advisory|enforcing] [--out decision.json]
                                  Check and decide for the current snapshot. Exits non-zero only on block in enforcing mode.
  csh gate --verify <decision.json>
                                  Recompute the decision; refuse one made for any other snapshot or that differs.

Options common to all: --root <dir> (default: the git repository or the current directory).
`;

interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
  cwd: string;
  solver?: () => Promise<SolverPort>;
}

let solverPromise: Promise<SolverPort> | undefined;
function defaultSolver(): Promise<SolverPort> {
  solverPromise ??= createZ3Solver();
  return solverPromise;
}

async function runCheck(p: Project, a: Args, io: Io): Promise<{ report: Report; model: Module } | undefined> {
  const spec = specOf(p, a.positional[0]);
  const solver = await (io.solver ?? defaultSolver)();
  const budget = a.options.budget !== undefined ? Number(a.options.budget) : p.config.budgetMs;
  const cacheFile = join(p.root, CACHE_DIR, "solver.json");
  const evidenceFile = join(p.root, CACHE_DIR, "evidence.json");
  const cache = a.flags.has("no-cache") ? new SolverCache() : SolverCache.load(cacheFile);
  const evidence = loadEvidenceStore(evidenceFile);
  const ledger = await ledgerOf(p, spec);
  // The module digest is known only after emission; the snapshot digest is filled in after it.
  const cfg = { ...(budget !== undefined ? { budgetMs: budget } : {}), ...(p.config.requirementIdPattern !== undefined ? { requirementIdPattern: p.config.requirementIdPattern } : {}) };
  const impl = unchangedSince(p);
  const r = await evaluateSpec(spec, {
    root: p.root,
    solver,
    config: cfg,
    ...(p.lock !== undefined ? { lock: p.lock } : {}),
    ...(ledger !== undefined ? { ledgerState: ledger } : {}),
    evidence,
    solverWrap: (s) => cachingSolver(s, cache),
    snapshot: { commit: p.commit, ledgerHead: String(ledger?.head ?? 0) },
    ...(impl !== undefined ? { unchangedSince: impl } : {}),
    ...(p.config.adapters !== undefined ? { adapters: p.config.adapters } : {}),
  });
  if (!r.emitted.ok) {
    io.err(`emission failed:\n${r.emitted.errors.map((e) => `  ${e.code}${e.path !== undefined ? ` at ${e.path}` : ""}${e.line !== undefined ? `:${e.line}` : ""}: ${e.message}`).join("\n")}\n`);
    return undefined;
  }
  const report = r.checked!.report;
  report.snapshot = { commit: p.commit, ledgerHead: String(ledger?.head ?? 0), digest: snapshotDigest(snapshotOf(p, report.moduleDigest, ledger, solver.id, TOOL_VERSION)) };
  if (!a.flags.has("no-cache")) cache.save(cacheFile);
  saveEvidenceStore(evidenceFile, evidence);
  return { report, model: r.checked!.prepared.module };
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function readReport(p: Project, a: Args): Report {
  const path = join(p.root, a.options.report ?? REPORT_PATH);
  if (!existsSync(path)) throw new Error(`no report at ${path}; run csh check first`);
  return JSON.parse(readFileSync(path, "utf8")) as Report;
}

function explainFinding(f: Finding, m: Module): string {
  const frags = fragmentsOf(m);
  const lines = [`${f.kind} ${f.id}${f.crossSource ? " (cross-source)" : ""}, from ${f.query}`, ""];
  for (const mem of f.members) {
    const fr = frags.find((x) => x.name === mem.fragment);
    lines.push(`${mem.fragment}  source ${mem.source}, ${mem.authority}, ${mem.digest}`);
    if (fr !== undefined) lines.push(...printFragment(m, fr.kind, fr.node).split("\n").map((l) => `    ${l}`));
    lines.push("");
  }
  if (f.context.length > 0) lines.push(`Context: ${f.context.join(", ")}`);
  if (f.collisionTerms.length > 0) lines.push(`Collision terms: ${f.collisionTerms.join(", ")}`);
  if (f.witness !== undefined) lines.push(`${f.kind === "joint-conflict" ? "Input with no valid outcome" : "Counterexample"}: ${Object.entries(f.witness).map(([k, v]) => `${k} = ${v}`).join(", ")}`);
  if (f.reason !== undefined) lines.push(`Reason: ${f.reason}`);
  if (["state-conflict", "joint-conflict", "example-conflict"].includes(f.kind)) {
    lines.push("", "Three readings, and the harness chooses none:", "  1. A member is wrong.", "  2. A context is missing.", "  3. The intent is undecided.");
  }
  return `${lines.join("\n")}\n`;
}

async function decide(kind: DecisionKind, p: Project, a: Args, io: Io): Promise<number> {
  const target = a.positional[0];
  const actor = a.options.actor;
  const rationale = a.options.rationale ?? "";
  if (target === undefined || actor === undefined) {
    io.err(`usage: csh ${kind} <${kind === "countersign" ? "seq" : "fragment"}> --actor <name> --rationale <text>\n`);
    return 2;
  }
  if (rationale.trim() === "") {
    io.err("a decision needs a non-empty --rationale\n");
    return 2;
  }
  const res = await runCheck(p, { ...a, positional: [] }, io);
  if (res === undefined) return 1;
  const { report, model } = res;
  const spec = specOf(p, undefined);
  const ledger = await ledgerOf(p, spec);
  const solo = ledger === undefined || persons(ledger.maintainers).length <= 1;
  let fragmentName = target;
  let refers: number | undefined;
  if (kind === "countersign") {
    refers = Number(target);
    const e = ledger?.entries.find((x) => x.seq === refers);
    if (e === undefined) {
      io.err(`no valid ledger entry with seq ${target}\n`);
      return 2;
    }
    fragmentName = e.fragment;
  }
  const frag = fragmentsOf(model).find((f) => f.name === fragmentName);
  if (frag === undefined) {
    io.err(`no fragment named ${fragmentName}\n`);
    return 2;
  }
  // What the person is deciding on, in full, before anything is written (Authority tab, section 3.4).
  io.out(`${kind} ${frag.name}\n  digest ${frag.digest}\n\n${printFragment(model, frag.kind, frag.node).split("\n").map((l) => `    ${l}`).join("\n")}\n\n`);
  const involved = report.findings.filter((f) => f.members.some((m) => m.fragment === frag.name));
  io.out(involved.length === 0 ? "  No findings involve it.\n" : `  Findings that involve it:\n${involved.map((f) => `    ${f.kind} ${f.id}`).join("\n")}\n`);
  const gaps = report.gapView.gaps.filter((g) => g.subject === frag.name || g.fragments.includes(frag.name));
  if (gaps.length > 0) io.out(`  Gaps that involve it:\n${gaps.map((g) => `    ${g.kind}: ${g.detail ?? ""}`).join("\n")}\n`);
  if (kind === "approve") {
    const unlocks = (report.assessments ?? []).filter((x) => x.fragment !== frag.name && x.reasons.some((r) => r.includes(frag.local)));
    io.out(frag.kind === "binding" ? `  Approving it lets evidence through ${frag.local} count for: ${unlocks.map((x) => x.fragment).join(", ") || "no obligation yet"}\n` : "  Approving it makes its verdict count at the gate.\n");
  }
  const d: Parameters<typeof appendDecision>[1] = { kind, fragment: frag.name, digest: frag.digest, rationale, actor, selfApproved: kind === "approve" && solo };
  if (kind === "approve" && frag.cites.length > 0) {
    d.cited = frag.cites.map((c) => ({ source: c.source, id: c.id, textDigest: report.items.find((i) => i.source === c.source && i.id === c.id)?.textDigest ?? "missing" }));
  }
  if (kind === "waive") {
    if (a.options.scope === undefined || a.options.expires === undefined || !isCalendarDate(a.options.expires)) {
      io.err("csh waive needs --scope <finding-id|obligation> and --expires <YYYY-MM-DD>\n");
      return 2;
    }
    d.waiver = { scope: a.options.scope, expires: a.options.expires };
  }
  if (refers !== undefined) d.refers = refers;
  const written = appendDecision(join(p.root, LEDGER_PATH), d);
  io.out(`\nAppended seq ${written.seq} to ${LEDGER_PATH}. Nothing is committed or signed.\nTo make it count, commit that file alone, signed with your own key:\n  git add ${LEDGER_PATH} && git commit -S -m "${kind} ${frag.local}"\n`);
  return 0;
}

export async function csh(argv: string[], io: Io): Promise<number> {
  const a = parseArgs(argv);
  if (a.errors.length > 0) {
    io.err(`${a.errors.join("\n")}\n`);
    return 2;
  }
  const cmd = a.positional.shift();
  if (cmd === undefined || cmd === "help" || a.flags.has("help")) {
    io.out(USAGE);
    return cmd === undefined ? 2 : 0;
  }
  const p = loadProject(io.cwd, a.options.root);
  switch (cmd) {
    case "check": {
      const res = await runCheck(p, a, io);
      if (res === undefined) return 1;
      write(join(p.root, a.options.out ?? REPORT_PATH), stableJson(res.report));
      write(join(p.root, MODEL_PATH), stableJson(res.model));
      io.out(a.flags.has("json") ? stableJson(res.report) : renderReport(res.report));
      return 0;
    }
    case "gaps": {
      const res = await runCheck(p, a, io);
      if (res === undefined) return 1;
      io.out(`${renderGaps(res.report).join("\n")}\n`);
      return 0;
    }
    case "explain": {
      const id = a.positional[0];
      const report = readReport(p, a);
      const f = report.findings.find((x) => x.id === id || (id !== undefined && x.id.startsWith(id)));
      if (f === undefined) {
        io.err(`no finding ${id ?? ""} in the report\n`);
        return 2;
      }
      const model = JSON.parse(readFileSync(join(p.root, MODEL_PATH), "utf8")) as Module;
      io.out(explainFinding(f, model));
      return 0;
    }
    case "approve":
    case "reject":
    case "retire":
    case "waive":
    case "countersign":
      return decide(cmd, p, a, io);
    case "gate":
      return runGate(p, a, io);
    default:
      io.err(`unknown command ${cmd}\n${USAGE}`);
      return 2;
  }
}

/**
 * Decide for the current snapshot. The gate never trusts a report file: it runs the check itself, so an
 * edited report cannot change the decision (CSH-010).
 */
async function decideGate(p: Project, a: Args, io: Io): Promise<GateDecision | undefined> {
  const res = await runCheck(p, { ...a, positional: [] }, io);
  if (res === undefined) return undefined;
  const { report } = res;
  const solver = await (io.solver ?? defaultSolver)();
  const ledger = await ledgerOf(p, specOf(p, undefined));
  const snapshot = snapshotOf(p, report.moduleDigest, ledger, solver.id, TOOL_VERSION);
  const waivers: Waiver[] = [];
  for (const as of report.assessments ?? []) {
    for (const w of ledger === undefined ? [] : waiversFor(ledger, { name: as.fragment, digest: as.digest })) waivers.push({ seq: w.seq, fragment: w.fragment, digest: w.digest, scope: w.waiver!.scope, expires: w.waiver!.expires });
  }
  const mode = (a.options.mode ?? p.config.mode ?? "advisory") as Mode;
  return gate({ report, snapshot, mode, waivers, commitDate: p.commitDate });
}

async function runGate(p: Project, a: Args, io: Io): Promise<number> {
  if (a.options.verify !== undefined) {
    const given = JSON.parse(readFileSync(join(p.root, a.options.verify), "utf8")) as GateDecision;
    // Recompute the decision for this snapshot, in the mode the decision claims, and accept only an identical one.
    const fresh = await decideGate(p, { ...a, options: { ...a.options, mode: given.mode } }, io);
    if (fresh === undefined) return 1;
    if (given.snapshotDigest !== fresh.snapshotDigest) {
      io.err(`refused: decision is for snapshot ${given.snapshotDigest}, not ${fresh.snapshotDigest}\n`);
      return 3;
    }
    if (formatGate(given) !== formatGate(fresh)) {
      io.err("refused: the decision does not match the one computed for this snapshot\n");
      return 3;
    }
    io.out("accepted: the decision is for this snapshot and matches a fresh computation\n");
    return exitCode(fresh);
  }
  const d = await decideGate(p, a, io);
  if (d === undefined) return 1;
  write(join(p.root, a.options.out ?? "reports/csh-gate.json"), formatGate(d));
  io.out(`gate ${d.overall} (${d.mode})\n${d.obligations.map((o) => `  ${o.disposition.padEnd(7)} ${o.fragment}  ${o.because}${o.recommends !== undefined ? `; recommends ${o.recommends}` : ""}`).join("\n")}\n`);
  if (d.candidates.obligations.length > 0) io.out(`  candidate, never blocking: ${d.candidates.obligations.join(", ")}\n`);
  if (d.invalidLedgerEntries.length > 0) io.out(`  ignored ledger entries: ${d.invalidLedgerEntries.map((e) => `seq ${e.seq} (${e.reason})`).join(", ")}\n`);
  return exitCode(d);
}
