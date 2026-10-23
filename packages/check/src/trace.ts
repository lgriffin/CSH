// Tracing items through their edges (Ingesting a codebase, stage 22): each edge an inventory adapter read is resolved
// against every item of every source, or against the files the repository tracks. What does not resolve, and what
// nothing verifies, is a gap. Nothing here judges whether an edge is right: a document that says it implements a
// requirement is taken at its word, and only a reference to nothing is reported.
import { compareCodePoints } from "@csh/kernel";
import type { Fact, ItemEdge } from "@csh/witness";
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

  /** The item an edge names, as Source/id, preferring the edge's own source; "file" for a tracked path; undefined
   * when it names nothing; null when it cannot be checked (a mechanism in prose, a path outside the repository's
   * top-level entries, or a file edge when the tracked files are unknown). */
  const facts = input.facts ?? [];
  const modules = new Set(facts.flatMap((f) => (f.kind === "module" ? [f.name] : [])));
  const named = new Set(facts.flatMap((f) => (f.kind === "declare" || f.kind === "export" ? [`${f.module}#${f.symbol}`] : [])));
  // A module that re-exports with * may supply any name, and the re-export is not followed (A-106).
  const starred = new Set(facts.flatMap((f) => (f.kind === "export" && f.symbol === "*" ? [f.module] : [])));
  const scripts = facts.filter((f) => f.kind === "field" && f.file === "package.json");
  /** The tracked file an edge that resolved to "file" names: the file, a bare name's only match, or a symbol's module. */
  const fileOf = (to: string): string | undefined => {
    if (to.startsWith("symbol:")) return to.slice(7).split("#")[0];
    if (!to.startsWith("file:")) return undefined;
    const p = to.slice(5).replace(/\/$/, "");
    // A directory changes whenever anything under it does: only a file is dated.
    if (files?.has(p) === true) return p;
    if (p.includes("/")) return undefined;
    const found = byBase.get(p);
    return found?.length === 1 ? found[0] : undefined;
  };
  const resolve = (source: string, e: ItemEdge): string | undefined | null => {
    if (e.to.startsWith("text:")) return null;
    // A symbol resolves when its module was read and declares or exports it; a module not read cannot be checked.
    if (e.to.startsWith("symbol:")) {
      const ref = e.to.slice(7);
      const m = ref.split("#")[0]!;
      return !modules.has(m) ? null : named.has(ref) ? "file" : starred.has(m) ? null : undefined;
    }
    if (e.to.startsWith("script:")) {
      const name = e.to.slice(7).replace(/~/g, "~0").replace(/\//g, "~1");
      return scripts.length === 0 ? null : scripts.some((f) => f.kind === "field" && f.path === `/scripts/${name}`) ? "file" : undefined;
    }
    if (e.to.startsWith("file:")) {
      if (files === undefined) return null;
      const p = e.to.slice(5).replace(/\/$/, "");
      // From the directory of the file that mentions it, when it names nothing from the root (section 5).
      const near = relativeTo(e.span, p);
      if (near !== undefined && (files.has(near) || dirs.has(near)) && !files.has(p) && !dirs.has(p)) return "file";
      // A bare name that is not a top-level file resolves when it is unique, and is unchecked otherwise: never dangling.
      if (!p.includes("/") && !files.has(p)) return byBase.get(p)?.length === 1 ? "file" : null;
      if (!top.has(p.split("/")[0]!)) return null;
      if (files.has(p) || dirs.has(p)) return "file";
      // Missing, in a sentence that says it is absent, or that names another repository: unchecked, not dangling.
      // So is a path the repository ignores, from the root or the mentioning file's directory (A-214).
      if ([p, near].some((x) => x !== undefined && (ignored.has(x) || ignored.has(`${x}/`)))) return null;
      if (e.absent === true || (e.repos ?? []).some((r) => !top.has(r.split("/")[0]!))) return null;
      return undefined;
    }
    const head = e.to.split("/")[0]!;
    if (sources.has(head) && byQualified.has(e.to)) return e.to;
    if (byQualified.has(`${source}/${e.to}`)) return `${source}/${e.to}`;
    const any = byId.get(e.to);
    if (any !== undefined) return [...any].sort(compareCodePoints)[0];
    const folded = byFolded.get(e.to.toLowerCase());
    return folded?.length === 1 ? folded[0] : undefined;
  };

  const incoming = new Map<string, Set<string>>();
  const verifiedBy = new Set<string>();
  const dangling = new Map<string, string[]>();
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
  const h = input.history;
  for (const e of edges) {
    const r = resolve(e.source, e);
    const from = `${e.source}/${e.from}`;
    const row: TraceResult["edges"][number] = { source: e.source, from: e.from, rel: e.rel, to: e.to, span: e.span };
    if (r !== undefined && r !== null && r !== "file") row.target = r;
    if (r === undefined && e.rel !== "mentions") {
      row.dangling = true;
      // With history, a file that does not exist now is told apart: deleted since it was written, or never tracked at all.
      const gone = h?.existed !== undefined && e.to.startsWith("file:") ? (h.existed(e.to.slice(5).replace(/\/$/, "")) ? " (deleted)" : " (never tracked)") : "";
      dangling.set(from, [...(dangling.get(from) ?? []), `${e.span} ${e.rel} ${/^(file|symbol|script):/.test(e.to) ? e.to.slice(e.to.indexOf(":") + 1) : e.to}${gone}`]);
    }
    out.push(row);
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
    const command = e.rel === "verified-by" && r === null ? /^text:npm run ([\w:.\-]+)(?=$|\s)/.exec(e.to) : null;
    if (command !== null) unresolvedAt.add(`${from}\u0000${e.span}\u0000${command[1]}`);
    if (e.rel === "mentions-script" && r === "file") scriptsAt.add(`${from}\u0000${e.span}\u0000${e.to.slice(7)}`);
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
    check(item, `verified by npm run ${k.slice(k.lastIndexOf("\u0000") + 1)}`);
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
    if (it.kind !== undefined && VERIFYING.has(it.kind) && !verifiedBy.has(q) && !into.has("cites")) {
      const status = it.attrs?.status !== undefined ? `; its stated status is ${it.attrs.status}` : "";
      gaps.push({ kind: "unverified", subject: q, fragments: [], detail: `${it.span}: names no mechanism that verifies it, and no test cites it${status}` });
    } else if (it.kind === "rule" && !into.has("exemplifies")) {
      const d = decided.get(q);
      gaps.push({ kind: "unverified", subject: q, fragments: [], detail: `${it.span}: no scenario sits under this rule${d !== undefined ? `; it cites ${d.join(", ")}, a decision, cited and not verified` : ""}` });
    } else if (it.kind === "property" && !into.has("cites")) {
      // A structured trace entry no scenario cites (stage 28). One that records why it has none is a justified gap: a
      // silence stated with its reason reads differently from a bare one.
      const silent = it.attrs?.silence;
      if (silent !== undefined && it.attrs?.["silence-reason"] === "stated") gaps.push({ kind: "justified-gap", subject: q, fragments: [], detail: `${it.span}: no scenario or test cites it, and it records ${silent} as none, with a reason` });
      else gaps.push({ kind: "unverified", subject: q, fragments: [], detail: `${it.span}: no scenario or test cites it${silent !== undefined ? `; it records ${silent} as none, with no reason` : ""}` });
    }
  }
  gaps.push(...stepGaps(input.prepared));
  // What each directory of accepted outputs paired (Reading test suites as evidence, section 2).
  gaps.push(...outputGaps(items));
  return { gaps, edges: out, checks };
}
