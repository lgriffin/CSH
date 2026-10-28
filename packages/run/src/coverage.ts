// What a profile reads and what it leaves unread. A source that matches nothing, a language with no reader and a
// directory no source names are all skipped in silence, so a profile can look complete while a third of the repository
// is outside it. This lists, per source, the files it reads, then the tracked files no source reads, by extension.
import { posix } from "node:path";
import { compareCodePoints, globRegExp } from "@csh/kernel";
import { selectFiles, trackedDirsOf, trackedFiles } from "./sources.ts";
import type { Project } from "./project.ts";
import type { DeclaredSource } from "@csh/component";
import { coverageLine, type LanguageCount, languageStatus, readLanguageOf, type SkipReason } from "@csh/check";
import { languageOf, runnerOf } from "@csh/facts-code";
import { buildOutputsOf, CODE_EXT, INSTALLED_DIRS, MANIFESTS } from "./propose.ts";

export { coverageLine };

export interface Coverage {
  tracked: number;
  read: number;
  /** Of the files read, how many are read by name, their bytes never opened (A-261). */
  byName: number;
  /** Tracked files less those skipped for a reason: what a profile should read (stage 75). */
  eligible: number;
  sources: { name: string; kind: string; files: number }[];
  unread: { ext: string; files: number; sample: string }[];
  /** The unread files skipped, by why. */
  skipped: { reason: SkipReason; files: number; sample: string }[];
  /** The unread files that are eligible, by extension: what the profile misses. */
  missed: { ext: string; files: number; sample: string }[];
  /** The code files read whole, by language, and the eligible code of a language CSH has no reader for (stage 78). */
  languages: LanguageCount[];
}

/** Extensions some source kind of CSH reads; a file of any other kind has no reader unless a source reads it. */
const READABLE_EXT = new Set([...CODE_EXT, "md", "markdown", "feature", "snap", "mmd"]);
/** Files read by their name or path rather than their extension: import-linter and dependency-cruiser contracts, issues. */
const readableByName = (path: string, base: string) =>
  MANIFESTS.includes(base) || runnerOf(base) !== undefined || base === ".importlinter" || base === "setup.cfg" || /^\.dependency-cruiser\.(?:c?js|mjs|json)$/.test(base) || path.endsWith(".beads/issues.jsonl") || path === "issues.jsonl";
const TEST_DATA_DIRS = ["testdata", "fixtures", "__fixtures__"];

/** Why an unread file is skipped, or undefined when it is eligible: a file some profile should read (A-268). */
function skipReasonOf(path: string, outputs: Set<string>): SkipReason | undefined {
  const segs = path.split("/");
  const dirs = segs.slice(0, -1);
  if (dirs.some((s) => INSTALLED_DIRS.includes(s))) return "installed or vendored";
  if (dirs.some((_, i) => outputs.has(segs.slice(0, i + 1).join("/")))) return "build output";
  if (dirs.some((s) => TEST_DATA_DIRS.includes(s))) return "test data no suite pairs";
  const base = segs[segs.length - 1]!;
  const dot = base.lastIndexOf(".");
  if (readableByName(path, base) || (dot > 0 && READABLE_EXT.has(base.slice(dot + 1).toLowerCase()))) return undefined;
  return "with no reader";
}

/** Files grouped by a key, largest group first. */
function grouped<K extends string>(files: readonly string[], key: (f: string) => K): { key: K; files: number; sample: string }[] {
  const groups = new Map<K, string[]>();
  for (const f of files) {
    const k = key(f);
    const g = groups.get(k);
    if (g === undefined) groups.set(k, [f]);
    else g.push(f);
  }
  return [...groups].map(([k, fs]) => ({ key: k, files: fs.length, sample: fs[0]! })).sort((a, b) => b.files - a.files || compareCodePoints(a.key, b.key));
}

/** The extension that groups an unread file: ".rs", or the whole name for a file with none (Dockerfile). */
const extOf = (path: string): string => {
  const base = posix.basename(path);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? base : base.slice(dot).toLowerCase();
};

/** What the component reads of its source root and what it does not. Undefined when the root is not a git repository. */
export function coverageOf(p: Project): Coverage | undefined {
  return coverageOfSources(p.sourceRoot, p.component?.manifest.sources ?? []);
}

/** What `declared` would read of the git checkout at `root` (csh init --subject shows it before a manifest exists). */
export function coverageOfSources(root: string, declared: readonly DeclaredSource[]): Coverage | undefined {
  const tracked = trackedFiles(root);
  if (tracked === undefined) return undefined;
  const read = new Set<string>();
  // A file one source reads by name and another reads whole is read whole.
  const named = new Set<string>();
  const whole = new Set<string>();
  const code = new Set<string>();
  const sources: Coverage["sources"] = [];
  const dirs = trackedDirsOf(tracked);
  const isTracked = new Set(tracked);
  for (const s of declared) {
    const files = selectFiles(root, s.at, s.include, s.exclude, dirs).filter((f) => isTracked.has(f.path));
    const base = posix.normalize(s.at) === "." ? "" : posix.normalize(s.at).replace(/\/$/, "");
    const below = (p: string) => (base === "" ? p : p.startsWith(`${base}/`) ? p.slice(base.length + 1) : posix.basename(p));
    const names = (s.names ?? []).map(globRegExp);
    for (const f of files) {
      read.add(f.path);
      if (s.kind === "Code") code.add(f.path);
      if (names.some((r) => r.test(below(f.path)))) named.add(f.path);
      else whole.add(f.path);
    }
    sources.push({ name: s.name, kind: s.kind, files: files.length });
  }
  const notRead = tracked.filter((f) => !read.has(f));
  const outputs = buildOutputsOf(tracked).dirs;
  const reasons = new Map(notRead.map((f) => [f, skipReasonOf(f, outputs)] as const));
  const missed = notRead.filter((f) => reasons.get(f) === undefined);
  const unread = grouped(notRead, extOf).map((g) => ({ ext: g.key, files: g.files, sample: g.sample }));
  const skipped = grouped(notRead.filter((f) => reasons.get(f) !== undefined), (f) => reasons.get(f)!).map((g) => ({ reason: g.key, files: g.files, sample: g.sample }));
  const touched = tracked.length - notRead.length;
  return {
    tracked: tracked.length,
    read: touched,
    byName: [...named].filter((f) => !whole.has(f)).length,
    eligible: touched + missed.length,
    sources,
    unread,
    skipped,
    missed: grouped(missed, extOf).map((g) => ({ ext: g.key, files: g.files, sample: g.sample })),
    // Code read whole by a Code source, by language; then code in a language no reader reads, whether or not a source
    // would have read it, but not code installed, built or kept as test data.
    languages: languagesOf([...whole].filter((f) => code.has(f)), notRead.filter((f) => reasons.get(f) === undefined || reasons.get(f) === "with no reader")),
  };
}

/** Code files read whole by language, then unread files in a language with no reader; most files first. */
function languagesOf(whole: readonly string[], notRead: readonly string[]): LanguageCount[] {
  const read = grouped(whole.filter((f) => readLanguageOf(f) !== undefined), (f) => readLanguageOf(f)!);
  const unread = grouped(notRead.filter((f) => readLanguageOf(f) === undefined && languageOf(f) !== undefined), (f) => languageOf(f)!);
  return [...read.map((g) => ({ language: g.key, files: g.files, status: languageStatus(g.key) })), ...unread.map((g) => ({ language: g.key, files: g.files, status: "unread" as const }))];
}

export function renderCoverage(c: Coverage, name: string, top = 12): string {
  const lines = [`${coverageLine(c).replace(/^coverage:/, `coverage ${name}:`)}`, `  read by ${c.sources.length} sources:`];
  for (const s of c.sources) lines.push(`    ${s.name.padEnd(18)} ${s.kind.padEnd(10)} ${String(s.files).padStart(6)} files${s.files === 0 ? "  (matches nothing)" : ""}`);
  if (c.skipped.length > 0) {
    lines.push(`  skipped: ${c.tracked - c.eligible} files`);
    for (const k of c.skipped) lines.push(`    ${k.reason.padEnd(26)} ${String(k.files).padStart(6)}  e.g. ${k.sample}`);
  }
  const missed = c.eligible - c.read;
  lines.push(`  eligible, not read: ${missed} files`);
  for (const u of c.missed.slice(0, top)) lines.push(`    ${u.ext.padEnd(14)} ${String(u.files).padStart(6)}  e.g. ${u.sample}`);
  if (c.missed.length > top) lines.push(`    and ${c.missed.length - top} more kinds`);
  return `${lines.join("\n")}\n`;
}
