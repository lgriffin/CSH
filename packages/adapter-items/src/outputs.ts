// The accepted-output adapter (Reading test suites as evidence, section 2; stage 70). A suite pairs cases with the
// outputs a person accepted for them: baselines, golden files, approved files and snapshot files. The pairing is read
// from the files' paths alone, by each convention as its runners keep it, so a file the source reads by name (A-261)
// gives the adapter everything it needs. Each directory that holds accepted outputs is one item, with what its
// pairing found: the cases with outputs, the cases with none, the outputs no case produces, the stems two cases share,
// and the outputs no convention pairs. The check turns those into results; nothing here decides an outcome.
import { posix } from "node:path";
import { compareCodePoints, digestOf } from "@csh/kernel";
import type { Adapter, AdapterInput, AdapterOutput, SourceItem } from "@csh/witness";

export const manifest = {
  id: "csh.adapter.items.outputs",
  version: "0.1.0",
  ir: "csh-ir/v1",
  produces: ["items"],
  inputKinds: ["Outputs"],
} as const;

export type Convention = "reference tree" | "mirrored directories" | "golden siblings" | "UI outputs" | "snapshot directories" | "approved files";

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
}

const ORDER: Convention[] = ["reference tree", "mirrored directories", "golden siblings", "UI outputs", "snapshot directories", "approved files"];
const MIRRORED_IN = ["input", "inputs"];
const MIRRORED_OUT = ["expected", "output", "outputs", "golden", "goldens"];

const dirOf = (p: string) => posix.dirname(p) === "." ? "" : posix.dirname(p);
const join = (a: string, b: string) => (a === "" ? b : `${a}/${b}`);
const under = (p: string, dir: string) => dir === "" || p.startsWith(`${dir}/`);
/** A file's stem: its base name less its last extension. */
export const stemOf = (p: string): string => {
  const b = posix.basename(p);
  const i = b.lastIndexOf(".");
  return i <= 0 ? b : b.slice(0, i);
};

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

/**
 * Every directory of accepted outputs among `paths`, by the conventions of section 2. A file is claimed by the first
 * convention that reads it, in the order of the table, and a file no convention claims is no output at all.
 */
export function outputDirsOf(paths: readonly string[]): OutputDir[] {
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
  for (const d of [...dirs, ""].sort(compareCodePoints)) {
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
      else unpairedHere(o, g, named.length === 0 ? "a golden file with no sibling it names" : "a golden file with more than one sibling of its stem");
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
  // header, which stage 71 reads.
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
    if (segs.length >= 2 && segs[segs.length - 2] === "snapshots" && /\.snap$/.test(s)) unpairedHere(at(dirOf(s)), s, "an insta snapshot, named by its header (stage 71)");
  }

  // Approved files: X.m.approved.<ext> accepts the sibling test file whose stem is X.
  for (const a of free().filter((p) => /\.approved\.[^./]+$/.test(posix.basename(p)) && posix.basename(p).indexOf(".") < posix.basename(p).indexOf(".approved."))) {
    const x = posix.basename(a).slice(0, posix.basename(a).indexOf("."));
    const named = siblings(a).filter((y) => stemOf(y) === x && !/\.(approved|received)\.[^./]+$/.test(y));
    const o = at(dirOf(a) || ".");
    if (named.length === 1) pairOne(o, "approved files", named[0]!, a);
    else unpairedHere(o, a, named.length === 0 ? "an approved file with no sibling test of its name" : "an approved file with more than one sibling of its name");
  }

  for (const o of out.values()) {
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
  }
  return [...s].sort(compareCodePoints);
}

export function run(input: AdapterInput): AdapterOutput {
  const items: SourceItem[] = [];
  for (const o of outputDirsOf(input.files.map((f) => f.path))) {
    const outputs = [...o.paired.values()].reduce((n, v) => n + v.length, 0);
    const first = [...o.paired.values()].flat()[0] ?? o.orphans[0]?.output ?? o.shared[0]?.outputs[0] ?? o.unpaired[0] ?? o.unaccepted[0] ?? o.dir;
    const attrs: Record<string, string> = { cases: String(o.cases.length), paired: String(o.paired.size), outputs: String(outputs) };
    if (o.conventions.length > 0) attrs.conventions = o.conventions.join("\n");
    if (o.caseDir !== undefined) attrs.caseDir = o.caseDir;
    if (o.outDir !== undefined) attrs.outDir = o.outDir;
    if (o.unaccepted.length > 0) attrs.unaccepted = o.unaccepted.join("\n");
    if (o.orphans.length > 0) attrs.orphans = o.orphans.map((x) => `${x.output}\t${x.names}`).join("\n");
    if (o.shared.length > 0) attrs.shared = o.shared.map((x) => [x.stem, x.cases.join(" "), x.outputs.join(" ")].join("\t")).join("\n");
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
