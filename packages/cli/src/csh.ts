// The csh command (Joint evaluation, section 7; Authority tab, sections 3.4 and 6; Anchor, harnesses and A3, section 7.1).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { a3Dir, readJudgments } from "@csh/a3";
import { checkExpected, claimEvidence, lineStating, linesStatingVersion, DIVERGENCE_READINGS, type Finding, ladderOf, overviewOf, renderLadder, parseExpected, renderExpect, renderEntry, renderGaps, renderOverview, renderOverviewHtml, renderReport, type Report, type SentenceAt } from "@csh/check";
import { exitCode, formatDecision as formatGate, type GateDecision, type Mode } from "@csh/gate";
import { digestOf, fragmentsOf, textDigestOf, type Module, stableJson } from "@csh/kernel";
import { appendDecision, type DecisionKind, isCalendarDate, LEDGER_PATH, persons } from "@csh/ledger";
import { printFragment } from "@csh/print";
import { createZ3Solver, type SolverPort } from "@csh/solver";
import { componentQueue, coverageOf, renderCoverage, componentStatus, decideGate as decideFor, evaluateProject, GATE_PATH, renderQueue, renderStatus, ledgerOf, loadProject, MODEL_PATH, OVERVIEW_PATH, type Project, REPORT_PATH, importResults, runAt, runComponent, type RunResult, fetchSubject, runWarnings, specPathOf, storedRuns, subjectWarnings } from "@csh/run";
import { type Args, argProblems, hint, parseArgs, valueProblems } from "./args.ts";
import { COMMAND_NAMES, commandNamed, helpOf, synopsis, USAGE, version } from "./commands.ts";
import { init } from "./init.ts";
import { debugging } from "./exit.ts";
import { a3Command, a3Fragment, historyCommand } from "./a3.ts";
import { diffCommand } from "./diff.ts";
import { analyseCommand } from "./analyse.ts";


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

/** The report a reading command reads: a stored run's, else the last one written; a missing one is said, not thrown. */
function reportFor(p: Project, a: Args, stored: { report: string } | undefined, cmd: string, io: Io): Report | undefined {
  const path = stored?.report ?? join(p.root, a.options.report ?? REPORT_PATH);
  if (!existsSync(path)) {
    io.err(`csh ${cmd}: no report at ${shown(io.cwd, path)}; csh run or csh check writes one, and writes none when it fails\n`);
    return undefined;
  }
  const r = readJson<Report>(path);
  if ("error" in r || r.value === null || typeof r.value !== "object" || !Array.isArray(r.value.findings)) {
    io.err(`csh ${cmd}: ${shown(io.cwd, path)} is not a report csh wrote${"error" in r ? ` (${r.error})` : ""}; csh run or csh check writes it again\n`);
    return undefined;
  }
  return r.value;
}

/** A path as a person reads it: relative to where they are, unless that climbs out of it, then absolute. */
function shown(cwd: string, path: string): string {
  const rel = relative(cwd, path);
  return (rel === "" || rel.startsWith("..") || isAbsolute(rel) ? path : rel).replace(/\\/g, "/");
}

/** A JSON file read, or why it could not be. */
function readJson<T>(path: string): { value: T } | { error: string } {
  try {
    return { value: JSON.parse(readFileSync(path, "utf8")) as T };
  } catch (e) {
    return { error: e instanceof SyntaxError ? `not JSON: ${e.message}` : (e as Error).message };
  }
}

/** The report and model files of a stored run: --run names its directory, or a commit whose newest stored run is read. */
function storedRunFiles(p: Project, run: string, needsModel = true): { report: string; model: string } | { error: string } {
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
  if (needsModel && !existsSync(join(found, "model.json"))) return { error: `the run in ${found} stores no model; it was made before runs stored one, so run it again` };
  return { report: join(found, "report.json"), model: join(found, "model.json") };
}

/** The practice that owns each source of the component, for placing overview entries. */
function practiceMap(p: Project): { sources: Record<string, string> } | undefined {
  return p.component !== undefined ? { sources: Object.fromEntries(p.component.manifest.practices.flatMap((x) => x.sources.map((s) => [s, x.id]))) } : undefined;
}

const EXPECTED_PATH = "csh/expected.json";

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
  if (["state-conflict", "joint-conflict", "example-conflict", "arch-conflict", "claim-conflict"].includes(f.kind)) {
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
  // Checked before the run the decision needs, so that a mistyped date or seq costs nothing.
  if (kind === "waive" && (a.options.scope === undefined || a.options.expires === undefined || !isCalendarDate(a.options.expires))) {
    io.err("csh waive needs --scope <finding-id|obligation> and --expires <YYYY-MM-DD>\n");
    return 2;
  }
  if (kind === "countersign" && !/^[1-9][0-9]*$/.test(target)) {
    io.err(`csh countersign: a ledger entry is named by its seq, a whole number from 1, not ${JSON.stringify(target)}\n`);
    return 2;
  }
  const slug = /^(?:[^/]+\/)?#a3\/([a-z0-9][a-z0-9-]*)$/.exec(target)?.[1];
  if (slug !== undefined) return decideA3(kind, p, slug, actor, rationale, io);
  const res = await runCheck(p, { ...a, positional: [] }, io);
  if (res === undefined) return 1;
  const { report, model } = res;
  const spec = specPathOf(p);
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
    d.waiver = { scope: a.options.scope!, expires: a.options.expires! };
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
  const digest = textDigestOf(read.bytes);
  const ledger = await ledgerOf(p, specPathOf(p));
  const solo = ledger === undefined || persons(ledger.maintainers).length <= 1;
  io.out(`${kind} ${fragment}\n  digest ${digest}\n  the judgments in ${a3Dir(p.root, slug).slice(p.root.length + 1)}/judgments.json: ${read.judgments.title || "(untitled)"}\n  Approving them makes the sheet's root causes and countermeasures approved; any edit returns them to candidate.\n`);
  const written = appendDecision(join(p.root, LEDGER_PATH), { kind, fragment, digest, rationale, actor, selfApproved: kind === "approve" && solo });
  io.out(`\nAppended seq ${written.seq} to ${LEDGER_PATH}. Nothing is committed or signed.\nTo make it count, commit that file alone, signed with your own key:\n  git add ${LEDGER_PATH} && git commit -S -m "${kind} #a3/${slug}"\n`);
  return 0;
}

export async function csh(argv: string[], io: Io): Promise<number> {
  const a = parseArgs(argv);
  const cmd = a.positional.shift();
  if (a.flags.has("version") && cmd === undefined && a.errors.length === 0) {
    io.out(`csh ${version()}\n`);
    return 0;
  }
  if (cmd === undefined) {
    if (a.flags.has("help") && a.errors.length === 0) {
      io.out(USAGE);
      return 0;
    }
    io.err(a.errors.length > 0 ? `csh: ${a.errors.join("; ")}\nRun csh help for the list of commands.\n` : USAGE);
    return 2;
  }
  const command = commandNamed(cmd);
  if (command === undefined) {
    io.err(`csh: unknown command ${JSON.stringify(cmd)}${hint(cmd, COMMAND_NAMES, "")}\nRun csh help for the list of commands.\n`);
    return 2;
  }
  if (cmd === "help") {
    const about = a.positional[0];
    if (about === undefined) {
      io.out(USAGE);
      return 0;
    }
    const c = commandNamed(about);
    if (c === undefined || about === "help") {
      io.err(`csh help: no command ${JSON.stringify(about)}${hint(about, COMMAND_NAMES, "")}\n`);
      return 2;
    }
    io.out(helpOf(c));
    return 0;
  }
  if (a.flags.has("help")) {
    io.out(helpOf(command));
    return 0;
  }
  // Every argument is checked before anything is read or run: a misspelt option is named, never silently ignored.
  const problems = [...a.errors, ...argProblems(a, command), ...valueProblems(a)];
  if (problems.length > 0) {
    io.err(`${problems.map((x) => `csh ${cmd}: ${x}`).join("\n")}\nusage: ${synopsis(command).join("\n       ")}\nRun csh help ${cmd} for more.\n`);
    return 2;
  }
  for (const k of ["root", "subject"] as const) {
    const dir = a.options[k];
    // csh init --subject names the checkout to propose from, which must exist as much as any other.
    if (dir !== undefined && !(existsSync(resolve(io.cwd, dir)) && statSync(resolve(io.cwd, dir)).isDirectory())) {
      io.err(`csh ${cmd}: --${k} ${dir} is not a directory\n`);
      return 2;
    }
  }
  try {
    return await dispatch(cmd, a, io);
  } catch (e) {
    // An error no command expected: said in one line, with the stack only when asked for.
    const err = e instanceof Error ? e : new Error(String(e));
    io.err(`csh ${cmd}: ${err.message}\n${debugging() ? `${err.stack ?? ""}\n` : "Set CSH_DEBUG=1 to see where it came from.\n"}`);
    return 1;
  }
}

async function dispatch(cmd: string, a: Args, io: Io): Promise<number> {
  if (cmd === "init") return init(io.cwd, a.options.root, io, a.options.subject);
  if (cmd === "analyse") return analyseCommand(a, io, io.solver ?? defaultSolver);
  const subject = a.options.subject !== undefined ? resolve(io.cwd, a.options.subject) : undefined;
  const p = loadProject(io.cwd, a.options.root, subject !== undefined ? { subject } : {});
  switch (cmd) {
    case "subject": {
      if (a.positional[0] !== "fetch") {
        io.err("csh subject fetch is the one subject command\n");
        return 2;
      }
      let r = fetchSubject(p);
      let commit = p.component?.manifest.subject?.commit;
      // Another commit is named by a tag or commit of the subject, resolved in the pinned checkout.
      if (r.ok && a.options.at !== undefined) {
        if (a.options.at.startsWith("-")) {
          io.err(`csh subject fetch: ${a.options.at} is not a tag or commit of the subject\n`);
          return 1;
        }
        try {
          commit = execFileSync("git", ["rev-parse", "--verify", `${a.options.at}^{commit}`], { cwd: r.dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
        } catch {
          io.err(`csh subject fetch: ${a.options.at} is not a tag or commit of the subject\n`);
          return 1;
        }
        r = fetchSubject(p, commit);
      }
      if (!r.ok) {
        io.err(`csh subject fetch: ${r.message}\n`);
        return 1;
      }
      io.out(`${r.fetched ? "fetched" : "already fetched"} ${p.component!.manifest.subject!.repo} at ${commit} into ${relative(io.cwd, r.dir)}\n`);
      // Said, never refused: the profile is the owner's to keep or commit (From real runs, stage 44).
      for (const w of subjectWarnings(p)) io.err(`warning: ${w}\n`);
      return 0;
    }
    case "run":
      return run(p, a, io);
    case "results": {
      const [sub, practice, report] = a.positional;
      if (sub !== "import" || practice === undefined || report === undefined) {
        io.err("usage: csh results import <practice> <runner-report> [--base <dir>]\n");
        return 2;
      }
      const r = importResults(p, practice, resolve(io.cwd, report), a.options.base !== undefined ? (isAbsolute(a.options.base) ? a.options.base : resolve(io.cwd, a.options.base)) : undefined);
      if (!r.ok) {
        io.err(`csh results import: ${r.message}\n`);
        return 1;
      }
      io.out(`wrote ${relative(io.cwd, r.path)}: ${r.tests} tests in ${r.files} files, ${r.cited} citing an identifier; names dropped\n`);
      return 0;
    }
    case "check": {
      const res = await runCheck(p, a, io);
      if (res === undefined) return 1;
      write(join(p.root, a.options.out ?? REPORT_PATH), stableJson(res.report));
      write(join(p.root, MODEL_PATH), stableJson(res.model));
      io.out(a.flags.has("json") ? stableJson(res.report) : renderReport(res.report, sentenceAt(p)));
      return 0;
    }
    case "gaps": {
      const res = await runCheck(p, a, io);
      if (res === undefined) return 1;
      io.out(`${renderGaps(res.report).join("\n")}\n`);
      return 0;
    }
    case "coverage": {
      const c = coverageOf(p);
      if (c === undefined) {
        io.err("csh coverage: the source root is not a git repository, so there is no list of its files\n");
        return 1;
      }
      io.out(a.flags.has("json") ? stableJson(c) : renderCoverage(c, p.component?.manifest.name ?? relative(io.cwd, p.root)));
      return 0;
    }
    case "overview": {
      // The overview reads only the report, so a run stored before runs kept their model is still read.
      const stored = a.options.run === undefined ? undefined : storedRunFiles(p, a.options.run, false);
      if (stored !== undefined && "error" in stored) {
        io.err(`csh overview: ${stored.error}\n`);
        return 2;
      }
      const report = reportFor(p, a, stored, "overview", io);
      if (report === undefined) return 2;
      const o = overviewOf(report, practiceMap(p));
      const id = a.options.signal;
      if (id !== undefined) {
        const e = o.entries.find((x) => x.anchor === id || x.signal === id) ?? o.entries.find((x) => x.anchor.startsWith(id));
        if (e === undefined) {
          io.err(`no entry ${id} in the overview\n`);
          return 2;
        }
        io.out(renderEntry(e));
        return 0;
      }
      const name = report.component?.name ?? p.component?.manifest.name ?? "component";
      const title = `${name} overview${report.subject !== undefined ? ` at ${report.subject.commit.slice(0, 12)}` : report.snapshot !== undefined ? ` at ${report.snapshot.commit.slice(0, 12)}` : ""}`;
      write(join(p.root, a.options.out ?? OVERVIEW_PATH), renderOverviewHtml(o, title));
      io.out(a.flags.has("json") ? stableJson(o) : renderOverview(o));
      return 0;
    }
    case "ladder": {
      const stored = a.options.run === undefined ? undefined : storedRunFiles(p, a.options.run, false);
      if (stored !== undefined && "error" in stored) {
        io.err(`csh ladder: ${stored.error}\n`);
        return 2;
      }
      const report = reportFor(p, a, stored, "ladder", io);
      if (report === undefined) return 2;
      const o = overviewOf(report, practiceMap(p));
      const l = ladderOf(report, o);
      io.out(a.flags.has("json") ? stableJson(l) : renderLadder(l));
      return 0;
    }
    case "expect": {
      const stored = a.options.run === undefined ? undefined : storedRunFiles(p, a.options.run, false);
      if (stored !== undefined && "error" in stored) {
        io.err(`csh expect: ${stored.error}\n`);
        return 2;
      }
      const path = resolve(p.root, a.options.expected ?? EXPECTED_PATH);
      if (!existsSync(path)) {
        io.err(`csh expect: no expected results at ${relative(io.cwd, path)}\n`);
        return 2;
      }
      const parsed = parseExpected(readFileSync(path, "utf8"));
      if (parsed.expected === undefined) {
        io.err(`csh expect: ${relative(io.cwd, path)}: ${parsed.problems.join("; ")}\n`);
        return 2;
      }
      const report = reportFor(p, a, stored, "expect", io);
      if (report === undefined) return 2;
      const r = checkExpected(overviewOf(report, practiceMap(p)), parsed.expected);
      io.out(a.flags.has("json") ? stableJson(r) : renderExpect(r));
      return r.mismatches.length === 0 ? 0 : 1;
    }
    case "explain": {
      const id = a.positional[0];
      const stored = a.options.run === undefined ? undefined : storedRunFiles(p, a.options.run);
      if (stored !== undefined && "error" in stored) {
        io.err(`csh explain: ${stored.error}\n`);
        return 2;
      }
      const report = reportFor(p, a, stored, "explain", io);
      if (report === undefined) return 2;
      const f = report.findings.find((x) => x.id === id || (id !== undefined && x.id.startsWith(id)));
      if (f === undefined) {
        // An overview entry names a signal, which is not always a finding: a violated rule, a gap. Say what it is.
        const entry = id === undefined ? undefined : overviewOf(report).entries.find((e) => e.signal === id || e.anchor === id || (e.signal !== undefined && e.signal.startsWith(id)));
        if (entry !== undefined) {
          io.out(renderEntry(entry));
          return 0;
        }
        io.err(`no finding or overview entry ${id ?? ""} in the report\n`);
        return 2;
      }
      const modelPath = stored?.model ?? join(p.root, MODEL_PATH);
      const model = existsSync(modelPath) ? readJson<Module>(modelPath) : { error: "no such file" };
      if ("error" in model) {
        io.err(`csh explain: cannot read the model at ${shown(io.cwd, modelPath)} (${model.error}); csh check writes it beside the report\n`);
        return 2;
      }
      io.out(explainFinding(f, model.value));
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
        runOptions: async () => ({ root: p.root, solver, ...(subject !== undefined ? { subject } : {}), ...(a.options.budget !== undefined ? { budgetMs: Number(a.options.budget) } : {}), ...(a.flags.has("no-cache") ? { noCache: true } : {}), harnessOutput: (x: string) => io.err(x) }),
      });
    }
    case "a3":
    case "history": {
      const solver = await (io.solver ?? defaultSolver)();
      return (cmd === "history" ? historyCommand : a3Command)(p, a, {
        out: io.out,
        err: io.err,
        runOptions: async () => ({ root: p.root, solver, ...(subject !== undefined ? { subject } : {}), ...(a.options.budget !== undefined ? { budgetMs: Number(a.options.budget) } : {}), ...(a.flags.has("no-cache") ? { noCache: true } : {}), harnessOutput: (x: string) => io.err(x) }),
      });
    }
    default:
      io.err(`csh: unknown command ${JSON.stringify(cmd)}\n`);
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
    const file = resolve(p.root, a.options.verify);
    const read = existsSync(file) ? readJson<GateDecision>(file) : { error: "no such file" };
    if ("error" in read || read.value === null || typeof read.value !== "object" || typeof read.value.snapshotDigest !== "string") {
      io.err(`csh gate --verify: ${shown(io.cwd, file)} is not a decision csh gate wrote${"error" in read ? ` (${read.error})` : ""}\n`);
      return 2;
    }
    const given = read.value;
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

/** The sentence on a line of the source tree, for a claim's span (From real runs, stage 43); undefined outside it. */
function sentenceAt(p: Project): SentenceAt {
  return (span, values = []) => {
    const m = /^(.*):(\d+)$/.exec(span);
    if (m === null) return undefined;
    const file = resolve(p.sourceRoot, m[1]!);
    if (!file.startsWith(resolve(p.sourceRoot)) || !existsSync(file)) return undefined;
    try {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      const from = Number(m[2]) - 1;
      const stating = values.length === 0 ? from : lineStating(lines, from, values);
      const at = stating ?? from;
      const line = lines[at]?.trim();
      if (line === undefined || line === "") return undefined;
      const elsewhere = stating === undefined ? linesStatingVersion(lines, values) : [];
      return { at: `${m[1]}:${at + 1}`, text: line.length > 200 ? `${line.slice(0, 197)}...` : line, stated: stating !== undefined, ...(elsewhere.length > 0 ? { elsewhere } : {}) };
    } catch {
      return undefined;
    }
  };
}
const countOf = (r: Report, kinds: string[]) => r.findings.filter((f) => kinds.includes(f.kind)).length;

/** csh run: harnesses, check and gate for one snapshot of the component (Anchor, harnesses and A3, section 4). */
async function run(p: Project, a: Args, io: Io): Promise<number> {
  const solver = await (io.solver ?? defaultSolver)();
  const mode = a.options.mode as Mode | undefined;
  if (mode !== undefined && mode !== "advisory" && mode !== "enforcing") {
    io.err("--mode is advisory or enforcing\n");
    return 2;
  }
  const o = { root: p.root, solver, ...(mode !== undefined ? { mode } : {}), ...(a.options.budget !== undefined ? { budgetMs: Number(a.options.budget) } : {}), ...(a.flags.has("no-cache") ? { noCache: true } : {}), harnessOutput: (s: string) => io.err(s), ...(a.options.subject !== undefined ? { subject: resolve(io.cwd, a.options.subject) } : {}) };
  const r: RunResult = a.options.at !== undefined ? await runAt({ ...o, commit: a.options.at }) : await runComponent({ ...o, project: p });
  if (!r.ok) {
    io.err(`csh run: ${r.code}: ${r.message}\n`);
    return r.code === "dependencies-differ" ? 3 : 1;
  }
  const { record, report, decision } = r;
  const lines = [`run ${record.component} at ${record.snapshot.commit}`];
  if (record.snapshot.subject !== undefined) lines.push(`  subject ${record.snapshot.subject.repo} at ${record.snapshot.subject.commit}`);
  for (const w of runWarnings(p)) lines.push(`  warning: ${w}`);
  for (const h of record.harnesses) lines.push(`  harness ${h.practice}: ${h.argv.join(" ")}  exit ${h.exitCode ?? h.error ?? "none"}, ${h.witnesses} witnesses, ${h.executions} executions (not sandboxed)`);
  // Said with why when results come from files, which is how a profile of someone else's repository reads its tests.
  const fromFiles = (p.component?.manifest.practices ?? []).filter((x) => x.harness === undefined && x.executions !== undefined).length;
  if (record.harnesses.length === 0) lines.push(fromFiles > 0 ? `  no practice has a harness: no test runs here; ${plural(fromFiles, "practice")} read${fromFiles === 1 ? "s" : ""} results from a file` : "  no practice has a harness");
  const conflicts = countOf(report, ["state-conflict", "joint-conflict", "example-conflict", "arch-conflict", "claim-conflict", "fact-conflict", "vacuous"]);
  lines.push(`  findings ${report.findings.length} (${plural(conflicts, "conflict")}, ${plural(countOf(report, ["example-divergence"]), "divergence")}, ${report.findings.filter((f) => f.crossSource).length} cross-source); gaps ${report.gapView.gaps.length}; not comparable ${report.notComparable.length}; ${plural(report.errors.filter((e) => e.severity === "error").length, "error")}, ${plural(report.errors.filter((e) => e.severity === "warning").length, "warning")}${report.errors.some((e) => e.severity === "info") ? `, ${plural(report.errors.filter((e) => e.severity === "info").length, "note")}` : ""}`);
  const sev = (x: string) => report.diagnostics.filter((d) => d.severity === x).length;
  lines.push(`  items ${report.items.length}; unliftable ${report.unliftable.length}; adapter diagnostics ${report.diagnostics.length} (${plural(sev("error"), "error")}, ${plural(sev("warning"), "warning")})`);
  // What the counts are made of: errors and warnings by code with an example, never only a number to go and dig for.
  const kinds = new Map<string, { n: number; at: string }>();
  for (const d of report.diagnostics) {
    if (d.severity === "info") continue;
    const k = `${d.severity} ${d.code}`;
    kinds.set(k, { n: (kinds.get(k)?.n ?? 0) + 1, at: kinds.get(k)?.at ?? d.span ?? d.message });
  }
  const shown = [...kinds].sort((x, y) => (x[0].startsWith("error") ? 0 : 1) - (y[0].startsWith("error") ? 0 : 1) || y[1].n - x[1].n).slice(0, 5);
  for (const [k, { n, at }] of shown) lines.push(`    ${n} ${k}, e.g. ${at}`);
  if (kinds.size > shown.length) lines.push(`    and ${kinds.size - shown.length} more kinds: csh check lists them`);
  for (const e of report.errors.slice(0, 5)) lines.push(`    ${e.severity} ${e.code}: ${e.detail}`);
  // A claim the facts refute, or two that disagree: the sentence and the fact, never only the claim's name (stage 43).
  const claims = report.findings.filter((f) => f.kind === "fact-conflict" || f.kind === "claim-conflict");
  const said = sentenceAt(p);
  for (const f of claims.slice(0, 5)) {
    const evidence = claimEvidence(f, said);
    lines.push(`  ${f.kind}: ${evidence.reason}`, ...evidence.lines.map((l) => `    ${l}`));
  }
  if (claims.length > 5) lines.push(`  and ${claims.length - 5} more claim findings: csh check lists them`);
  // What the profile leaves unread, said on every run of the current snapshot (From real runs, section 1.4).
  // Only sources the manifest declares are counted: a specification that declares its own would read as nothing read.
  const c = a.options.at === undefined && (p.component?.manifest.sources ?? []).length > 0 ? coverageOf(p) : undefined;
  if (c !== undefined) lines.push(c.read === c.tracked ? `  coverage: all ${c.tracked} tracked files read` : `  coverage: ${c.read} of ${c.tracked} tracked files read; not read: ${c.unread.slice(0, 3).map((u) => `${u.files} ${u.ext}`).join(", ")}${c.unread.length > 3 ? ", …" : ""}; csh coverage lists the rest`);
  const v = (x: string) => (report.assessments ?? []).filter((y) => y.verdict === x).length;
  lines.push(`  obligations ${(report.assessments ?? []).length}: conflicting ${v("conflicting")}, violated ${v("violated")}, satisfied ${v("satisfied")}, unknown ${v("unknown")}`);
  lines.push(`  gate ${decision.overall} (${decision.mode})`);
  lines.push(`  stored ${r.dir.slice(p.root.length + 1)}`);
  // A cross-source conflict or an enforcing block is a problem worth a sheet (Anchor, harnesses and A3, section 5.8).
  if (report.findings.some((f) => f.crossSource && f.kind.endsWith("-conflict")) || (decision.mode === "enforcing" && decision.overall === "block")) lines.push("  to read it as one problem: csh a3 open <slug>");
  io.out(`${lines.join("\n")}\n`);
  return exitCode(decision);
}
