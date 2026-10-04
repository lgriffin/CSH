// The csh command (Joint evaluation, section 7; Authority tab, sections 3.4 and 6; Anchor, harnesses and A3, section 7.1).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { a3Dir, readJudgments } from "@csh/a3";
import { DIVERGENCE_READINGS, type Finding, renderGaps, renderReport, type Report } from "@csh/check";
import { exitCode, formatDecision as formatGate, type GateDecision, type Mode } from "@csh/gate";
import { digestOf, fragmentsOf, type Module, stableJson } from "@csh/kernel";
import { appendDecision, type DecisionKind, isCalendarDate, LEDGER_PATH, persons } from "@csh/ledger";
import { printFragment } from "@csh/print";
import { createZ3Solver, type SolverPort } from "@csh/solver";
import { componentQueue, componentStatus, decideGate as decideFor, evaluateProject, GATE_PATH, renderQueue, renderStatus, ledgerOf, loadProject, MODEL_PATH, type Project, REPORT_PATH, runAt, runComponent, type RunResult, specOf, storedRuns } from "@csh/run";
import { type Args, parseArgs } from "./args.ts";
import { init } from "./init.ts";
import { a3Command, a3Fragment } from "./a3.ts";
import { diffCommand } from "./diff.ts";

const USAGE = `csh: the Composable Specification Harness

  csh init                        Write csh/component.json by asking for each field. Guesses nothing. Writes under
                                  the same root as every other command: --root, or the git top level.
  csh run [--at <commit>] [--mode advisory|enforcing] [--budget ms] [--no-cache]
                                  Run each practice's harness, check and gate one snapshot of the component, and
                                  store the run under .csh-cache/runs/. Exits non-zero only on block in enforcing
                                  mode, or when the run could not be made.
  csh check [spec] [--out report.json] [--json] [--budget ms] [--no-cache]
                                  Run every check and write the report. Exits 0 when the run completed.
  csh gaps [spec]                 Print the gap view only.
  csh explain <finding-id> [--run <dir|commit>]
                                  Print one finding, members rendered through the printer. With --run, from a stored
                                  run (its directory, or a commit whose newest stored run is read) rather than reports/.
  csh approve <fragment> --actor <name> --rationale <text>
                                  A fragment, or #a3/<slug> for an A3's judgments.
  csh reject <fragment> --actor <name> --rationale <text>
  csh retire <fragment> --actor <name> --rationale <text>
  csh waive <fragment> --scope <finding-id|obligation> --expires <YYYY-MM-DD> --actor <name> --rationale <text>
  csh countersign <seq> --actor <name> --rationale <text>
                                  Draft a ledger line. The tool never commits or signs: commit
                                  csh/ledger.ndjson alone, signed with your own key.
  csh status [--json]             What is and is not protected, for one component: the root of trust, the
                                  maintainers, what is approved, the gate mode and whether the stored decision is
                                  for the current snapshot. Reads only; always exits 0 when it can read the component.
  csh diff <base> <head> [--json] [--out <dir>]
                                  What a change did to the results: approvals lost, new violations, rules gone
                                  unknown, signals appeared and cleared, observations, counts. Each side is a stored
                                  run's directory, a commit (run when no run of it is stored) or . for the working
                                  tree. A side that cannot be run is unavailable, never an empty diff. Exits 0.
  csh queue [--json]              What awaits the owner's decision: candidate rules, unapproved bindings and A3
                                  judgments, each with who wrote it, how long it has waited and what approving it
                                  would unlock. Warns past csh/config.json's queueLimit. Reads only; exits 0.
  csh gate [--mode advisory|enforcing] [--out decision.json]
                                  Check and decide for the current snapshot. Exits non-zero only on block in enforcing mode.
  csh a3 open <slug> [--at <commit>] [--stage <id>]
                                  Record a run as an A3's first stage and write an empty judgments skeleton under
                                  csh/a3/<slug>/. Never overwrites judgments.
  csh a3 stage <slug> <id> --at <commit> [--mode advisory|enforcing]
                                  Record the run of a commit as a stage, running the commit if no run is stored.
  csh a3 build <slug> [--check]   Build a3.json, a3.md and a3.html from the stage records and judgments; with
                                  --check, fail when the committed ones differ.
  csh a3 verify <slug>            Re-run every stage at its commit and report any that differs.
  csh gate --verify <decision.json>
                                  Recompute the decision; refuse one made for any other snapshot or that differs.

Options common to all: --root <dir> (default: the git repository or the current directory).
`;

interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
  cwd: string;
  solver?: () => Promise<SolverPort>;
  /** Asks one question and returns the answer (csh init); the default reads a line from standard input. */
  ask?: (question: string) => Promise<string>;
}

let solverPromise: Promise<SolverPort> | undefined;
function defaultSolver(): Promise<SolverPort> {
  solverPromise ??= createZ3Solver();
  return solverPromise;
}

async function runCheck(p: Project, a: Args, io: Io): Promise<{ report: Report; model: Module } | undefined> {
  const solver = await (io.solver ?? defaultSolver)();
  const e = await evaluateProject(p, { solver, ...(a.positional[0] !== undefined ? { spec: a.positional[0] } : {}), ...(a.options.budget !== undefined ? { budgetMs: Number(a.options.budget) } : {}), ...(a.flags.has("no-cache") ? { noCache: true } : {}) });
  if (!e.ok) {
    io.err(e.message);
    return undefined;
  }
  return { report: e.report, model: e.model };
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

/** The report and model files of a stored run: --run names its directory, or a commit whose newest stored run is read. */
function storedRunFiles(p: Project, run: string): { report: string; model: string } | { error: string } {
  const dir = resolve(p.root, run);
  let found = existsSync(join(dir, "report.json")) && statSync(dir).isDirectory() ? dir : undefined;
  if (found === undefined) {
    let commit: string | undefined;
    try {
      commit = execFileSync("git", ["rev-parse", "--verify", `${run}^{commit}`], { cwd: p.root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      return { error: `${run} is neither a stored run's directory nor a commit` };
    }
    found = storedRuns(p.root, commit)[0];
    if (found === undefined) return { error: `no stored run of ${commit.slice(0, 12)}; csh run --at ${run} makes one` };
  }
  if (!existsSync(join(found, "model.json"))) return { error: `the run in ${found} stores no model; it was made before runs stored one, so run it again` };
  return { report: join(found, "report.json"), model: join(found, "model.json") };
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
  if (f.inputs !== undefined) lines.push(`Inputs: ${f.inputs}`);
  if (f.witness !== undefined) lines.push(`${f.kind === "joint-conflict" ? "Input with no valid outcome" : f.kind === "example-divergence" ? "A shared input" : "Counterexample"}: ${Object.entries(f.witness).map(([k, v]) => `${k} = ${v}`).join(", ")}`);
  if (f.reason !== undefined) lines.push(`Reason: ${f.reason}`);
  if (["state-conflict", "joint-conflict", "example-conflict", "arch-conflict"].includes(f.kind)) {
    lines.push("", "Three readings, and the harness chooses none:", "  1. A member is wrong.", "  2. A context is missing.", "  3. The intent is undecided.");
  }
  if (f.kind === "example-divergence") lines.push("", ...DIVERGENCE_READINGS);
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
  const slug = /^(?:[^/]+\/)?#a3\/([a-z0-9][a-z0-9-]*)$/.exec(target)?.[1];
  if (slug !== undefined) return decideA3(kind, p, slug, actor, rationale, io);
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

/**
 * A decision on an A3's judgments (Anchor, harnesses and A3, section 5.6): bound to the digest of the judgments file,
 * so any edit returns the sheet to candidate. Only approve, reject and retire apply.
 */
async function decideA3(kind: DecisionKind, p: Project, slug: string, actor: string, rationale: string, io: Io): Promise<number> {
  if (kind !== "approve" && kind !== "reject" && kind !== "retire") {
    io.err(`csh ${kind} does not apply to an A3's judgments\n`);
    return 2;
  }
  const name = p.component?.manifest.name;
  const read = readJudgments(p.root, slug);
  if (name === undefined || read === undefined) {
    io.err(`no judgments for ${slug} under ${a3Dir(p.root, slug).slice(p.root.length + 1)}\n`);
    return 2;
  }
  // A decision binds a digest that csh a3 build would refuse to use: nothing is appended.
  if (read.problems.length > 0) {
    io.err(`the judgments for ${slug} cannot be used:\n${read.problems.map((x) => `  ${x}`).join("\n")}\n`);
    return 2;
  }
  const fragment = a3Fragment(name, slug);
  const digest = digestOf(read.bytes);
  const ledger = await ledgerOf(p, specOf(p, undefined));
  const solo = ledger === undefined || persons(ledger.maintainers).length <= 1;
  io.out(`${kind} ${fragment}\n  digest ${digest}\n  the judgments in ${a3Dir(p.root, slug).slice(p.root.length + 1)}/judgments.json: ${read.judgments.title || "(untitled)"}\n  Approving them makes the sheet's root causes and countermeasures approved; any edit returns them to candidate.\n`);
  const written = appendDecision(join(p.root, LEDGER_PATH), { kind, fragment, digest, rationale, actor, selfApproved: kind === "approve" && solo });
  io.out(`\nAppended seq ${written.seq} to ${LEDGER_PATH}. Nothing is committed or signed.\nTo make it count, commit that file alone, signed with your own key:\n  git add ${LEDGER_PATH} && git commit -S -m "${kind} #a3/${slug}"\n`);
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
  if (cmd === "init") return init(io.cwd, a.options.root, io);
  const p = loadProject(io.cwd, a.options.root);
  switch (cmd) {
    case "run":
      return run(p, a, io);
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
      const stored = a.options.run === undefined ? undefined : storedRunFiles(p, a.options.run);
      if (stored !== undefined && "error" in stored) {
        io.err(`csh explain: ${stored.error}\n`);
        return 2;
      }
      const report = stored === undefined ? readReport(p, a) : (JSON.parse(readFileSync(stored.report, "utf8")) as Report);
      const f = report.findings.find((x) => x.id === id || (id !== undefined && x.id.startsWith(id)));
      if (f === undefined) {
        io.err(`no finding ${id ?? ""} in the report\n`);
        return 2;
      }
      const model = JSON.parse(readFileSync(stored?.model ?? join(p.root, MODEL_PATH), "utf8")) as Module;
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
    case "status": {
      const r = await componentStatus(p, await (io.solver ?? defaultSolver)());
      if (!r.ok) {
        io.err(`csh status: ${r.message}\n`);
        return 1;
      }
      io.out(a.flags.has("json") ? stableJson(r.status) : renderStatus(r.status, relative(io.cwd, p.root)));
      return 0;
    }
    case "queue": {
      const r = await componentQueue(p, await (io.solver ?? defaultSolver)());
      if (!r.ok) {
        io.err(`csh queue: ${r.message}`);
        return 1;
      }
      io.out(a.flags.has("json") ? stableJson(r.queue) : renderQueue(r.queue));
      return 0;
    }
    case "diff": {
      const solver = await (io.solver ?? defaultSolver)();
      return diffCommand(p, a, {
        out: io.out,
        err: io.err,
        ci: process.env.CI === "true",
        cwd: io.cwd,
        runOptions: async () => ({ root: p.root, solver, ...(a.options.budget !== undefined ? { budgetMs: Number(a.options.budget) } : {}), ...(a.flags.has("no-cache") ? { noCache: true } : {}), harnessOutput: (x: string) => io.err(x) }),
      });
    }
    case "a3": {
      const solver = await (io.solver ?? defaultSolver)();
      return a3Command(p, a, {
        out: io.out,
        err: io.err,
        runOptions: async () => ({ root: p.root, solver, ...(a.options.budget !== undefined ? { budgetMs: Number(a.options.budget) } : {}), ...(a.flags.has("no-cache") ? { noCache: true } : {}), harnessOutput: (x: string) => io.err(x) }),
      });
    }
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
  const solver = await (io.solver ?? defaultSolver)();
  const e = await evaluateProject(p, { solver, ...(a.options.budget !== undefined ? { budgetMs: Number(a.options.budget) } : {}), ...(a.flags.has("no-cache") ? { noCache: true } : {}) });
  if (!e.ok) {
    io.err(e.message);
    return undefined;
  }
  return decideFor(p, e, (a.options.mode ?? p.config.mode ?? "advisory") as Mode);
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
  write(join(p.root, a.options.out ?? GATE_PATH), formatGate(d));
  io.out(`gate ${d.overall} (${d.mode})\n${d.obligations.map((o) => `  ${o.disposition.padEnd(7)} ${o.fragment}  ${o.because}${o.recommends !== undefined ? `; recommends ${o.recommends}` : ""}`).join("\n")}\n`);
  if (d.candidates.obligations.length > 0) io.out(`  candidate, never blocking: ${d.candidates.obligations.join(", ")}\n`);
  if (d.invalidLedgerEntries.length > 0) io.out(`  ignored ledger entries: ${d.invalidLedgerEntries.map((e) => `seq ${e.seq} (${e.reason})`).join(", ")}\n`);
  return exitCode(d);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const countOf = (r: Report, kinds: string[]) => r.findings.filter((f) => kinds.includes(f.kind)).length;

/** csh run: harnesses, check and gate for one snapshot of the component (Anchor, harnesses and A3, section 4). */
async function run(p: Project, a: Args, io: Io): Promise<number> {
  const solver = await (io.solver ?? defaultSolver)();
  const mode = a.options.mode as Mode | undefined;
  if (mode !== undefined && mode !== "advisory" && mode !== "enforcing") {
    io.err("--mode is advisory or enforcing\n");
    return 2;
  }
  const o = { root: p.root, solver, ...(mode !== undefined ? { mode } : {}), ...(a.options.budget !== undefined ? { budgetMs: Number(a.options.budget) } : {}), ...(a.flags.has("no-cache") ? { noCache: true } : {}), harnessOutput: (s: string) => io.err(s) };
  const r: RunResult = a.options.at !== undefined ? await runAt({ ...o, commit: a.options.at }) : await runComponent(o);
  if (!r.ok) {
    io.err(`csh run: ${r.code}: ${r.message}\n`);
    return r.code === "dependencies-differ" ? 3 : 1;
  }
  const { record, report, decision } = r;
  const lines = [`run ${record.component} at ${record.snapshot.commit}`];
  for (const h of record.harnesses) lines.push(`  harness ${h.practice}: ${h.argv.join(" ")}  exit ${h.exitCode ?? h.error ?? "none"}, ${h.witnesses} witnesses, ${h.executions} executions (not sandboxed)`);
  if (record.harnesses.length === 0) lines.push("  no practice has a harness");
  const conflicts = countOf(report, ["state-conflict", "joint-conflict", "example-conflict", "arch-conflict", "vacuous"]);
  lines.push(`  findings ${report.findings.length} (${plural(conflicts, "conflict")}, ${plural(countOf(report, ["example-divergence"]), "divergence")}, ${report.findings.filter((f) => f.crossSource).length} cross-source); gaps ${report.gapView.gaps.length}; not comparable ${report.notComparable.length}; errors ${report.errors.length}`);
  const v = (x: string) => (report.assessments ?? []).filter((y) => y.verdict === x).length;
  lines.push(`  obligations ${(report.assessments ?? []).length}: conflicting ${v("conflicting")}, violated ${v("violated")}, satisfied ${v("satisfied")}, unknown ${v("unknown")}`);
  lines.push(`  gate ${decision.overall} (${decision.mode})`);
  lines.push(`  stored ${r.dir.slice(p.root.length + 1)}`);
  // A cross-source conflict or an enforcing block is a problem worth a sheet (Anchor, harnesses and A3, section 5.8).
  if (report.findings.some((f) => f.crossSource && f.kind.endsWith("-conflict")) || (decision.mode === "enforcing" && decision.overall === "block")) lines.push("  to read it as one problem: csh a3 open <slug>");
  io.out(`${lines.join("\n")}\n`);
  return exitCode(decision);
}
