// Tracing items through their edges (Ingesting a codebase, stage 22): each edge an inventory adapter read is resolved
// against every item of every source, or against the files the repository tracks. What does not resolve, and what
// nothing verifies, is a gap. Nothing here judges whether an edge is right: a document that says it implements a
// requirement is taken at its word, and only a reference to nothing is reported.
import { compareCodePoints } from "@csh/kernel";
import { type Fact, type ItemEdge, mentionLanguageOf } from "@csh/witness";
import type { Prepared } from "./pool.ts";
import { type Citation, termsOf, unobserved } from "./grain.ts";
import { isToldRule } from "./ladder.ts";
import { outputGaps } from "./outputs.ts";
import { boundByTitle, pytestBddBindings, stepGaps } from "./steps.ts";
import type { Gap, HistoryPort, Report } from "./types.ts";

export interface TraceInput {
  prepared: Prepared;
  /** The files the repository tracks at the evaluated commit, relative to its root; undefined when not known. */
  files?: string[];
  /** Untracked paths the repository's ignore files ignore (From the Toads run, section 1): local to a checkout. */
  ignored?: string[];
  /** The code facts of the run: a symbol or script named in prose is resolved against them (stage 24). */
  facts?: Fact[];
  /** The repository's history (stage 25): with it, prose that names a file changed since is stale-prose. */
  history?: HistoryPort;
  /** What the code of every test file mentions (Reading test suites as evidence, section 4): a symbol prose names is exercised by it. */
  mentions?: TestMentions;
}

/** The identifiers the code of the run's test files holds, a port the run supplies (A-264). */
export interface TestMentions {
  /** Each identifier, keyed by its test files' language as `typescript:name`, with the test files whose code holds it. */
  byName: Map<string, string[]>;
  /** The languages of which some test file was read. */
  languages: Set<string>;
  /** Test files that could not be read, by language. */
  unread: Map<string, string[]>;
}

export { mentionLanguageOf };

const LANGUAGE_NAMES: Record<string, string> = { typescript: "TypeScript", python: "Python", java: "Java", go: "Go", rust: "Rust" };

/** A symbol and the first three test files that mention it, as `name` (a, b, c, and n more). */
const withTests = (name: string, tests: string[]) => `\`${name}\` (${tests.slice(0, 3).join(", ")}${tests.length > 3 ? `, and ${tests.length - 3} more` : ""})`;

/**
 * What the tests make of the symbols each document names (section 4): exercised when a test mentions every one,
 * unexercised when one is mentioned by none, undecided when the rest are in a language of which no test was read.
 */
function exerciseGaps(named: Map<string, Map<string, { name: string; module: string }>>, m: TestMentions): Gap[] {
  const gaps: Gap[] = [];
  for (const [subject, symbols] of [...named].sort(([a], [b]) => compareCodePoints(a, b))) {
    const mentioned: string[] = [];
    const missing: string[] = [];
    const undecided: string[] = [];
    // A name two languages declare is exercised when a test of either mentions it: the document may mean either.
    const byName = new Map<string, string[]>();
    for (const { name, module } of symbols.values()) byName.set(name, [...(byName.get(name) ?? []), module]);
    for (const [name, modules] of [...byName].sort(([a], [b]) => compareCodePoints(a, b))) {
      const why: string[] = [];
      let tests: string[] = [];
      for (const module of modules.sort(compareCodePoints)) {
        const lang = mentionLanguageOf(module);
        const label = lang === undefined ? undefined : LANGUAGE_NAMES[lang];
        const by = lang === undefined ? [] : (m.byName.get(`${lang}:${name}`) ?? []);
        const unread = lang === undefined ? [] : (m.unread.get(lang) ?? []);
        // A test that mentions it decides it, whatever else could not be read; an unread test file only leaves
        // undecided a symbol no test read mentions.
        if (by.length > 0) tests = [...tests, ...by];
        else if (lang === undefined) why.push(`${module}: no test lexer reads its language`);
        else if (unread.length > 0) why.push(`${label} code, and ${unread.slice(0, 3).join(", ")}${unread.length > 3 ? `, and ${unread.length - 3} more` : ""} could not be read`);
        else if (!m.languages.has(lang)) why.push(`${label} code, and no ${label} test file was read`);
      }
      if (tests.length > 0) mentioned.push(withTests(name, [...new Set(tests)].sort(compareCodePoints)));
      else if (why.length > 0) undecided.push(`\`${name}\` (${why.join("; ")})`);
      else missing.push(name);
    }
    const rest = `${mentioned.length > 0 ? `; mentioned by a test: ${mentioned.join(", ")}` : ""}${undecided.length > 0 ? `; undecided: ${undecided.join(", ")}` : ""}`;
    if (missing.length > 0) gaps.push({ kind: "unexercised", subject, fragments: [], detail: `names ${missing.map((n) => `\`${n}\``).join(", ")}, which no test mentions${rest}` });
    else if (undecided.length > 0) gaps.push({ kind: "exercise-undecided", subject, fragments: [], detail: `names ${undecided.join(", ")}${mentioned.length > 0 ? `; mentioned by a test: ${mentioned.join(", ")}` : ""}` });
    else if (mentioned.length > 0) gaps.push({ kind: "exercised", subject, fragments: [], detail: `each symbol it names is mentioned by a test, which exercises it and may observe nothing of what is said: ${mentioned.join(", ")}` });
  }
  return gaps;
}

export interface TraceResult {
  gaps: Gap[];
  edges: NonNullable<Report["edges"]>;
  /**
   * For each item, the mechanisms an edge says check it (The Assertion Ladder, stage 48): a test file or a scenario that
   * cites it, a scenario that sits under it, and what its "Verified by" names when that resolves.
   */
  checks: Map<string, string[]>;
}

const VERIFYING = new Set(["requirement"]);
/** Edges whose target, once resolved, says the prose describes that file: a later change to it can leave the prose stale. */
const DESCRIBING = new Set(["mentions-file", "verified-by", "mentions-symbol"]);

/** Statuses that say a requirement is checked by something (A-111). */
const ASSERTED = new Set(["Enforced"]);
const DOCUMENT = /\.(md|markdown)$/i;
/** A manifest makes its directory a package, its code under it (stage 67). */
const PACKAGE_MANIFEST = /^(?:package\.json|Cargo\.toml|pyproject\.toml|setup\.py|go\.mod|pom\.xml|build\.gradle(?:\.kts)?)$/;

/** A path read from the directory of the file a span names, or undefined when that file is at the root. */
function relativeTo(span: string, path: string): string | undefined {
  const file = span.slice(0, span.lastIndexOf(":"));
  const cut = file.lastIndexOf("/");
  if (cut < 0) return undefined;
  const parts: string[] = [];
  for (const seg of `${file.slice(0, cut)}/${path}`.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return undefined;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/");
}

/** The extensions a module path written without one may resolve to, as TypeScript and Node resolve it (A-278). */
const MODULE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", "/index.ts", "/index.js"];
/** A file whose path says it checks something: a test, or a lint or layering rule's configuration (A-280). */
/** A script or task that checks something, by its name: `pnpm dev` or `build` names no check (A-280). */
const CHECK_TASK = /(?:^|[:._-])(?:test|tests|lint|check|typecheck|types|verify|arch|architecture|layers|depcruise|cruise|e2e|knip|audit|spec|specs)(?:$|[:._-])/i;
const MECHANISM_FILE = /(?:\.(?:test|spec)\.[cm]?[jt]sx?|_test\.go|(?:^|\/)test_[^/]*\.py|\.rules\.c?[jt]s|(?:^|\/)\.?eslint[^/]*|(?:^|\/)\.dependency-cruiser\.[cm]?js(?:on)?|(?:^|\/)\.?importlinter[^/]*)$/;

export function trace(input: TraceInput): TraceResult {
  const { items, edges } = input.prepared;
  const gaps: Gap[] = [];
  const out: TraceResult["edges"] = [];
  const sources = new Set(items.map((i) => i.source));
  const byQualified = new Map(items.map((i) => [`${i.source}/${i.id}`, i]));
  const byId = new Map<string, string[]>();
  for (const i of items) byId.set(i.id, [...(byId.get(i.id) ?? []), `${i.source}/${i.id}`]);
  // An identifier that names no item as written names the one item it matches with case ignored, when only one does
  // (From the tutors run, section 1): a test tag `@rule-0056` cites RULE-0056, and the Rule's own tag is rule-0056.
  const byFolded = new Map<string, string[]>();
  for (const i of items) if (i.kind !== "document" && i.kind !== "test-file" && i.kind !== "baseline" && i.kind !== "suite") byFolded.set(i.id.toLowerCase(), [...(byFolded.get(i.id.toLowerCase()) ?? []), `${i.source}/${i.id}`]);
  const files = input.files === undefined ? undefined : new Set(input.files);
  const ignored = new Set(input.ignored ?? []);
  // A path counts as one of the repository's only when its first segment is a top-level entry of it (A-96): prose
  // writes application/json and CJS/ESM in backticks too.
  const top = new Set((input.files ?? []).map((f) => f.split("/")[0]!));
  // A bare file name (`security.test.ts`) names the one tracked file with that name, when only one has it (A-110).
  const byBase = new Map<string, string[]>();
  for (const f of input.files ?? []) {
    const b = f.slice(f.lastIndexOf("/") + 1);
    byBase.set(b, [...(byBase.get(b) ?? []), f]);
  }
  const dirs = new Set((input.files ?? []).flatMap((f) => f.split("/").slice(0, -1).map((_, n, parts) => parts.slice(0, n + 1).join("/"))));
  const dirsByBase = new Map<string, string[]>();
  for (const d of dirs) {
    const b = d.slice(d.lastIndexOf("/") + 1);
    dirsByBase.set(b, [...(dirsByBase.get(b) ?? []), d]);
  }
  /** A path as written, or a module path written without its extension (A-278). */
  const exists = (p: string): boolean => files!.has(p) || dirs.has(p) || (!/\.[^/]*$/.test(p.slice(p.lastIndexOf("/") + 1)) && MODULE_EXTENSIONS.some((x) => files!.has(`${p}${x}`)));
  /**
   * A path that names nothing from the root or the mentioning file's directory may be written from a folder further up,
   * such as a fixture's own root, or from a folder the sentence names elsewhere: it names a tracked path that ends with
   * it (A-281). From an ancestor of the mentioning file, it resolves; from elsewhere it is unchecked, never dangling.
   */
  const fromAbove = (span: string, p: string): "file" | null | undefined => {
    const file = span.slice(0, span.lastIndexOf(":"));
    const parts = file.split("/").slice(0, -1);
    for (let n = parts.length - 1; n >= 1; n--) if (exists(`${parts.slice(0, n).join("/")}/${p}`)) return "file";
    const base = p.slice(p.lastIndexOf("/") + 1);
    const ends = (x: string) => x.endsWith(`/${p}`);
    return (byBase.get(base) ?? []).some(ends) || (dirsByBase.get(base) ?? []).some(ends) || MODULE_EXTENSIONS.some((x) => (byBase.get(`${base}${x}`) ?? []).some((f) => f.endsWith(`/${p}${x}`))) ? null : undefined;
  };

  /** The item an edge names, as Source/id, preferring the edge's own source; "file" for a tracked path; undefined
   * when it names nothing; null when it cannot be checked (a mechanism in prose, a path outside the repository's
   * top-level entries, or a file edge when the tracked files are unknown). */
  const facts = input.facts ?? [];
  const modules = new Set(facts.flatMap((f) => (f.kind === "module" ? [f.name] : [])));
  const named = new Set(facts.flatMap((f) => (f.kind === "declare" || f.kind === "export" ? [`${f.module}#${f.symbol}`] : [])));
  // A module that re-exports with * may supply any name, and the re-export is not followed (A-106).
  const starred = new Set(facts.flatMap((f) => (f.kind === "export" && f.symbol === "*" ? [f.module] : [])));
  const scripts = facts.filter((f) => f.kind === "field" && f.file === "package.json");
  // The tasks of each task runner at the root (stage 68), and whether its file may name tasks its text does not show.
  const tasks = new Map<string, Set<string>>();
  for (const f of facts) if (f.kind === "task") (tasks.get(f.runner) ?? tasks.set(f.runner, new Set()).get(f.runner)!).add(f.name);
  // The names each module declares or exports, by the last part of a member's name (stage 67).
  const declaredIn = new Map<string, string[]>();
  for (const f of facts) if (f.kind === "declare" || f.kind === "export") {
    const n = f.symbol.slice(f.symbol.lastIndexOf(".") + 1);
    const where = declaredIn.get(n);
    if (where === undefined) declaredIn.set(n, [f.module]);
    else where.push(f.module);
  }
  const packages = new Set([...[...modules].map((m) => m.slice(0, m.lastIndexOf("/") + 1)), ...(input.files ?? []).filter((f) => PACKAGE_MANIFEST.test(f.slice(f.lastIndexOf("/") + 1))).map((f) => f.slice(0, f.lastIndexOf("/") + 1))]);
  const unparsed = new Set(facts.flatMap((f) => (f.kind === "skipped" && f.reason.startsWith("unparsed") ? [f.from] : [])));
  // A tracked file's name before its extension, which names a component such as `TutorsShell.svelte`.
  const stems = new Set((input.files ?? []).map((f) => f.slice(f.lastIndexOf("/") + 1).replace(/\..*$/, "")));
  /** The tracked file an edge that resolved to "file" names: the file, a bare name's only match, or a symbol's module. */
  const fileOf = (to: string): string | undefined => {
    // A name of a package names no one file, so it is never dated (stage 67).
    if (to.startsWith("symbol:")) return to.slice(7).split("#")[0]!.endsWith("/") ? undefined : to.slice(7).split("#")[0];
    if (!to.startsWith("file:")) return undefined;
    const p = to.slice(5).replace(/\/$/, "");
    // A directory changes whenever anything under it does: only a file is dated.
    if (files?.has(p) === true) return p;
    if (p.includes("/")) return undefined;
    const found = byBase.get(p);
    return found?.length === 1 ? found[0] : undefined;
  };
  /**
   * A name a package's document gives (stage 67): "file" when a module under the package declares it; unchecked when no
   * module under it was read, when code elsewhere declares it, a tracked file is named after it, or its sentence says it
   * is gone; otherwise undecided, since it may name code outside the repository.
   */
  const packageSymbol = (e: ItemEdge): "file" | null | "undecided" => {
    const [dir, name] = e.to.slice(7).split("#") as [string, string];
    // A package is a directory that holds a module read or a manifest; a module under it that could not be parsed may
    // declare the name.
    if (!packages.has(dir) || [...unparsed].some((m) => m.startsWith(dir))) return null;
    const where = declaredIn.get(name) ?? [];
    if (where.some((m) => m.startsWith(dir))) return "file";
    return where.length > 0 || stems.has(name) || e.absent === true ? null : "undecided";
  };
  const resolve = (source: string, e: ItemEdge): string | undefined | null => {
    if (e.to.startsWith("text:")) return null;
    // A symbol resolves when its module was read and declares or exports it; a module not read cannot be checked.
    if (e.to.startsWith("symbol:") && e.to.includes("/#")) return packageSymbol(e);
    if (e.to.startsWith("symbol:")) {
      const ref = e.to.slice(7);
      const m = ref.split("#")[0]!;
      return !modules.has(m) ? null : named.has(ref) ? "file" : starred.has(m) ? null : undefined;
    }
    // A task resolves when its runner's file names it; with no file of the runner read, or an open set, it is unchecked.
    if (e.to.startsWith("task:")) {
      const [runner, name] = e.to.slice(5).split("#") as [string, string];
      const known = tasks.get(runner);
      return known === undefined ? null : known.has(name) ? "file" : known.has("*") || e.absent === true ? null : undefined;
    }
    if (e.to.startsWith("script:")) {
      const name = e.to.slice(7).replace(/~/g, "~0").replace(/\//g, "~1");
      return scripts.length === 0 ? null : scripts.some((f) => f.kind === "field" && f.path === `/scripts/${name}`) ? "file" : e.absent === true ? null : undefined;
    }
    if (e.to.startsWith("file:")) {
      if (files === undefined) return null;
      const p = e.to.slice(5).replace(/\/$/, "");
      // A relative link's path is resolved already: checked as written (From the TypeScript run, section 3).
      if (e.exact === true) return exists(p) ? "file" : ignored.has(p) || ignored.has(`${p}/`) || e.absent === true || (e.repos ?? []).some((r) => !top.has(r.split("/")[0]!)) ? null : undefined;
      // From the directory of the file that mentions it, when it names nothing from the root (section 5).
      const near = relativeTo(e.span, p);
      if (near !== undefined && exists(near) && !exists(p)) return "file";
      // A bare name that is not a top-level file resolves when it is unique, and is unchecked otherwise: never dangling.
      if (!p.includes("/") && !files.has(p)) return byBase.get(p)?.length === 1 ? "file" : null;
      if (!top.has(p.split("/")[0]!)) {
        const above = fromAbove(e.span, p);
        if (above === "file") return "file";
        // Written from the mentioning file's directory, which holds its first folder, it is dangling there (A-288).
        const beside = relativeTo(e.span, p.split("/")[0]!);
        // A tracked path elsewhere that ends with it keeps it unchecked: ESI.ts's guides name tests from tests/ (A-281).
        if (above === null || beside === undefined || near === undefined || !dirs.has(beside)) return null;
        if (ignored.has(near) || ignored.has(`${near}/`) || e.absent === true || (e.repos ?? []).some((r) => !top.has(r.split("/")[0]!))) return null;
        return undefined;
      }
      if (exists(p)) return "file";
      // Missing, in a sentence that says it is absent, or that names another repository: unchecked, not dangling.
      // So is a path the repository ignores, from the root or the mentioning file's directory (A-214).
      if ([p, near].some((x) => x !== undefined && (ignored.has(x) || ignored.has(`${x}/`)))) return null;
      if (e.absent === true || (e.repos ?? []).some((r) => !top.has(r.split("/")[0]!))) return null;
      return fromAbove(e.span, p);
    }
    const head = e.to.split("/")[0]!;
    if (sources.has(head) && byQualified.has(e.to)) return e.to;
    if (byQualified.has(`${source}/${e.to}`)) return `${source}/${e.to}`;
    const any = byId.get(e.to);
    if (any !== undefined) return [...any].sort(compareCodePoints)[0];
    const folded = byFolded.get(e.to.toLowerCase());
    if (folded?.length === 1) return folded[0];
    // A feature a test loads may be written from a fixture's own root, further up than the repository's (A-281).
    if (e.rel === "loads") {
      const parts = e.span.slice(0, e.span.lastIndexOf(":")).split("/").slice(0, -1);
      for (let n = parts.length - 1; n >= 1; n--) {
        const up = byId.get(`${parts.slice(0, n).join("/")}/${e.to}`);
        if (up !== undefined) return [...up].sort(compareCodePoints)[0];
      }
    }
    return undefined;
  };

  // The test files whose code mentions every term a statement writes (A-265): the tests that could cite it.
  const nearestTests = (text: string): string => {
    const m = input.mentions;
    const terms = termsOf(text);
    if (m === undefined || terms.length === 0) return "";
    let common: string[] | undefined;
    for (const t of terms) {
      const by = [...m.languages].flatMap((l) => m.byName.get(`${l}:${t}`) ?? []);
      const bySet = new Set(by);
      common = common === undefined ? [...bySet] : common.filter((f) => bySet.has(f));
      if (common.length === 0) return "";
    }
    const near = [...common!].sort(compareCodePoints);
    return `; tests that mention every term it writes, and could cite it: ${near.slice(0, 3).join(", ")}${near.length > 3 ? `, and ${near.length - 3} more` : ""}`;
  };
  const incoming = new Map<string, Set<string>>();
  const verifiedBy = new Set<string>();
  const dangling = new Map<string, string[]>();
  const undecided = new Map<string, string[]>();
  const supported = new Set<string>();
  const unresolvedAt = new Set<string>();
  const scriptsAt = new Set<string>();
  const testCited = new Set<string>();
  // The decisions a feature or rule names (stage 42): shown on its gap as cited, never counted as verifying it.
  const decided = new Map<string, string[]>();
  const checks = new Map<string, string[]>();
  // What each item's checking citations observe (stage 57), for its grain.
  const citations = new Map<string, Citation[]>();
  const check = (item: string, how: string) => {
    const seen = checks.get(item) ?? [];
    if (!seen.includes(how)) checks.set(item, [...seen, how]);
  };
  const stale = new Map<string, Map<string, string>>();
  // What a line names that checks something and exists: a script or task, a test file, or a rule's configuration (A-280).
  const mechanismAt = new Map<string, string>();
  // The Java and Kotlin test files by their class's name: prose names a test class, `ArchitectureTest` or
  // `ArchitectureTest.memoryIsLeaf`, and in those languages the class is the file (A-299).
  const testStems = new Map<string, string[]>();
  for (const i of items) if (i.kind === "test-file" && /\.(?:java|kt)$/.test(i.id)) {
    const stem = i.id.slice(i.id.lastIndexOf("/") + 1).replace(/\.[^.]*$/, "");
    testStems.set(stem, [...(testStems.get(stem) ?? []), i.id].sort(compareCodePoints));
  }
  const namedTest = (sentence: string): string | undefined => {
    for (const m of sentence.matchAll(/`([A-Za-z_$][\w$]*)(?:\.[\w$]+)*(?:\(\))?`/g)) {
      const found = testStems.get(m[1]!);
      if (found !== undefined) return found[0];
    }
    return undefined;
  };
  // Each symbol a document names, once for each language that declares it, with a module that does.
  const namedSymbols = new Map<string, Map<string, { name: string; module: string }>>();
  const h = input.history;
  for (const e of edges) {
    const resolved = resolve(e.source, e);
    const from = `${e.source}/${e.from}`;
    if (resolved === "undecided") undecided.set(from, [...(undecided.get(from) ?? []), `${e.span} ${e.to.slice(e.to.indexOf("#") + 1)}`]);
    const r = resolved === "undecided" ? null : resolved;
    const row: TraceResult["edges"][number] = { source: e.source, from: e.from, rel: e.rel, to: e.to, span: e.span };
    if (r !== undefined && r !== null && r !== "file") row.target = r;
    if (r === undefined && e.rel !== "mentions") {
      row.dangling = true;
      // With history, a file that does not exist now is told apart: deleted since it was written, or never tracked at all.
      const gone = h?.existed !== undefined && e.to.startsWith("file:") ? (h.existed(e.to.slice(5).replace(/\/$/, "")) ? " (deleted)" : " (never tracked)") : "";
      dangling.set(from, [...(dangling.get(from) ?? []), `${e.span} ${e.rel} ${e.to.startsWith("task:") ? e.to.slice(5).replace("#", " ") : /^(file|symbol|script):/.test(e.to) ? e.to.slice(e.to.indexOf(":") + 1) : e.to}${gone}`]);
    }
    out.push(row);
    if (r === "file" && !mechanismAt.has(e.span)) {
      const task = e.to.startsWith("task:") ? e.to.slice(e.to.indexOf("#") + 1) : e.to.slice(7);
      if (e.rel === "mentions-script" && CHECK_TASK.test(task)) mechanismAt.set(e.span, e.to.startsWith("task:") ? e.to.slice(5).replace("#", " ") : `npm run ${e.to.slice(7)}`);
      else if (e.rel === "mentions-file" && MECHANISM_FILE.test(e.to.slice(5))) mechanismAt.set(e.span, e.to.slice(5));
    }
    // A symbol prose names that resolves to the code, and the module that declares it, for what the tests exercise.
    if (e.rel === "mentions-symbol" && r === "file") {
      const [where, symbol] = e.to.slice(7).split("#") as [string, string];
      const name = symbol.slice(symbol.lastIndexOf(".") + 1);
      const modules = where.endsWith("/") ? (declaredIn.get(name) ?? []).filter((x) => x.startsWith(where)).sort(compareCodePoints) : [where];
      const at = namedSymbols.get(from) ?? namedSymbols.set(from, new Map()).get(from)!;
      for (const module of modules) {
        const key = `${mentionLanguageOf(module) ?? module}:${name}`;
        if (!at.has(key)) at.set(key, { name, module });
      }
    }
    if (e.rel === "verified-by") verifiedBy.add(from);
    if (e.rel === "decided-by") decided.set(from, [...(decided.get(from) ?? []), e.to.replace(/^file:/, "")]);
    // A mechanism that resolves supports a stated status: a verified-by edge to a file or an item, or the script a
    // verified-by `npm run x` names, read as a mentions-script edge on the same line.
    if (e.rel === "verified-by" && typeof r === "string") {
      supported.add(from);
      check(from, `verified by ${r === "file" ? e.to.replace(/^(file|symbol|script):/, "") : r}`);
    }
    // What checks an item, for its rung: a citation or a scenario under it, from a test file or a scenario (stage 48).
    // A Gherkin rule or feature that cites an item states it again; only its scenarios check anything.
    if ((e.rel === "cites" || e.rel === "exemplifies") && typeof r === "string" && r !== "file") {
      const kind = byQualified.get(from)?.kind;
      if (kind === "test-file") check(r, `test file ${e.from}`);
      else if (kind === "scenario") check(r, `scenario ${from}`);
      if (kind === "test-file" || kind === "scenario") citations.set(r, [...(citations.get(r) ?? []), { span: e.span, ...(e.observes !== undefined ? { observes: e.observes } : {}), ...(e.reader !== undefined ? { reader: e.reader } : {}) }]);
    }
    // The command and the script are matched by name, so another script on the same line supports nothing.
    // A task runner's command is matched the same way, by its runner and task (stage 68).
    const command = e.rel === "verified-by" && r === null ? /^text:(?:(?:npm|pnpm|yarn) run ([\w:.\-]+)|(?:npx\s+)?(hereby|make|just)\s+([\w:./][\w:./-]*))(?=$|\s)/.exec(e.to) : null;
    if (command !== null) unresolvedAt.add(`${from}\u0000${e.span}\u0000${command[1] ?? `${command[2]}#${command[3]}`}`);
    if (e.rel === "mentions-script" && r === "file") scriptsAt.add(`${from}\u0000${e.span}\u0000${e.to.slice(e.to.indexOf(":") + 1)}`);
    // Only a test file's citation counts as a test citing a requirement: a tagged scenario cites without testing.
    if (e.rel === "cites" && typeof r === "string" && r !== "file" && byQualified.get(from)?.kind === "test-file") testCited.add(r);
    // Stale prose (stage 25): the line naming a file was last changed before the file was. Documents are not code.
    if (h !== undefined && r === "file" && DESCRIBING.has(e.rel)) {
      const path = fileOf(e.to);
      const at = /^(.*):(\d+)$/.exec(e.span);
      if (path !== undefined && at !== null && !DOCUMENT.test(path) && h.frozen?.(at[1]!) !== true && h.volatile?.(path) !== true) {
        const key = `${e.span} ${path}`;
        const seen = stale.get(from);
        if (seen?.has(key) !== true) {
          const line = h.lineCommit(at[1]!, Number(at[2]));
          const after = line === undefined ? [] : h.changedSince(line.commit, path);
          if (after.length > 0) {
            const m = seen ?? new Map<string, string>();
            m.set(key, `${e.span} names ${path}, changed in ${after.length} commit${after.length === 1 ? "" : "s"} since the line (newest ${after[0]!.commit.slice(0, 12)}, ${after[0]!.date.slice(0, 10)})`);
            stale.set(from, m);
          }
        }
      }
    }
    if (typeof r === "string" && r !== "file") {
      const set = incoming.get(r) ?? new Set<string>();
      set.add(e.rel);
      incoming.set(r, set);
    }
  }
  for (const [subject, refs] of dangling) {
    gaps.push({ kind: "dangling-reference", subject, fragments: [], detail: `names what does not exist: ${refs.join("; ")}` });
  }
  for (const k of unresolvedAt) if (scriptsAt.has(k)) {
    const item = k.slice(0, k.indexOf("\u0000"));
    supported.add(item);
    const name = k.slice(k.lastIndexOf("\u0000") + 1);
    check(item, `verified by ${name.includes("#") ? name.replace("#", " ") : `npm run ${name}`}`);
  }
  for (const [subject, refs] of undecided) {
    gaps.push({ kind: "symbol-undecided", subject, fragments: [], detail: `names in backticks that no code of the repository declares: ${refs.join("; ")}` });
  }
  for (const [subject, refs] of stale) {
    gaps.push({ kind: "stale-prose", subject, fragments: [], detail: [...refs.keys()].sort(compareCodePoints).map((k) => refs.get(k)!).join("; ") });
  }
  // A scenario, or a scenario of specification prose, that a test carries the title of is checked by that test (section 2).
  const titled = boundByTitle(items);
  // A scenario a pytest-bdd module binds is checked by it; one it may bind, or binds by nothing, is said so (A-216).
  const bdd = pytestBddBindings(items);
  for (const [q, by] of bdd.bound) for (const t of by) check(q, `test file ${t}, by pytest-bdd`);
  gaps.push(...bdd.gaps);
  for (const it of items) {
    const q = `${it.source}/${it.id}`;
    const by = titled.get(q);
    for (const t of by ?? []) check(q, `test file ${t.slice(t.indexOf("/") + 1)}, by its title`);
    if (by !== undefined && it.attrs?.gherkin === "prose") (incoming.get(q) ?? incoming.set(q, new Set()).get(q)!).add("cites");
    // A baseline the repository says may only shrink (section 6): each entry is a gap it already records.
    if (it.kind === "baseline") {
      const n = Number(it.attrs?.entries ?? "0");
      if (n > 0) gaps.push({ kind: "baselined", subject: q, fragments: [], detail: `${it.span}: ${n} ${n === 1 ? "entry" : "entries"} the repository records as known and still open, in a file that may only shrink: ${(it.attrs?.first ?? "").split("\n").join("; ")}${n > 5 ? `; and ${n - 5} more` : ""}` });
      continue;
    }
    const into = incoming.get(q) ?? new Set<string>();
    // Grain (stage 57): the terms a told rule writes in backticks that no test or scenario citing it observes.
    const cs = citations.get(q) ?? [];
    const terms = isToldRule(it) ? termsOf(it.text) : [];
    const missing = unobserved(terms, cs);
    if (missing !== undefined && missing.length > 0) {
      const seen = terms.filter((t) => !missing.includes(t));
      const readers = [...new Set(cs.map((c) => c.reader!).filter((x) => x !== undefined))].sort(compareCodePoints);
      const by = cs.map((c) => c.span).sort(compareCodePoints);
      gaps.push({ kind: "unobserved-terms", subject: q, fragments: [], detail: `${it.span}: constrains ${terms.map((t) => `\`${t}\``).join(", ")}; ${by.length === 1 ? "the test" : `the ${by.length} tests`} citing it (${by.join(", ")}) observe${by.length === 1 ? "s" : ""} ${seen.length === 0 ? "none of them" : `${seen.map((t) => `\`${t}\``).join(", ")} only`}; not observed: ${missing.map((t) => `\`${t}\``).join(", ")}; read by the ${readers.join(", ")} reader${readers.length === 1 ? "" : "s"}` });
    }
    // A status that says the requirement is checked, while nothing it names as a mechanism resolves (stage 25).
    const status = it.attrs?.status;
    // Judged only with history, as the stage that brought it, and only when the tracked files are known: unknown
    // files leave every file mechanism unresolved.
    if (h !== undefined && files !== undefined && it.kind !== undefined && VERIFYING.has(it.kind) && status !== undefined && ASSERTED.has(status) && !supported.has(q) && !testCited.has(q)) {
      gaps.push({ kind: "status-unsupported", subject: q, fragments: [], detail: `${it.span}: its stated status is ${status}, and nothing it names as a mechanism resolves, and no test cites it` });
    }
    // A told rule lifted from a sentence that names its own check, on its line or as a test class anywhere in it, is
    // verified by it (A-280, A-299).
    const onLine = it.attrs?.lifted !== undefined ? mechanismAt.get(it.span) : undefined;
    const own = onLine ?? (it.attrs?.lifted !== undefined ? namedTest(it.attrs.sentence ?? "") : undefined);
    if (own !== undefined && !verifiedBy.has(q) && !into.has("cites")) check(q, `${onLine !== undefined ? "named on its line" : "a test class its sentence names"}: ${own}`);
    // A retired requirement holds no longer, and a plan's only proposes one, so nothing need verify either (A-295, A-297).
    else if (it.kind !== undefined && VERIFYING.has(it.kind) && !verifiedBy.has(q) && !into.has("cites") && it.attrs?.retired === undefined && it.attrs?.proposed === undefined) {
      const status = it.attrs?.status !== undefined ? `; its stated status is ${it.attrs.status}` : "";
      gaps.push({ kind: "unverified", subject: q, fragments: [], detail: `${it.span}: names no mechanism that verifies it, and no test cites it${status}${nearestTests(it.text)}` });
    } else if (it.kind === "rule" && !into.has("exemplifies")) {
      const d = decided.get(q);
      gaps.push({ kind: "unverified", subject: q, fragments: [], detail: `${it.span}: no scenario sits under this rule${d !== undefined ? `; it cites ${d.join(", ")}, a decision, cited and not verified` : ""}${nearestTests(it.text)}` });
    } else if (it.kind === "property" && !into.has("cites")) {
      // A structured trace entry no scenario cites (stage 28). One that records why it has none is a justified gap: a
      // silence stated with its reason reads differently from a bare one.
      const silent = it.attrs?.silence;
      if (silent !== undefined && it.attrs?.["silence-reason"] === "stated") gaps.push({ kind: "justified-gap", subject: q, fragments: [], detail: `${it.span}: no scenario or test cites it, and it records ${silent} as none, with a reason` });
      else gaps.push({ kind: "unverified", subject: q, fragments: [], detail: `${it.span}: no scenario or test cites it${silent !== undefined ? `; it records ${silent} as none, with no reason` : ""}` });
    }
  }
  if (input.mentions !== undefined) gaps.push(...exerciseGaps(namedSymbols, input.mentions));
  gaps.push(...stepGaps(input.prepared));
  // What each directory of accepted outputs paired (Reading test suites as evidence, section 2).
  gaps.push(...outputGaps(items));
  return { gaps, edges: out, checks };
}
