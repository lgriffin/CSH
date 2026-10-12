// The component manifest (Anchor, harnesses and A3, section 2.1): one named unit of software under evaluation, the
// practices that describe it and the sources each practice feeds. It says what is evaluated, never what is right: it
// holds no judgment and no authority.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { compareCodePoints, digestOf, type Module } from "@csh/kernel";

export const COMPONENT_PATH = "csh/component.json";
export const COMPONENT_SCHEMA = "csh-component/v1";
/**
 * Version 2 (Ingesting a codebase, stage 21) adds a subject, a repository evaluated from outside at a pinned commit,
 * makes the specification optional, and lets a component without one declare its sources in the manifest. Version 1
 * manifests are read unchanged.
 */
export const COMPONENT_SCHEMA_V2 = "csh-component/v2";
export const PRACTICE_KINDS = ["requirements", "scenarios", "tests", "design-notes", "architecture", "facts", "documents", "issues", "traces"] as const;
/** Where a harness's execution lines go when the manifest does not say (section 3.2). */
export const DEFAULT_EXECUTIONS = "reports/executions.ndjson";
/** How long a harness command may run when the manifest does not say: ten minutes (owner-decided, #20). */
export const DEFAULT_HARNESS_TIMEOUT_MS = 600000;

export interface Harness {
  /** An argument vector, never a shell string. */
  run: string[];
  /** The witness file the run writes. */
  witnesses: string;
  /** The file the test runner's reporter writes one line per finished test to (default reports/executions.ndjson). */
  executions?: string;
  /** Milliseconds the command may run before its process tree is killed (default ten minutes). */
  timeoutMs?: number;
}

export interface Practice {
  /** A lane on the A3: "ears", "bdd", "tdd". */
  id: string;
  name: string;
  kind: (typeof PRACTICE_KINDS)[number];
  /** Names of s.source(...) in the specification that this practice feeds. */
  sources: string[];
  /** Package or project path of the adapter; built in by source kind when absent. */
  adapter?: string;
  harness?: Harness;
  /**
   * For a practice without a harness: the file a reporter run by hand writes, joined to its Witnesses sources. Without
   * it, or a harness, no executions file is joined (#22).
   */
  executions?: string;
  /** The source whose identifiers this practice's citations refer to (section 6.2). */
  cites?: string;
  /** For scenarios: the project's step table, loaded in the adapter's sandbox (section 3.3). */
  steps?: string;
  /** A role, shown on the A3. */
  author?: string;
  /** What one artefact is: "the sentence", "the scenario", "the test". */
  unit?: string;
  /**
   * Settings handed to the adapter of each source the practice owns, by name, such as idPattern or headingFields
   * (Ingesting a codebase, stage 22). They configure how a source is read, never what it means.
   */
  settings?: Record<string, string>;
}

/** A repository evaluated from outside, at one commit; it is read and never written (version 2). */
export interface Subject {
  /** Where the repository is fetched from: a URL, or a path for a local clone. */
  repo: string;
  /** The full commit the profile is pinned to. */
  commit: string;
}

/** A source declared in the manifest, as s.source(name, { kind, at }) declares one in a specification (version 2). */
export interface DeclaredSource {
  name: string;
  kind: string;
  /** Relative to the subject's checkout when there is a subject, else to the component root. */
  at: string;
  /** Globs over paths relative to `at`: only files that match one are read (stage 22). `**` spans directories. */
  include?: string[];
  /** Globs over paths relative to `at`: files that match one are not read, even when included. */
  exclude?: string[];
}

export interface ComponentManifest {
  schema: typeof COMPONENT_SCHEMA | typeof COMPONENT_SCHEMA_V2;
  /** Equals the system name in the specification, when there is one. */
  name: string;
  /** The CSL module, relative to the component root. Required in version 1; optional in version 2. */
  spec?: string;
  /** Version 2: the repository under evaluation, when it is not the one holding the manifest. */
  subject?: Subject;
  /**
   * Version 2: sources the manifest declares. Without a specification they are all the model's sources; beside one
   * they are added to those it declares, and a name both declare is refused (stage 23).
   */
  sources?: DeclaredSource[];
  /**
   * Version 2: read the repository's history (stage 25). Without it no history is read. `since` is the tag or commit
   * after which a commit with no test and no reference is an untraced-change; without it none is reported.
   */
  history?: { since?: string; frozen?: string[]; tests?: string[] };
  /** Paths whose change makes a witness stale. */
  implementation: string[];
  practices: Practice[];
}

export interface ComponentProblem {
  code: string;
  detail: string;
}

export interface LoadedComponent {
  manifest: ComponentManifest;
  /** Digest of the manifest file's bytes; it joins the snapshot. */
  digest: string;
}

const ID = /^[a-z][a-z0-9-]*$/;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string" && s !== "");

/** Relative, inside the root, and not empty: the manifest names project files only. */
function projectPath(p: unknown): p is string {
  return typeof p === "string" && p !== "" && !p.startsWith("/") && !p.split(/[\\/]/).includes("..");
}

/** Structural validation of a parsed manifest. Every problem is reported; none is repaired. */
export function validateManifest(v: unknown): ComponentProblem[] {
  const out: ComponentProblem[] = [];
  const bad = (code: string, detail: string) => out.push({ code, detail });
  if (!isRecord(v)) return [{ code: "malformed-manifest", detail: "the manifest must be a JSON object" }];
  const v2 = v.schema === COMPONENT_SCHEMA_V2;
  if (v.schema !== COMPONENT_SCHEMA && !v2) bad("malformed-manifest", `schema must be ${COMPONENT_SCHEMA} or ${COMPONENT_SCHEMA_V2}`);
  if (typeof v.name !== "string" || v.name === "") bad("malformed-manifest", "name must be a non-empty string");
  if (!(v2 && v.spec === undefined) && !projectPath(v.spec)) bad("malformed-manifest", "spec must be a path inside the component root");
  if (!v2) for (const k of ["subject", "sources", "history"] as const) if (v[k] !== undefined) bad("malformed-manifest", `${k} needs ${COMPONENT_SCHEMA_V2}`);
  if (v2 && v.subject !== undefined) {
    const s = v.subject;
    if (!isRecord(s) || typeof s.repo !== "string" || s.repo === "") bad("malformed-manifest", "subject.repo must name the repository");
    if (!isRecord(s) || typeof s.commit !== "string" || !/^[0-9a-f]{40}$/.test(s.commit)) bad("malformed-manifest", "subject.commit must be a full commit, 40 lower-case hexadecimal digits");
  }
  if (v2 && v.history !== undefined) {
    const h = v.history;
    // A revision is passed to git as an argument: one that could read as an option is refused.
    if (!isRecord(h) || (h.since !== undefined && (typeof h.since !== "string" || !/^[\w][\w.\/-]*$/.test(h.since)))) bad("malformed-manifest", "history must be an object whose since, when given, names a tag or commit");
    // frozen: documents that record a moment (release notes, decisions); tests: paths that hold tests beside the usual ones.
    for (const k of ["frozen", "tests"] as const) {
      const g = isRecord(h) ? h[k] : undefined;
      if (g !== undefined && (!Array.isArray(g) || g.some((x) => typeof x !== "string" || x === ""))) bad("malformed-manifest", `history.${k} must be a list of path globs`);
    }
  }
  if (v2 && v.sources !== undefined) {
    if (!Array.isArray(v.sources)) bad("malformed-manifest", "sources must be a list");
    else {
      const names = new Set<string>();
      for (const [i, s] of v.sources.entries()) {
        if (!isRecord(s) || typeof s.name !== "string" || s.name === "" || typeof s.kind !== "string" || s.kind === "" || !(projectPath(s.at) || s.at === ".")) {
          bad("malformed-manifest", `sources[${i}] must have a name, a kind and a relative path at`);
          continue;
        }
        for (const k of ["include", "exclude"] as const) if (s[k] !== undefined && !strings(s[k])) bad("malformed-manifest", `sources[${i}].${k} must be a list of globs`);
        if (names.has(s.name)) bad("duplicate-source", `source ${s.name} is declared twice`);
        names.add(s.name);
      }
    }
  }
  if (v2 && v.spec === undefined && v.sources === undefined) bad("malformed-manifest", "a component without a spec declares its sources in the manifest");
  if (!strings(v.implementation) || !v.implementation.every(projectPath)) bad("malformed-manifest", "implementation must be a list of paths inside the component root");
  if (!Array.isArray(v.practices) || v.practices.length === 0) {
    bad("malformed-manifest", "practices must be a non-empty list");
    return out;
  }
  const ids = new Set<string>();
  const owners = new Map<string, string>();
  for (const [i, p] of v.practices.entries()) {
    const at = `practices[${i}]`;
    if (!isRecord(p)) {
      bad("malformed-manifest", `${at} must be an object`);
      continue;
    }
    const id = typeof p.id === "string" && ID.test(p.id) ? p.id : undefined;
    if (id === undefined) bad("malformed-manifest", `${at}.id must be lower case letters, digits and hyphens`);
    else if (ids.has(id)) bad("duplicate-practice", `practice ${id} is declared twice`);
    else ids.add(id);
    const name = id ?? at;
    if (typeof p.name !== "string" || p.name === "") bad("malformed-manifest", `${name}: name must be a non-empty string`);
    if (!(PRACTICE_KINDS as readonly unknown[]).includes(p.kind)) bad("malformed-manifest", `${name}: kind must be one of ${PRACTICE_KINDS.join(", ")}`);
    if (!strings(p.sources) || p.sources.length === 0) bad("malformed-manifest", `${name}: sources must be a non-empty list of source names`);
    else
      for (const s of p.sources) {
        const prior = owners.get(s);
        if (prior !== undefined && prior !== name) bad("source-owned-twice", `source ${s} is named by practices ${prior} and ${name}; a source has one owner`);
        owners.set(s, name);
      }
    if (p.adapter !== undefined && (typeof p.adapter !== "string" || p.adapter === "")) bad("malformed-manifest", `${name}: adapter must be a module specifier or a path`);
    if (p.cites !== undefined && (typeof p.cites !== "string" || p.cites === "")) bad("malformed-manifest", `${name}: cites must name a source`);
    if (p.executions !== undefined && (!projectPath(p.executions) || p.harness !== undefined)) bad("malformed-manifest", `${name}: executions is a path inside the component root, for a practice without a harness (harness.executions names a harness's)`);
    if (p.steps !== undefined && (!projectPath(p.steps) || p.kind !== "scenarios")) bad("malformed-manifest", `${name}: steps is a path inside the component root, for a scenarios practice only`);
    for (const k of ["author", "unit"] as const) if (p[k] !== undefined && typeof p[k] !== "string") bad("malformed-manifest", `${name}: ${k} must be a string`);
    if (p.settings !== undefined && !(isRecord(p.settings) && Object.values(p.settings).every((x) => typeof x === "string"))) bad("malformed-manifest", `${name}: settings must map names to strings`);
    if (p.harness !== undefined && v2 && v.subject !== undefined) bad("harness-on-subject", `${name}: a subject is read and never run; a harness would run in its checkout (stage 26 reads its test results instead)`);
    if (p.harness !== undefined) {
      const h = p.harness;
      if (!isRecord(h) || !strings(h.run) || h.run.length === 0) bad("malformed-manifest", `${name}: harness.run must be a non-empty argument vector`);
      else {
        if (!projectPath(h.witnesses)) bad("malformed-manifest", `${name}: harness.witnesses must be a path inside the component root`);
        if (h.executions !== undefined && !projectPath(h.executions)) bad("malformed-manifest", `${name}: harness.executions must be a path inside the component root`);
        if (h.timeoutMs !== undefined && !(Number.isSafeInteger(h.timeoutMs) && (h.timeoutMs as number) > 0)) bad("malformed-manifest", `${name}: harness.timeoutMs must be a positive whole number of milliseconds`);
      }
    }
  }
  return out;
}

/** Read csh/component.json under a root. Undefined when there is none; problems when it cannot be used. */
export function loadComponent(root: string): { component?: LoadedComponent; problems: ComponentProblem[] } | undefined {
  const file = join(root, COMPONENT_PATH);
  if (!existsSync(file)) return undefined;
  return parseComponent(readFileSync(file));
}

export function parseComponent(bytes: Uint8Array): { component?: LoadedComponent; problems: ComponentProblem[] } {
  let v: unknown;
  try {
    v = JSON.parse(new TextDecoder().decode(bytes));
  } catch (err) {
    return { problems: [{ code: "malformed-manifest", detail: `not JSON: ${(err as Error).message}` }] };
  }
  const problems = validateManifest(v);
  if (problems.length > 0) return { problems };
  return { component: { manifest: v as ComponentManifest, digest: digestOf(bytes) }, problems: [] };
}

/**
 * Check the manifest against the emitted specification. A practice naming a source the specification lacks, a
 * practice citing a source it lacks, a harness writing a file none of its sources read, and a name that differs from
 * the system's are errors. A source no practice names is not an error: it is the gap unowned-source, returned here.
 */
/** With `root`, a source that is a file there is never read as a directory holding the witness file. */
export function checkAgainstModule(manifest: ComponentManifest, m: Module, root?: string): { errors: ComponentProblem[]; unowned: string[] } {
  const errors: ComponentProblem[] = [];
  const declared = new Map(m.sources.map((s) => [s.name, s]));
  if (manifest.name !== m.system) errors.push({ code: "component-name-mismatch", detail: `the manifest names ${manifest.name}; the specification's system is ${m.system}` });
  const owned = new Set<string>();
  for (const p of manifest.practices) {
    for (const s of p.sources) {
      owned.add(s);
      if (!declared.has(s)) errors.push({ code: "practice-unknown-source", detail: `practice ${p.id} names source ${s}, which the specification does not declare` });
    }
    if (p.cites !== undefined && !declared.has(p.cites)) errors.push({ code: "practice-unknown-source", detail: `practice ${p.id} cites source ${p.cites}, which the specification does not declare` });
    if (p.harness !== undefined && !p.sources.some((s) => declared.get(s) !== undefined && reads(declared.get(s)!.at, p.harness!.witnesses, root))) {
      errors.push({ code: "harness-file-unread", detail: `practice ${p.id} writes ${p.harness.witnesses}, which none of its sources reads` });
    }
  }
  const unowned = m.sources.map((s) => s.name).filter((s) => !owned.has(s)).sort(compareCodePoints);
  return { errors, unowned };
}

/** A project path as one spelling: forward slashes, no "./", no trailing slash ("" for the root). */
const norm = (p: string) => posix.normalize(p.split("\\").join("/")).replace(/^\.(\/|$)/, "").replace(/\/$/, "");

/** True when a source at `at` reads the file `file`: it is that file, or a directory that holds it. */
function reads(at: string, file: string, root?: string): boolean {
  const a = norm(at);
  const f = norm(file);
  if (a === f) return true;
  if (root !== undefined && existsSync(join(root, a)) && !statSync(join(root, a)).isDirectory()) return false;
  return a === "" || f.startsWith(`${a}/`);
}

/** The practice that owns each source, by source name. */
export function ownersOf(manifest: ComponentManifest): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of manifest.practices) for (const s of p.sources) out[s] = p.id;
  return out;
}

/** The practice a source belongs to, or undefined. */
export function practiceOf(manifest: ComponentManifest, source: string): Practice | undefined {
  return manifest.practices.find((p) => p.sources.includes(source));
}

/** The sources of a manifest that declares them itself (version 2, no specification), sorted by name. */
export function declaredSources(manifest: ComponentManifest): DeclaredSource[] {
  return [...(manifest.sources ?? [])].sort((a, b) => compareCodePoints(a.name, b.name));
}

/**
 * The emitted model with the sources the manifest declares beside the specification's (stage 23), or the problem when
 * a name is declared by both differently. A manifest source with the same name, kind and location as one of the
 * specification's only adds its globs (stage 24), so a specification can cite a source the manifest narrows. The
 * model is returned unchanged when the manifest declares none.
 */
export function withDeclaredSources(manifest: ComponentManifest, m: Module): { module: Module; errors: ComponentProblem[] } {
  const extra = declaredSources(manifest);
  if (extra.length === 0) return { module: m, errors: [] };
  const taken = new Map(m.sources.map((s) => [s.name, s]));
  const same = (s: DeclaredSource) => taken.get(s.name)?.kind === s.kind && taken.get(s.name)?.at === s.at;
  const errors = extra.filter((s) => taken.has(s.name) && !same(s)).map((s) => ({ code: "duplicate-source", detail: `source ${s.name} is declared by both the specification and the manifest, differently` }));
  const sources = [...m.sources, ...extra.filter((s) => !taken.has(s.name)).map(({ name, kind, at }) => ({ name, kind, at }))].sort((a, b) => compareCodePoints(a.name, b.name));
  return { module: { ...m, sources }, errors };
}

/**
 * The model of a component with no specification: its system name and the sources the manifest declares, and nothing
 * else. No vocabulary, no obligation, no binding: what such a run reports comes from its sources alone.
 */
export function moduleOfManifest(manifest: ComponentManifest): Module {
  return {
    schema: "csh-ir/v1",
    system: manifest.name,
    uses: [],
    vocabulary: { units: [], enums: [], states: [], events: [] },
    transitions: [],
    policies: [],
    intents: [],
    sources: declaredSources(manifest).map(({ name, kind, at }) => ({ name, kind, at })),
    claims: [],
    bindings: [],
  };
}
