// What a profile reads and what it leaves unread. A source that matches nothing, a language with no reader and a
// directory no source names are all skipped in silence, so a profile can look complete while a third of the repository
// is outside it. This lists, per source, the files it reads, then the tracked files no source reads, by extension.
import { posix } from "node:path";
import { compareCodePoints, globRegExp } from "@csh/kernel";
import { selectFiles, trackedDirsOf, trackedFiles } from "./sources.ts";
import type { Project } from "./project.ts";
import type { DeclaredSource } from "@csh/component";

export interface Coverage {
  tracked: number;
  read: number;
  /** Of the files read, how many are read by name, their bytes never opened (A-261). */
  byName: number;
  sources: { name: string; kind: string; files: number }[];
  unread: { ext: string; files: number; sample: string }[];
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
      if (names.some((r) => r.test(below(f.path)))) named.add(f.path);
      else whole.add(f.path);
    }
    sources.push({ name: s.name, kind: s.kind, files: files.length });
  }
  const groups = new Map<string, string[]>();
  for (const f of tracked) {
    if (read.has(f)) continue;
    const k = extOf(f);
    const g = groups.get(k);
    if (g === undefined) groups.set(k, [f]);
    else g.push(f);
  }
  const unread = [...groups].map(([ext, fs]) => ({ ext, files: fs.length, sample: fs[0]! })).sort((a, b) => b.files - a.files || compareCodePoints(a.ext, b.ext));
  return { tracked: tracked.length, read: tracked.filter((f) => read.has(f)).length, byName: [...named].filter((f) => !whole.has(f)).length, sources, unread };
}

export function renderCoverage(c: Coverage, name: string, top = 12): string {
  const lines = [`coverage ${name}: ${c.read} of ${c.tracked} tracked files read by ${c.sources.length} sources${c.byName > 0 ? `, ${c.byName} of them by name` : ""}`];
  for (const s of c.sources) lines.push(`  ${s.name.padEnd(18)} ${s.kind.padEnd(10)} ${String(s.files).padStart(6)} files${s.files === 0 ? "  (matches nothing)" : ""}`);
  const rest = c.tracked - c.read;
  lines.push(`  not read: ${rest} files`);
  for (const u of c.unread.slice(0, top)) lines.push(`    ${u.ext.padEnd(14)} ${String(u.files).padStart(6)}  e.g. ${u.sample}`);
  if (c.unread.length > top) lines.push(`    and ${c.unread.length - top} more kinds`);
  return `${lines.join("\n")}\n`;
}
