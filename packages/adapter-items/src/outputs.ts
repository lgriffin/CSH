// The accepted-output adapter (Reading test suites as evidence, section 2; stage 70). A suite pairs cases with the
// outputs a person accepted for them: baselines, golden files, approved files and snapshot files. The pairing is read
// from the files' paths alone, by each convention as its runners keep it, so a file the source reads by name (A-261)
// gives the adapter everything it needs. Each directory that holds accepted outputs is one item, with what its
// pairing found: the cases with outputs, the cases with none, the outputs no case produces, the stems two cases share,
// and the outputs no convention pairs. The check turns those into results; nothing here decides an outcome. A Jest or
// Vitest snapshot file is also read for its entries, each matched with a test of the file it names (section 3; stage
// 71), and an output no convention pairs may be named after a test file.
import { posix } from "node:path";
import { compareCodePoints, digestOf } from "@csh/kernel";
import type { Adapter, AdapterInput, AdapterOutput, SourceItem } from "@csh/witness";
import { decode } from "./common.ts";
import { testNames } from "./tests.ts";

export const manifest = {
  id: "csh.adapter.items.outputs",
  version: "0.1.0",
  ir: "csh-ir/v1",
  produces: ["items"],
  inputKinds: ["Outputs"],
} as const;

export type Convention = "reference tree" | "mirrored directories" | "golden siblings" | "UI outputs" | "snapshot directories" | "approved files" | "named after a test file" | "named after a test function";

/** What the pairing found in one directory of accepted outputs. */
export interface OutputDir {
  dir: string;
  /** The conventions that paired outputs here, in the order of the table in section 2. */
  conventions: Convention[];
  /** The directories the cases and the outputs sit under, for a reference tree or mirrored directories. */
  caseDir?: string;
  outDir?: string;
  /** Every case of the suite: for the conventions found from the output, only the cases an output names. */
  cases: string[];
  /** Each case with the outputs it accepts. */
  paired: Map<string, string[]>;
  /** Cases of a reference tree or mirrored directories with no accepted output. */
  unaccepted: string[];
  /** Outputs no case produces, each with what it names or where its case would be. */
  orphans: { output: string; names: string }[];
  /** Stems two cases share: neither is told which outputs it wrote. */
  shared: { stem: string; cases: string[]; outputs: string[] }[];
  /** Outputs no convention pairs, with why. */
  unpaired: string[];
  why?: string;
  /** Test files a stem two of them share names, which the source reads so that the adapter sees the same pairing. */
  named?: string[];
  /** The files whose text the pairing read (stage 74), which the source reads whole so that the adapter reads them too. */
  opened?: string[];
  /** Cases that stay code as well: the source file an insta snapshot's header names, which holds its tests. */
  code?: string[];
  /** The entries of each snapshot or output named after a test, read from its text or its name (stage 74, A-269). */
  entries?: Entries[];
}

/** What one snapshot file's entries, or one output named after a test, say of the test file they name. */
export interface Entries {
  snapshot: string;
  test: string;
  entries: number;
  matched: number;
  unmatched: string[];
  /** Lines of the test file holding a name CSH cannot read: an unmatched entry there is undecided, not obsolete. */
  unreadable: number[];
}

const ORDER: Convention[] = ["reference tree", "mirrored directories", "golden siblings", "UI outputs", "snapshot directories", "approved files", "named after a test file", "named after a test function"];
const MIRRORED_IN = ["input", "inputs"];
const MIRRORED_OUT = ["expected", "output", "outputs", "golden", "goldens"];
// Mirrored directories are a suite only beneath a directory of tests or test data: a program's own input and output
// packages (src/io/input beside src/io/output) are code, not cases and their outputs.
const TEST_ROOTS = ["test", "tests", "__tests__", "spec", "specs", "testdata", "testing", "fixtures", "__fixtures__", "e2e"];
const testRoot = (seg: string) => TEST_ROOTS.includes(seg) || /[-_.]tests?$/i.test(seg);

const dirOf = (p: string) => posix.dirname(p) === "." ? "" : posix.dirname(p);
const join = (a: string, b: string) => (a === "" ? b : `${a}/${b}`);
const under = (p: string, dir: string) => dir === "" || p.startsWith(`${dir}/`);
/** A file's stem: its base name less its last extension. */
export const stemOf = (p: string): string => {
  const b = posix.basename(p);
  const i = b.lastIndexOf(".");
  return i <= 0 ? b : b.slice(0, i);
};

/**
 * A test file's stem less its test affix (A-267), for the test files the proposal reads as tests: `x.test.ts` and
 * `x.spec.js` (any JavaScript or TypeScript extension), `test_x.py` and `x_test.py`, `XTest.java` and `XTests.java`,
 * and `x_test.go` are `x` or `X`; undefined for any other file.
 */
export function testStemOf(p: string): string | undefined {
  const b = posix.basename(p);
  return (/^(.+)\.(?:test|spec)\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.exec(b) ?? /^test_(.+)\.py$/.exec(b) ?? /^(.+)_test\.(?:py|go)$/.exec(b) ?? /^(.+?)Tests?\.java$/.exec(b))?.[1];
}

/** The stem of `stems` an output's base name begins with, followed by `.` or `(` or nothing; the longest wins. */
function stemFor(base: string, stems: ReadonlySet<string>): string | undefined {
  let best: string | undefined;
  if (stems.has(base)) best = base;
  for (let i = 1; i < base.length; i++) {
    const c = base[i];
    if ((c === "." || c === "(") && stems.has(base.slice(0, i)) && (best === undefined || i > best.length)) best = base.slice(0, i);
  }
  return best;
}

/** The keys of a syrupy `.ambr` file, each `# name:` line's name as written. */
export function syrupyKeys(text: string): string[] {
  return [...text.matchAll(/^# name: (.+)$/gm)].map((m) => m[1]!.trimEnd());
}

/** A syrupy key less its parameters and its counter: `TestC.test_x[a].1` is `TestC.test_x`. */
export const syrupyName = (key: string): string => key.replace(/\.\d+$/, "").replace(/\[.*\]$/, "");

/**
 * The tests of a Python module: each `test` function, and each `test` method of a `Test` class, as `TestC.test_x`. A
 * function defined inside a function, or a method of a class pytest does not collect, is no test.
 */
export function pythonTestNames(text: string): Set<string> {
  const names = new Set<string>();
  const open: { indent: number; name: string; def: boolean }[] = [];
  for (const line of text.split("\n")) {
    const m = /^([ \t]*)(?:(?:async[ \t]+)?def[ \t]+(\w+)|class[ \t]+(\w+))/.exec(line);
    if (m === null) continue;
    const indent = m[1]!.length;
    while (open.length > 0 && open.at(-1)!.indent >= indent) open.pop();
    const def = m[2] !== undefined;
    const name = (m[2] ?? m[3])!;
    if (def && name.startsWith("test") && open.every((o) => !o.def && o.name.startsWith("Test"))) names.add([...open.map((o) => o.name), name].join("."));
    open.push({ indent, name, def });
  }
  return names;
}

/** The file an insta snapshot's header names as its `source:`, or undefined when it has no header. */
export function instaSource(text: string): string | undefined {
  const head = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return head === null ? undefined : /^source: *(.+?) *$/m.exec(head[1]!)?.[1];
}

/** An insta snapshot's name: what follows the last `__` of its stem, less an `@suffix` and a `-n` counter. */
export const instaName = (path: string): string => {
  const b = posix.basename(path).replace(/\.snap$/, "");
  const at = b.lastIndexOf("__", b.includes("@") ? b.indexOf("@") : b.length);
  return (at < 0 ? b : b.slice(at + 2)).replace(/@.*$/, "").replace(/-\d+$/, "");
};

/**
 * The snapshot names a Rust file gives: each function's name, and its name less `test_`; and each literal first
 * argument of an `assert_*snapshot!` call with more than one argument. A call whose first of several arguments is not a
 * literal names its snapshot as CSH cannot read, and its line is unreadable.
 */
export function rustSnapshotNames(text: string): { names: Set<string>; unreadable: number[] } {
  const names = new Set<string>();
  for (const m of text.matchAll(/\bfn\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
    names.add(m[1]!);
    if (m[1]!.startsWith("test_")) names.add(m[1]!.slice(5));
  }
  const unreadable: number[] = [];
  for (const m of text.matchAll(/\bassert_\w*snapshot!\s*\(/g)) {
    const args = topLevelArgs(text, m.index + m[0].length);
    if (args.length < 2) continue;
    const lit = /^\s*"((?:[^"\\]|\\.)*)"\s*$/.exec(args[0]!);
    if (lit !== null) names.add(lit[1]!);
    else unreadable.push(text.slice(0, m.index).split("\n").length);
  }
  return { names, unreadable };
}

/** The arguments of a call from just past its open parenthesis, split at its top-level commas. */
function topLevelArgs(text: string, from: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let start = from;
  for (let i = from; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"') {
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === "\\") i++;
    } else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) {
        if (text.slice(start, i).trim() !== "") args.push(text.slice(start, i));
        return args;
      }
      depth--;
    } else if (c === "," && depth === 0) {
      args.push(text.slice(start, i));
      start = i + 1;
    }
  }
  return args;
}

/** Whether a Java file's class `cls` declares a method `method` in its body (A-269 reads the name, not the method's body). */
export function javaDeclares(text: string, cls: string, method: string): boolean {
  const word = (w: string) => w.replace(/[$]/g, "\\$");
  const head = new RegExp(`\\b(?:class|record|enum)\\s+${word(cls)}\\b[^{;]*\\{`).exec(text);
  if (head === null) return false;
  const body = text.slice(head.index + head[0].length, closing(text, head.index + head[0].length, "{", "}"));
  for (const m of body.matchAll(new RegExp(`[\\w>\\]]\\s+${word(method)}\\s*\\(`, "g"))) {
    const end = closing(body, m.index + m[0].length, "(", ")");
    if (end < body.length && /^\s*(?:throws\s[^{;]*)?\{/.test(body.slice(end + 1))) return true;
  }
  return false;
}

/** The index of the bracket that closes one opened just before `from`, or the text's length when none does. */
function closing(text: string, from: number, open: string, close: string): number {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"') {
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === "\\") i++;
    } else if (c === open) depth++;
    else if (c === close && depth-- === 0) return i;
  }
  return text.length;
}

/**
 * The lines of a Go test file that may name the golden file `golden` as CSH cannot rule out: a literal holding its
 * name, or one that builds a golden file's path from parts (`".golden"`, `"testdata"`, `t.Name()`, goldie).
 */
export function goGoldenLines(text: string, golden: string): number[] {
  const b = posix.basename(golden);
  const stem = b.replace(/\.golden$/, "");
  return text.split("\n").flatMap((l, i) => (l.includes(b) || l.includes(`"${stem}"`) || /\bt\.Name\(\)|"\.golden"|"testdata\/?"|\bgoldie\b/.test(l) ? [i + 1] : []));
}

/** The `TestX` functions a Go test file declares. */
export function goTestFunctions(text: string): Set<string> {
  return new Set([...text.matchAll(/^func\s+(Test[A-Za-z0-9_]*)\s*\(/gm)].map((m) => m[1]!));
}

/** The test function an output named after one names: its stem up to its first dot, with `Test` before it if it has none. */
export const testFunctionOf = (path: string): string => {
  const b = posix.basename(path);
  const stem = b.indexOf(".") > 0 ? b.slice(0, b.indexOf(".")) : b;
  return /^Test(?![a-z])/.test(stem) ? stem : `Test${stem.slice(0, 1).toUpperCase()}${stem.slice(1)}`;
};

/**
 * Every directory of accepted outputs among `paths`, by the conventions of section 2. A file is claimed by the first
 * convention that reads it, in the order of the table, and a file no convention claims is no output at all. With
 * `read`, the conventions of stage 74 read what they need of a file's text: an insta header, a syrupy file's names, a
 * test file's tests (A-269). A file `read` cannot give, or gives empty, is one the pairing could not read.
 */
export function outputDirsOf(paths: readonly string[], read?: (path: string) => string | undefined): OutputDir[] {
  const all = [...new Set(paths)].sort(compareCodePoints);
  const files = new Set(all);
  const dirs = new Set<string>();
  for (const p of all) for (let d = dirOf(p); d !== ""; d = dirOf(d)) dirs.add(d);
  const claimed = new Set<string>();
  const out = new Map<string, OutputDir>();
  const at = (dir: string): OutputDir => {
    let o = out.get(dir);
    if (o === undefined) out.set(dir, (o = { dir, conventions: [], cases: [], paired: new Map(), unaccepted: [], orphans: [], shared: [], unpaired: [] }));
    return o;
  };
  const uses = (o: OutputDir, c: Convention) => {
    if (!o.conventions.includes(c)) o.conventions.push(c);
  };
  const kids = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string) => {
    const l = m.get(k);
    if (l === undefined) m.set(k, [v]);
    else l.push(v);
  };
  for (const d of [...dirs].sort(compareCodePoints)) push(kids, dirOf(d), d);
  const inDir = new Map<string, string[]>();
  for (const p of all) push(inDir, dirOf(p), p);
  // Every file whose text the pairing asked for, by the directory whose pairing asked (A-269).
  const opened = new Map<string, Set<string>>();
  const note = (o: OutputDir, p: string) => (opened.get(o.dir) ?? opened.set(o.dir, new Set()).get(o.dir)!).add(p);
  const peek = (p: string): string | undefined => {
    const t = read?.(p);
    return t === undefined || t === "" ? undefined : t;
  };
  const text = (o: OutputDir, p: string): string | undefined => {
    note(o, p);
    return peek(p);
  };
  const entriesOf = (o: OutputDir, e: Entries) => (o.entries ??= []).push(e);
  const filesUnder = (dir: string): string[] => [...(inDir.get(dir) ?? []), ...(kids.get(dir) ?? []).flatMap(filesUnder)].sort(compareCodePoints);
  const childDirs = (dir: string) => kids.get(dir) ?? [];

  /** Pair the outputs with the cases by stem; `sameDir` keeps a pair at the same path below each root. */
  const pairSuite = (o: OutputDir, convention: Convention, caseRoot: string, outRoot: string, cases: string[], outputs: string[], sameDir: boolean) => {
    uses(o, convention);
    o.caseDir = caseRoot;
    o.outDir = outRoot;
    const key = (p: string, root: string) => (sameDir ? join(dirOf(p.slice(root.length + 1)), stemOf(p)) : stemOf(p));
    const byStem = new Map<string, string[]>();
    for (const c of cases) push(byStem, key(c, caseRoot), c);
    // The stems a case offers, by the directory below its root that an output must share (none for a reference tree).
    const stemsAt = new Map<string, Set<string>>();
    for (const k of byStem.keys()) {
      const at = sameDir ? dirOf(k) : "";
      (stemsAt.get(at) ?? stemsAt.set(at, new Set()).get(at)!).add(sameDir ? posix.basename(k) : k);
    }
    const got = new Map<string, string[]>();
    for (const out of outputs) {
      const rel = out.slice(outRoot.length + 1);
      const base = posix.basename(rel);
      const prefix = sameDir ? dirOf(rel) : "";
      const s = stemFor(base, stemsAt.get(prefix) ?? new Set());
      if (s === undefined) o.orphans.push({ output: out, names: caseRoot });
      else {
        const k = sameDir ? join(prefix, s) : s;
        push(got, k, out);
      }
    }
    for (const c of cases) o.cases.push(c);
    for (const [k, cs] of [...byStem].sort((a, b) => compareCodePoints(a[0], b[0]))) {
      const outs = got.get(k) ?? [];
      if (cs.length > 1) o.shared.push({ stem: join(dirOf(cs[0]!), posix.basename(k)), cases: cs, outputs: outs });
      else if (outs.length === 0) o.unaccepted.push(cs[0]!);
      else o.paired.set(cs[0]!, outs);
    }
  };

  // Reference trees: R ends in baselines/reference; its cases are under a directory named cases whose parent is the
  // directory holding baselines, or a child of it.
  for (const r of [...dirs].filter((d) => d === "baselines/reference" || d.endsWith("/baselines/reference")).sort(compareCodePoints)) {
    if (filesUnder(r).every((p) => claimed.has(p))) continue;
    const p = dirOf(dirOf(r));
    const c = [join(p, "cases"), ...childDirs(p).map((d) => join(d, "cases"))].find((d) => dirs.has(d) && d !== join(p, "baselines/cases"));
    for (const f of inDir.get(r) ?? []) {
      at(r).unpaired.push(f);
      at(r).why = "a file directly in the reference tree belongs to no suite";
      claimed.add(f);
    }
    for (const s of childDirs(r)) {
      const outs = filesUnder(s).filter((x) => !claimed.has(x));
      const caseDir = c === undefined ? undefined : join(c, posix.basename(s));
      if (caseDir === undefined || !dirs.has(caseDir)) {
        at(s).unpaired.push(...outs);
        at(s).why = `no namesake case directory${c !== undefined ? ` under ${c}` : ""}`;
      } else {
        const cases = filesUnder(caseDir).filter((x) => !claimed.has(x));
        pairSuite(at(s), "reference tree", caseDir, s, cases, outs, false);
        for (const x of cases) claimed.add(x);
      }
      for (const x of outs) claimed.add(x);
    }
  }

  // Mirrored directories: D/input beside D/expected (or output, outputs, golden, goldens), paired at the same path.
  for (const d of [...dirs].filter((x) => x.split("/").some(testRoot)).sort(compareCodePoints)) {
    const kids = new Set(childDirs(d).map((x) => posix.basename(x)));
    const i = MIRRORED_IN.find((n) => kids.has(n));
    const e = MIRRORED_OUT.find((n) => kids.has(n));
    if (i === undefined || e === undefined) continue;
    const caseRoot = join(d, i);
    const outRoot = join(d, e);
    const cases = filesUnder(caseRoot).filter((x) => !claimed.has(x));
    const outs = filesUnder(outRoot).filter((x) => !claimed.has(x));
    if (outs.length === 0) continue;
    pairSuite(at(d === "" ? "." : d), "mirrored directories", caseRoot, outRoot, cases, outs, true);
    for (const x of [...cases, ...outs]) claimed.add(x);
  }

  const free = () => all.filter((p) => !claimed.has(p));
  const siblings = (p: string) => (inDir.get(dirOf(p)) ?? []).filter((x) => x !== p);
  const pairOne = (o: OutputDir, c: Convention, testFile: string, output: string) => {
    uses(o, c);
    if (!o.cases.includes(testFile)) o.cases.push(testFile);
    o.paired.set(testFile, [...(o.paired.get(testFile) ?? []), output]);
    claimed.add(output);
  };
  const unpairedHere = (o: OutputDir, output: string, why: string) => {
    o.unpaired.push(output);
    o.why = o.why === undefined || o.why === why ? why : `${o.why}, or ${why}`;
    claimed.add(output);
  };

  // Golden siblings: F.golden or F.expected accepts the sibling F, or else the one sibling whose stem is F.
  for (const g of free().filter((p) => /\.(golden|expected)$/.test(p))) {
    const f = g.replace(/\.(golden|expected)$/, "");
    const o = at(dirOf(g) || ".");
    if (files.has(f)) pairOne(o, "golden siblings", f, g);
    else {
      const named = siblings(g).filter((x) => !/\.(golden|expected)$/.test(x) && stemOf(x) === posix.basename(f));
      if (named.length === 1) pairOne(o, "golden siblings", named[0]!, g);
      else {
        unpairedHere(o, g, named.length === 0 ? "a golden file with no sibling it names" : "a golden file with more than one sibling of its stem");
        // The source reads the siblings too, so the adapter sees two and does not take the golden file for a lone one.
        if (named.length > 1) o.named = [...new Set([...(o.named ?? []), ...named])].sort(compareCodePoints);
      }
    }
  }

  // UI outputs: a .stderr or .stdout under a directory named ui beneath tests accepts the sibling .rs of its stem.
  for (const u of free().filter((p) => /\.(stderr|stdout)$/.test(p))) {
    const segs = u.split("/").slice(0, -1);
    const t = segs.indexOf("tests");
    if (t < 0 || !segs.slice(t + 1).includes("ui")) continue;
    const rs = join(dirOf(u), `${stemOf(u)}.rs`);
    const o = at(dirOf(u));
    if (files.has(rs)) pairOne(o, "UI outputs", rs, u);
    else {
      uses(o, "UI outputs");
      o.orphans.push({ output: u, names: rs });
      claimed.add(u);
    }
  }

  // Snapshot directories: __snapshots__/a.test.ts.snap names the test file a.test.ts above it (Jest, Vitest);
  // test_a.ambr, or a directory test_a/, names test_a.py (syrupy). An insta snapshot in snapshots/ names its test by its
  // header, which stage 74 reads.
  for (const s of free()) {
    const segs = s.split("/");
    const k = segs.lastIndexOf("__snapshots__", segs.length - 2);
    if (k >= 0) {
      const snaps = segs.slice(0, k + 1).join("/");
      const parent = segs.slice(0, k).join("/");
      const o = at(snaps);
      const rest = segs.slice(k + 1);
      const named = rest.length > 1 ? join(parent, `${rest[0]}.py`) : /\.snap$/.test(s) && /\.[A-Za-z]+$/.test(rest[0]!.slice(0, -5)) ? join(parent, rest[0]!.slice(0, -5)) : /\.ambr$/.test(s) ? join(parent, `${rest[0]!.slice(0, -5)}.py`) : undefined;
      if (named === undefined) unpairedHere(o, s, "a file in a snapshot directory that names no test file");
      else if (files.has(named)) pairOne(o, "snapshot directories", named, s);
      else if (rest.length > 1) unpairedHere(o, s, "a snapshot directory whose name names no test module");
      else {
        uses(o, "snapshot directories");
        o.orphans.push({ output: s, names: named });
        claimed.add(s);
      }
      continue;
    }
    if (segs.length >= 2 && segs[segs.length - 2] === "snapshots" && /\.snap$/.test(s)) {
      // An insta snapshot names its test by its header's source:, a path from the crate's root (A-269). The source
      // file holds the tests and stays code.
      const o = at(dirOf(s));
      const t = text(o, s);
      const source = t === undefined ? undefined : instaSource(t);
      if (source === undefined) {
        unpairedHere(o, s, t === undefined ? "an insta snapshot CSH did not read" : "an insta snapshot with no source: in its header");
        continue;
      }
      const crates = [];
      for (let d = dirOf(s); ; d = dirOf(d)) {
        crates.push(d);
        if (d === "") break;
      }
      const crate = crates.find((d) => files.has(join(d, "Cargo.toml"))) ?? "";
      // The source reads the manifest by name too, so the adapter finds the same crate root.
      if (files.has(join(crate, "Cargo.toml")) && !(o.named ?? []).includes(join(crate, "Cargo.toml"))) o.named = [...(o.named ?? []), join(crate, "Cargo.toml")].sort(compareCodePoints);
      const named = [crate, ...crates].map((d) => join(d, source)).find((x) => files.has(x));
      if (named === undefined) {
        uses(o, "snapshot directories");
        o.orphans.push({ output: s, names: join(crate, source) });
        claimed.add(s);
        continue;
      }
      pairOne(o, "snapshot directories", named, s);
      if (!(o.code ??= []).includes(named)) o.code.push(named);
      const rs = text(o, named);
      if (rs === undefined) continue;
      const name = instaName(s);
      const r = rustSnapshotNames(rs);
      const matched = r.names.has(name);
      entriesOf(o, { snapshot: s, test: named, entries: 1, matched: matched ? 1 : 0, unmatched: matched ? [] : [name], unreadable: r.unreadable });
    }
  }

  // Approved files: X.m.approved.<ext> accepts the sibling test file whose stem is X.
  for (const a of free().filter((p) => /\.approved\.[^./]+$/.test(posix.basename(p)) && posix.basename(p).indexOf(".") < posix.basename(p).indexOf(".approved."))) {
    const x = posix.basename(a).slice(0, posix.basename(a).indexOf("."));
    const named = siblings(a).filter((y) => stemOf(y) === x && !/\.(approved|received)\.[^./]+$/.test(y));
    const o = at(dirOf(a) || ".");
    if (named.length === 1) pairOne(o, "approved files", named[0]!, a);
    else unpairedHere(o, a, named.length === 0 ? "an approved file with no sibling test of its name" : "an approved file with more than one sibling of its name");
  }

  // Named after a test file (section 3; stage 71, A-267): an output no convention paired whose name begins with a test
  // file's stem less its affix, as TypeScript's fourslash baselines are. A stem two test files share pairs nothing. A
  // test file whose stem names outputs of more than one directory keeps those of the directory its own directory's test
  // files name most, so a fourslash test is not taken to write a tsc baseline that a scenario of the same name writes.
  // An accepted output is never a test file, even when its name has a test's affix.
  const outputs = new Set<string>();
  for (const o of out.values()) {
    for (const v of o.paired.values()) for (const x of v) outputs.add(x);
    for (const x of o.unpaired) outputs.add(x);
    for (const x of o.orphans) outputs.add(x.output);
  }
  const byTest = new Map<string, string[]>();
  for (const p of all) {
    if (outputs.has(p)) continue;
    const t = testStemOf(p);
    if (t !== undefined) push(byTest, t, p);
  }
  const testStems = new Set(byTest.keys());
  const found: { o: OutputDir; output: string; tests: string[] }[] = [];
  for (const o of out.values()) for (const u of o.unpaired) {
    const t = stemFor(posix.basename(u), testStems);
    found.push({ o, output: u, tests: t === undefined ? [] : byTest.get(t)! });
  }
  const dirsOf = new Map<string, Set<string>>();
  const named = new Map<string, number>();
  for (const f of found) {
    if (f.tests.length !== 1) continue;
    const t = f.tests[0]!;
    (dirsOf.get(t) ?? dirsOf.set(t, new Set()).get(t)!).add(f.o.dir);
    const k = `${dirOf(t)}\t${f.o.dir}`;
    named.set(k, (named.get(k) ?? 0) + 1);
  }
  const homeOf = (t: string) => [...dirsOf.get(t)!].sort((a, b) => (named.get(`${dirOf(t)}\t${b}`) ?? 0) - (named.get(`${dirOf(t)}\t${a}`) ?? 0) || compareCodePoints(a, b))[0]!;
  // The outputs no test file's stem names, which stage 74 may find named after a test function.
  const unnamed = new Set<string>();
  const tally = new Map<OutputDir, { left: string[]; twice: number; elsewhere: number; none: number }>();
  for (const f of found) {
    const t = tally.get(f.o) ?? tally.set(f.o, { left: [], twice: 0, elsewhere: 0, none: 0 }).get(f.o)!;
    const test = f.tests[0];
    if (f.tests.length === 1 && (dirsOf.get(test!)!.size === 1 || homeOf(test!) === f.o.dir)) pairOne(f.o, "named after a test file", test!, f.output);
    else {
      t.left.push(f.output);
      if (f.tests.length > 1) {
        t.twice++;
        f.o.named = [...new Set([...(f.o.named ?? []), ...f.tests])].sort(compareCodePoints);
      } else if (f.tests.length === 1) t.elsewhere++;
      else {
        t.none++;
        unnamed.add(f.output);
      }
    }
  }
  for (const [o, t] of tally) {
    // The rest keep their reason; where test files named some of a directory's outputs, it says the rest name none.
    const someNamed = t.left.length < o.unpaired.length;
    o.unpaired = t.left;
    const reasons = [
      ...(t.twice > 0 ? ["a stem two test files share"] : []),
      ...(t.elsewhere > 0 ? ["a stem of a test file whose directory's tests write another suite"] : []),
      ...(t.none > 0 ? [someNamed ? `${o.why ?? "no convention"}, and no test file of its name` : (o.why ?? "")] : []),
    ];
    if (t.left.length === 0) delete o.why;
    else o.why = reasons.join(", or ");
  }

  // Named after a test function (section 3; stage 74, A-269). A golden file in a Go package's testdata, or beside its
  // tests, names the function TestX of the package's test files: one that none declares, where CSH read them all, is
  // obsolete. Any other output no convention paired is named after the one test function of the checkout's Go test
  // files its stem names, as TypeScript's fourslash baselines are when a test file declares more than one.
  if (read !== undefined) {
    const goTests = all.filter((p) => /_test\.go$/.test(p) && !outputs.has(p));
    const declared = new Map<string, Set<string>>();
    // A file read only to find which file declares a function is not recorded; the files a pairing rests on are.
    const fnsOf = (p: string) => {
      let fs = declared.get(p);
      if (fs === undefined) {
        const t = peek(p);
        if (t !== undefined) declared.set(p, (fs = goTestFunctions(t)));
      }
      return fs;
    };
    const done = new Set<string>();
    const byFunction = (o: OutputDir, u: string, test: string) => {
      pairOne(o, "named after a test function", test, u);
      entriesOf(o, { snapshot: u, test, entries: 1, matched: 1, unmatched: [], unreadable: [] });
      done.add(u);
    };
    const left: { o: OutputDir; u: string }[] = [];
    for (const o of out.values()) for (const u of o.unpaired) {
      const fn = testFunctionOf(u);
      const d = dirOf(u);
      const pkg = posix.basename(d) === "testdata" ? dirOf(d) : d;
      // Only a golden file with no sibling of its stem: one with two is the golden siblings' to decide.
      const f = u.replace(/\.golden$/, "");
      const golden = /\.golden$/.test(u);
      const lone = golden && !files.has(f) && !siblings(u).some((x) => !/\.(golden|expected)$/.test(x) && stemOf(x) === posix.basename(f));
      const own = lone ? goTests.filter((p) => dirOf(p) === pkg) : [];
      for (const p of own) note(o, p);
      const fns = own.map(fnsOf);
      const by = own.filter((_, i) => fns[i]?.has(fn) === true);
      if (by.length === 1) byFunction(o, u, by[0]!);
      else if (own.length > 0 && by.length === 0 && fns.every((f) => f !== undefined)) {
        // The tests are the package's, so the golden file is theirs: obsolete, not unpaired (A-269), unless a test names
        // it, or names golden files as CSH cannot read (a table case, t.Name()), when it is undecided.
        uses(o, "named after a test function");
        for (const p of own) if (!o.cases.includes(p)) o.cases.push(p);
        const naming = own.map((p) => ({ p, lines: goGoldenLines(peek(p)!, u) })).find((x) => x.lines.length > 0);
        if (naming === undefined) entriesOf(o, { snapshot: u, test: own.join(", "), entries: 1, matched: 0, unmatched: [fn], unreadable: [] });
        else entriesOf(o, { snapshot: u, test: naming.p, entries: 1, matched: 0, unmatched: [fn], unreadable: naming.lines });
        done.add(u);
      } else if (unnamed.has(u) && (!golden || lone)) left.push({ o, u });
    }
    if (left.length > 0) {
      const anywhere = new Map<string, string[]>();
      for (const p of goTests) for (const fn of fnsOf(p) ?? []) push(anywhere, fn, p);
      for (const { o, u } of left) {
        const by = anywhere.get(testFunctionOf(u)) ?? [];
        // Every file declaring the function is read whole, so the adapter sees one where CSH saw one, and two where two.
        for (const p of by) note(o, p);
        if (by.length === 1) byFunction(o, u, by[0]!);
      }
    }
    for (const o of out.values()) {
      if (!o.unpaired.some((u) => done.has(u))) continue;
      o.unpaired = o.unpaired.filter((u) => !done.has(u));
      if (o.unpaired.length === 0) delete o.why;
    }
  }

  // The entries of a syrupy snapshot file and of an approved file, read with the test file each names (A-269).
  if (read !== undefined) for (const o of out.values()) for (const [test, outs] of o.paired) {
    if (/\.py$/.test(test)) for (const snap of outs.filter((x) => /(?:^|\/)__snapshots__\/[^/]+\.ambr$/.test(x))) {
      const sn = text(o, snap);
      const t = text(o, test);
      if (sn === undefined || t === undefined) continue;
      const names = pythonTestNames(t);
      const keys = syrupyKeys(sn);
      const unmatched = keys.filter((k) => !names.has(syrupyName(k)));
      entriesOf(o, { snapshot: snap, test, entries: keys.length, matched: keys.length - unmatched.length, unmatched, unreadable: [] });
    }
    if (/\.java$/.test(test) && o.conventions.includes("approved files")) for (const a of outs.filter((x) => /\.approved\.[^./]+$/.test(x))) {
      const t = text(o, test);
      if (t === undefined) continue;
      const [cls, method] = posix.basename(a).split(".");
      const ok = method !== undefined && javaDeclares(t, cls!, method);
      entriesOf(o, { snapshot: a, test, entries: 1, matched: ok ? 1 : 0, unmatched: ok ? [] : [method ?? cls!], unreadable: [] });
    }
  }

  for (const o of out.values()) {
    const seen = opened.get(o.dir);
    if (seen !== undefined && seen.size > 0) o.opened = [...seen].sort(compareCodePoints);
    o.code?.sort(compareCodePoints);
    o.conventions.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    o.cases.sort(compareCodePoints);
    o.unaccepted.sort(compareCodePoints);
    o.orphans.sort((a, b) => compareCodePoints(a.output, b.output));
    o.unpaired.sort(compareCodePoints);
  }
  return [...out.values()].sort((a, b) => compareCodePoints(a.dir, b.dir));
}

/** The files of `paths` that a suite reads: its cases and its outputs, claimed or unpaired. */
export function suiteFilesOf(dirs: readonly OutputDir[]): string[] {
  const s = new Set<string>();
  for (const o of dirs) {
    for (const c of o.cases) s.add(c);
    for (const v of o.paired.values()) for (const x of v) s.add(x);
    for (const x of o.unaccepted) s.add(x);
    for (const x of o.orphans) s.add(x.output);
    for (const x of o.shared) for (const y of [...x.cases, ...x.outputs]) s.add(y);
    for (const x of o.unpaired) s.add(x);
    for (const x of o.named ?? []) s.add(x);
    for (const x of o.opened ?? []) s.add(x);
    for (const e of o.entries ?? []) s.add(e.snapshot);
  }
  return [...s].sort(compareCodePoints);
}

/** The keys of a Jest or Vitest snapshot file, unescaped, and the runner its first line names. */
export function snapshotKeys(text: string): { runner: "jest" | "vitest" | undefined; keys: string[] } {
  const first = text.slice(0, text.indexOf("\n") < 0 ? text.length : text.indexOf("\n"));
  const runner = /^\/\/ Jest Snapshot/.test(first) ? "jest" : /^\/\/ Vitest Snapshot/.test(first) ? "vitest" : undefined;
  const keys: string[] = [];
  // Each entry is exports[`key`] = `value`; with a backtick, a backslash and ${ escaped in both, so a value cannot
  // hold a line that reads as a key.
  const entry = /^exports\[`((?:[^`\\]|\\[\s\S])*)`\]\s*=\s*`(?:[^`\\]|\\[\s\S])*`;?/gm;
  for (const m of text.matchAll(entry)) keys.push(m[1]!.replace(/\\([\s\S])/g, "$1"));
  return { runner, keys };
}

/** What the entries of a snapshot file say of the tests of the file it names (section 3; A-266). */
export function snapshotEntries(snap: string, test: string): { entries: number; matched: number; unmatched: string[]; unreadable: number[] } {
  const { runner, keys } = snapshotKeys(snap);
  const { names, unreadable } = testNames(test);
  const ways = runner === "jest" ? [[" ", ": "]] : runner === "vitest" ? [[" > ", " > "]] : [[" ", ": "], [" > ", " > "]];
  const full = ways.map(([sep, hint]) => ({ names: new Set(names.map((n) => n.join(sep))), hint: hint! }));
  const named = (k: string) => {
    const name = k.replace(/ \d+$/, "");
    return full.some((w) => w.names.has(name) || [...w.names].some((n) => name.startsWith(`${n}${w.hint}`)));
  };
  const unmatched = keys.filter((k) => !named(k));
  return { entries: keys.length, matched: keys.length - unmatched.length, unmatched, unreadable };
}

const JS = /\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;

export function run(input: AdapterInput): AdapterOutput {
  const items: SourceItem[] = [];
  const bytes = new Map(input.files.map((f) => [f.path, f.bytes]));
  const read = (p: string) => {
    const b = bytes.get(p);
    return b === undefined || b.length === 0 ? undefined : decode(b);
  };
  for (const o of outputDirsOf(input.files.map((f) => f.path), read)) {
    const outputs = [...o.paired.values()].reduce((n, v) => n + v.length, 0);
    const first = [...o.paired.values()].flat()[0] ?? o.orphans[0]?.output ?? o.shared[0]?.outputs[0] ?? o.unpaired[0] ?? o.unaccepted[0] ?? o.dir;
    const attrs: Record<string, string> = { cases: String(o.cases.length), paired: String(o.paired.size), outputs: String(outputs) };
    if (o.conventions.length > 0) attrs.conventions = o.conventions.join("\n");
    if (o.caseDir !== undefined) attrs.caseDir = o.caseDir;
    if (o.outDir !== undefined) attrs.outDir = o.outDir;
    if (o.unaccepted.length > 0) attrs.unaccepted = o.unaccepted.join("\n");
    if (o.orphans.length > 0) attrs.orphans = o.orphans.map((x) => `${x.output}\t${x.names}`).join("\n");
    if (o.shared.length > 0) attrs.shared = o.shared.map((x) => JSON.stringify({ stem: x.stem, cases: x.cases, outputs: x.outputs })).join("\n");
    if (o.caseDir === undefined && o.cases.some((c) => !c.startsWith(`${o.dir}/`) && dirOf(c) !== dirOf(o.dir))) attrs.elsewhere = "true";
    // A Jest or Vitest snapshot's entries, read where the source read both files whole (not by name).
    let entries = 0;
    let matched = 0;
    const obsolete: string[] = [];
    const undecided: string[] = [];
    for (const [test, outs] of o.paired) {
      if (!JS.test(test)) continue;
      const t = decode(bytes.get(test) ?? new Uint8Array(0));
      for (const snap of outs.filter((x) => /(?:^|\/)__snapshots__\/[^/]+\.snap$/.test(x))) {
        const sn = decode(bytes.get(snap) ?? new Uint8Array(0));
        if (sn === "" || t === "") continue;
        const e = snapshotEntries(sn, t);
        entries += e.entries;
        matched += e.matched;
        if (e.unmatched.length === 0) continue;
        if (e.unreadable.length === 0) for (const key of e.unmatched) obsolete.push(JSON.stringify({ snapshot: snap, key, test }));
        else undecided.push(JSON.stringify({ snapshot: snap, test, entries: e.unmatched.length, lines: e.unreadable }));
      }
    }
    // The entries stage 74 read with the pairing: syrupy, insta, approved files and outputs named after a test function.
    for (const e of o.entries ?? []) {
      entries += e.entries;
      matched += e.matched;
      if (e.unmatched.length === 0) continue;
      if (e.unreadable.length === 0) for (const key of e.unmatched) obsolete.push(JSON.stringify({ snapshot: e.snapshot, key, test: e.test }));
      else undecided.push(JSON.stringify({ snapshot: e.snapshot, test: e.test, entries: e.unmatched.length, lines: e.unreadable }));
    }
    if (entries > 0) {
      attrs.entries = String(entries);
      attrs.entriesMatched = String(matched);
    }
    if (obsolete.length > 0) attrs.obsolete = obsolete.join("\n");
    if (undecided.length > 0) attrs.undecided = undecided.join("\n");
    if (o.unpaired.length > 0) {
      attrs.unpaired = String(o.unpaired.length);
      attrs.unpairedSample = o.unpaired[0]!;
      attrs.unpairedWhy = o.why ?? "";
    }
    items.push({ id: o.dir, kind: "suite", text: o.dir, span: `${first}:1`, textDigest: digestOf(new TextEncoder().encode(JSON.stringify(attrs))), attrs });
  }
  return { items, diagnostics: [] };
}

export const adapter: Adapter = { manifest: { ...manifest, produces: [...manifest.produces], inputKinds: [...manifest.inputKinds] }, run };
