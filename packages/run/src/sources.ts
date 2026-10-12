// Running sources through adapters (Evidence tab, section 4). The harness reads the
// files; the adapter sees only their bytes, the vocabulary and the bindings.
import { unknownSettings } from "./settings.ts";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compareCodePoints, digestJson, digestOf, globRegExp, type Binding, type ClaimSet, type Module, type Source } from "@csh/kernel";
import { type SourceRun, TOOL_VERSION } from "@csh/check";
import { installedReadable } from "@csh/emit";
import type { AdapterInput, AdapterOutput } from "@csh/witness";

/** Built-in adapters by source kind. Configuration may add more (kind to module specifier or path). */
export const BUILTIN_ADAPTERS: Record<string, string> = {
  Witnesses: "@csh/adapter-witness-files",
  Scenarios: "@csh/adapter-gherkin",
  Requirements: "@csh/adapter-ears-markdown",
  Architecture: "@csh/adapter-c4-mermaid",
  Facts: "@csh/facts",
  Documents: "@csh/adapter-items/markdown",
  Features: "@csh/adapter-items/gherkin",
  TestFiles: "@csh/adapter-items/tests",
  Issues: "@csh/adapter-items/jsonl",
  Traces: "@csh/adapter-items/yaml",
  Code: "@csh/facts-code",
};

export type { SourceRun };

export interface RunSourcesOptions {
  /** Directory that source locations are relative to. */
  root: string;
  /**
   * Directory that a practice's project-local adapter and step table are relative to, when not `root`: the component
   * root, while sources are read from a subject's checkout (Ingesting a codebase, stage 21).
   */
  codeRoot?: string;
  /** Run each adapter in a separate, permission-restricted process (default true). */
  isolated?: boolean;
  /** Adapter settings, such as requirementIdPattern. */
  config?: Record<string, string>;
  /** The commit the sources are read at, handed to every adapter as `commit` so that facts it reads can be current. */
  commit?: string;
  /** Extra adapters by source kind. */
  adapters?: Record<string, string>;
  /**
   * Settings by source name, from the component manifest. A source's own adapter takes precedence over the one for
   * its kind.
   */
  perSource?: Record<string, { adapter?: string; executions?: string; cites?: string; steps?: string; settings?: Record<string, string>; include?: string[]; exclude?: string[] }>;
  /** The executions file joined to a Witnesses source that no practice owns; none when absent (#22). */
  executions?: string;
  /** Authority of each binding, by binding fragment name; candidate when absent. */
  bindingAuthority?: (b: Binding) => string;
  timeoutMs?: number;
  /**
   * Keep each source's adapter output between runs (Ingesting a codebase, stage 27), under `dir`. `pinned` is the
   * commit of a clean checkout the sources are read from: their files are then known by path alone and are not read
   * at all when nothing else changed. Without it a file is known by its digest.
   */
  cache?: { dir: string; pinned?: string };
  /**
   * The files git tracks under `root`, for a subject read at its commit: a file a source would read that is not among
   * them (an ignored or untracked file in the checkout) is left out and reported, never read (stage 40).
   */
  tracked?: ReadonlySet<string>;
}

/** Kept adapter output, by the digest of everything the output depends on. */
interface KeptRun {
  schema: "csh-source-cache/v1";
  run: SourceRun;
}

/**
 * The tool's own code, by path, size and modification time of each source file of its packages, and the lockfile
 * that pins what they import: a kept output is never reused across a change to an adapter or a dependency, though
 * the version stays the same while it is developed. Computed for each run, so a change between two runs of one
 * process is seen.
 */
export function toolCodeDigest(): string {
  const pkgs = resolve(HERE, "..", "..");
  const seen: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => compareCodePoints(a.name, b.name))) {
      if (e.name === "node_modules" || e.name === "test" || e.name.startsWith(".")) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|js|mjs|cjs|json)$/.test(e.name)) {
        const st = statSync(p);
        seen.push(`${relative(pkgs, p)} ${st.size} ${st.mtimeMs}`);
      }
    }
  };
  try {
    walk(pkgs);
  } catch {
    // Unreadable: the version alone decides.
  }
  const lock = join(pkgs, "..", "pnpm-lock.yaml");
  return digestJson({ version: TOOL_VERSION, files: seen, lock: existsSync(lock) ? digestOf(new Uint8Array(readFileSync(lock))) : null });
}

function readKept(file: string): SourceRun | undefined {
  try {
    const k = JSON.parse(readFileSync(file, "utf8")) as KeptRun;
    return k.schema === "csh-source-cache/v1" ? k.run : undefined;
  } catch {
    return undefined;
  }
}

/** Keep a source's output, replacing what was kept for it before: the cache holds one output per source. */
function keep(file: string, run: SourceRun): void {
  try {
    const dir = dirname(file);
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify({ schema: "csh-source-cache/v1", run } satisfies KeptRun));
    renameSync(`${file}.tmp`, file);
    for (const old of readdirSync(dir)) if (join(dir, old) !== file) rmSync(join(dir, old), { force: true });
  } catch {
    // The cache only saves work.
  }
}

/** True when `p` is `root` or lies inside it. */
function inside(root: string, p: string): boolean {
  const r = relative(root, p);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
}

/**
 * The files of a source, read only from inside the project root. A location that is absolute, climbs out
 * of the root, or reaches outside it through a symbolic link is refused (`outside: true`).
 */
/** Every directory that holds a tracked file, the root ("") included: a walk need not enter any other. */
export function trackedDirsOf(tracked: Iterable<string>): Set<string> {
  const dirs = new Set<string>([""]);
  for (const f of tracked) {
    for (let i = f.indexOf("/"); i >= 0; i = f.indexOf("/", i + 1)) dirs.add(f.slice(0, i));
  }
  return dirs;
}

/**
 * The files under a source's location. With `dirs` (from trackedDirsOf), a directory that holds no tracked file is not
 * entered: a working checkout's node_modules or build output can hold a hundred times the files the commit does
 * (From real runs, stage 46).
 */
function filesAt(root: string, at: string, dirs?: Set<string>): { files?: { path: string; abs: string }[]; outside?: true } {
  const realRoot = realpathSync(root);
  const abs = resolve(root, at);
  if (isAbsolute(at) || !inside(resolve(root), abs)) return { outside: true };
  if (!existsSync(abs)) return {};
  if (!inside(realRoot, realpathSync(abs))) return { outside: true };
  const out: { path: string; abs: string }[] = [];
  const add = (p: string) => out.push({ path: relative(root, p).split(sep).join("/"), abs: p });
  // A path that is not a link lies where its directory does, which is inside the root: only a link is resolved (a link out
  // of the project is never followed). Resolving every file made a tree of thousands cost seconds.
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => compareCodePoints(a.name, b.name))) {
      const p = join(dir, e.name);
      if (e.isSymbolicLink()) {
        if (!inside(realRoot, realpathSync(p))) continue;
        if (statSync(p).isDirectory()) walk(p);
        else add(p);
      } else if (e.isDirectory()) {
        if (dirs === undefined || dirs.has(relative(root, p).split(sep).join("/"))) walk(p);
      } else add(p);
    }
  };
  if (statSync(abs).isDirectory()) walk(abs);
  else add(abs);
  return { files: out };
}

/**
 * The files a source reads: those under its location, narrowed by the include and exclude globs of the manifest, which
 * match the path below the location (a source that is one file matches its own name).
 */
export function selectFiles(root: string, at: string, include?: string[], exclude?: string[], dirs?: Set<string>): { path: string; abs: string }[] {
  const found = filesAt(root, at, dirs).files ?? [];
  const inc = include?.map(globRegExp);
  const exc = exclude?.map(globRegExp);
  if (inc === undefined && exc === undefined) return found;
  const base0 = relative(root, resolve(root, at)).split(sep).join("/");
  const below = (p: string) => (base0 === "" ? p : p.startsWith(`${base0}/`) ? p.slice(base0.length + 1) : p.split("/").pop()!);
  return found.filter((f) => (inc === undefined || inc.some((r) => r.test(below(f.path)))) && !(exc ?? []).some((r) => r.test(below(f.path))));
}

/** Globs over paths below a source's location; kept here under its stage 22 name, now in the kernel. */
export { globRegExp };

/** The files a git repository tracks under `root`, relative to it; undefined when `root` is not in one. */
export function trackedFiles(root: string): string[] | undefined {
  try {
    const out = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });
    return out.split("\0").filter((f) => f !== "").sort(compareCodePoints);
  } catch {
    return undefined;
  }
}

const SELF = fileURLToPath(import.meta.url);
const HERE = dirname(SELF);
// adapter-runner.ts in the workspace, adapter-runner.js in a packed package (A-40).
const RUNNER = join(HERE, `adapter-runner${extname(SELF)}`);

function toolReadable(): string[] {
  // The tool's own code and installed packages: packages/ and the repository's node_modules, or, when the tool is
  // installed, the outermost node_modules directory it is installed in and every node_modules above it (A-51).
  const parts = HERE.split(sep);
  const nmAt = parts.indexOf("node_modules");
  if (nmAt >= 0) return installedReadable(parts.slice(0, nmAt + 1).join(sep));
  const pkgs = resolve(HERE, "..", "..");
  const nm = resolve(pkgs, "..", "node_modules");
  return [pkgs, nm].filter(existsSync).map((p) => realpathSync(p));
}

/** The isolated subprocess, sent one message and settled by its one reply. */
function isolatedCall<T>(message: unknown, timeoutMs: number, readable: string[]): Promise<T> {
  const args = ["--permission", ...[...toolReadable(), ...readable].map((p) => `--allow-fs-read=${p}`), "--disable-warning=ExperimentalWarning", "--no-addons", RUNNER];
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, args, { stdio: ["ignore", "ignore", "pipe", "ipc"], env: {}, serialization: "advanced" });
    let settled = false;
    let stderr = "";
    const finish = (err: Error | undefined, out?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      if (err !== undefined) fail(err);
      else done(out!);
    };
    const timer = setTimeout(() => finish(new Error(`adapter exceeded ${timeoutMs} ms`)), timeoutMs);
    child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("message", (m: { ok: boolean; message?: string } & T) => {
      if (m.ok) finish(undefined, m);
      else finish(new Error(m.message ?? "adapter failed"));
    });
    child.on("error", (e) => finish(e));
    // "close", not "exit": a reply sent just before the subprocess exits is delivered first.
    child.on("close", (code) => finish(new Error(`adapter process exited with ${code}: ${stderr.slice(0, 1000)}`)));
    child.send(message as Parameters<typeof child.send>[0]);
  });
}

/** Run one adapter in an isolated subprocess. */
export async function runIsolated(adapterUrl: string, input: AdapterInput, timeoutMs = 30000, readable: string[] = []): Promise<AdapterOutput> {
  // A project-local adapter may also read its own directory, and nothing else of the project but the files it is given.
  const own = [...(adapterUrl.startsWith("file:") ? [realpathSync(dirname(fileURLToPath(adapterUrl)))] : []), ...readable];
  return (await isolatedCall<{ output: AdapterOutput }>({ adapter: adapterUrl, input }, timeoutMs, own)).output;
}

/**
 * Run several of the tool's own adapters in one isolated subprocess, in turn (From real runs, stage 40). Each result is
 * the adapter's output or its own error. When the process itself fails, each adapter is run again alone, so that one
 * adapter's crash or timeout is reported as its own.
 */
export async function runIsolatedBatch(jobs: { adapter: string; input: AdapterInput }[], timeoutMs = 30000): Promise<(AdapterOutput | Error)[]> {
  if (jobs.length === 0) return [];
  if (jobs.length === 1) return [await runIsolated(jobs[0]!.adapter, jobs[0]!.input, timeoutMs).catch((e: Error) => e)];
  try {
    const r = await isolatedCall<{ results: ({ ok: true; output: AdapterOutput } | { ok: false; message: string })[] }>({ jobs }, timeoutMs * jobs.length, []);
    return r.results.map((x) => (x.ok ? x.output : new Error(x.message)));
  } catch {
    return Promise.all(jobs.map((j) => runIsolated(j.adapter, j.input, timeoutMs).catch((e: Error) => e)));
  }
}

function resolveAdapter(spec: string, root: string): string {
  if (spec.startsWith(".") || spec.startsWith("/")) return new URL(`file://${resolve(root, spec)}`).href;
  // import.meta.resolve is missing under some loaders (the test runner's among them); require resolution finds the same file.
  return typeof import.meta.resolve === "function" ? import.meta.resolve(spec) : pathToFileURL(createRequire(import.meta.url).resolve(spec)).href;
}

/** A file of claim sets already in csh-ir/v1 form: data, read without an adapter. */
function readClaimsJson(source: Source, bytes: Uint8Array, path: string): AdapterOutput {
  const empty: ClaimSet = { source: source.name, assumptions: [], obligations: [], examples: [], unliftable: [] };
  let v: unknown;
  try {
    v = JSON.parse(new TextDecoder().decode(bytes));
  } catch (err) {
    return { diagnostics: [{ code: "malformed-claims", severity: "error", message: (err as Error).message, span: path }], claims: { ...empty, unliftable: [{ span: path, reason: "malformed", text: "" }] } };
  }
  const sets = (Array.isArray(v) ? v : [v]) as Partial<ClaimSet>[];
  const claims = empty;
  for (const s of sets) {
    if (s.source !== undefined && s.source !== source.name) continue;
    claims.assumptions.push(...(s.assumptions ?? []));
    claims.obligations.push(...(s.obligations ?? []));
    claims.examples.push(...(s.examples ?? []));
    claims.unliftable.push(...(s.unliftable ?? []));
  }
  return { claims, diagnostics: [] };
}

/** A file that declares itself pre-lifted claims: JSON whose claim sets each carry schema csh-ir/v1. */
function isIrJson(path: string, bytes: Uint8Array): boolean {
  if (!path.endsWith(".json")) return false;
  try {
    const v = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    const sets = Array.isArray(v) ? v : [v];
    return sets.length > 0 && sets.every((s) => typeof s === "object" && s !== null && (s as { schema?: unknown }).schema === "csh-ir/v1");
  } catch {
    return false;
  }
}

/** Run every source of the module through its adapter. */
export async function runSources(module: Module, opts: RunSourcesOptions): Promise<SourceRun[]> {
  const registry = { ...BUILTIN_ADAPTERS, ...(opts.adapters ?? {}) };
  const runs: SourceRun[] = [];
  const bindings = module.bindings.map((b) => ({ ...b, authority: opts.bindingAuthority?.(b) ?? "candidate" }));
  // The tool and its dependencies, read once per run (stage 27).
  const tool = opts.cache === undefined ? undefined : toolCodeDigest();
  const shared: { adapter: string; input: AdapterInput; finish: (o: AdapterOutput | Error) => void }[] = [];
  const alone: (() => Promise<void>)[] = [];
  const dirs = opts.tracked === undefined ? undefined : trackedDirsOf(opts.tracked);
  for (const source of [...module.sources].sort((a, b) => compareCodePoints(a.name, b.name))) {
    const located = filesAt(opts.root, source.at, dirs);
    const base = { source: source.name, kind: source.kind };
    if (located.outside === true) {
      runs.push({ ...base, files: [], output: { diagnostics: [{ code: "source-outside-root", severity: "error", message: `${source.at} is outside the project root; sources are read only from inside it` }] } });
      continue;
    }
    const found = located.files;
    if (found === undefined) {
      runs.push({ ...base, files: [], output: { diagnostics: [{ code: "source-missing", severity: "info", message: `nothing found at ${source.at}; the source contributes only claims written in the specification` }] } });
      continue;
    }
    const own = opts.perSource?.[source.name];
    const inc = own?.include?.map(globRegExp);
    const exc = own?.exclude?.map(globRegExp);
    // Globs match the path below the source's location, however it is written ("." and "./guides" too); a source that is
    // one file matches its own name.
    const base0 = relative(opts.root, resolve(opts.root, source.at)).split(sep).join("/");
    const below = (p: string) => (base0 === "" ? p : p.startsWith(`${base0}/`) ? p.slice(base0.length + 1) : p.split("/").pop()!);
    const selected = inc === undefined && exc === undefined ? found : found.filter((f) => (inc === undefined || inc.some((r) => r.test(below(f.path)))) && !(exc ?? []).some((r) => r.test(below(f.path))));
    const kept = opts.tracked === undefined ? selected : selected.filter((f) => opts.tracked!.has(f.path));
    const untracked = selected.length - kept.length;
    const named = opts.perSource?.[source.name]?.adapter ?? opts.adapters?.[source.kind];
    // A kept output is reused when everything it was made from is the same (stage 27). A project-local adapter is
    // project code that may import anything, so its output is never kept.
    const local = named !== undefined && (named.startsWith(".") || named.startsWith("/"));
    const cacheFile = (() => {
      if (opts.cache === undefined || local) return undefined;
      const ownExec = own !== undefined ? own.executions : source.kind === "Witnesses" ? opts.executions : undefined;
      const execFiles = ownExec === undefined ? [] : (filesAt(opts.codeRoot ?? opts.root, ownExec).files ?? []);
      const stepFiles = own?.steps === undefined ? [] : (filesAt(opts.codeRoot ?? opts.root, own.steps).files ?? []);
      const digests = (fs: { path: string; abs: string }[]) => fs.map((f) => [f.path, digestOf(new Uint8Array(readFileSync(f.abs)))]);
      const key = digestJson({
        tool,
        isolated: opts.isolated ?? true,
        source,
        own: own ?? null,
        named: named ?? null,
        adapters: opts.adapters ?? null,
        config: opts.config ?? null,
        commit: opts.commit ?? null,
        executions: ownExec ?? null,
        vocabulary: module.vocabulary,
        bindings,
        // A pinned checkout's files are its commit's: their paths say which were read, and none is opened.
        files: opts.cache.pinned !== undefined ? { pinned: opts.cache.pinned, paths: kept.map((f) => f.path) } : digests(kept),
        exec: digests(execFiles),
        steps: digests(stepFiles),
      });
      // One directory per source, holding only its newest output (see keep).
      return join(opts.cache.dir, "sources", digestOf(new TextEncoder().encode(source.name)).slice(-16), `${key.replace(/^sha256:/, "")}.json`);
    })();
    const hit = cacheFile === undefined ? undefined : readKept(cacheFile);
    if (hit !== undefined) {
      runs.push(hit);
      continue;
    }
    const files = kept.map((f) => {
      const bytes = new Uint8Array(readFileSync(f.abs));
      return { path: f.path, digest: digestOf(bytes), bytes };
    });
    // A Scenarios source named no adapter whose every file declares csh-ir/v1 holds claims already lifted: it is read as
    // data, not handed to the Gherkin adapter (#26). Only Scenarios: other kinds keep their built-in adapter.
    const preLifted = named === undefined && source.kind === "Scenarios" && files.length > 0 && files.every((f) => isIrJson(f.path, f.bytes));
    const spec = preLifted ? undefined : (named ?? registry[source.kind]);
    if (spec === undefined) {
      if (files.length > 0 && files.every((f) => f.path.endsWith(".json"))) {
        const out: AdapterOutput = { diagnostics: [] };
        for (const f of files) {
          const r = readClaimsJson(source, f.bytes, f.path);
          if (out.claims === undefined) out.claims = r.claims!;
          else {
            out.claims.assumptions.push(...r.claims!.assumptions);
            out.claims.obligations.push(...r.claims!.obligations);
            out.claims.examples.push(...r.claims!.examples);
            out.claims.unliftable.push(...r.claims!.unliftable);
          }
          out.diagnostics.push(...r.diagnostics);
        }
        runs.push({ ...base, adapter: "claims-json", files: files.map(({ path, digest }) => ({ path, digest })), output: out });
      } else {
        runs.push({ ...base, files: files.map(({ path, digest }) => ({ path, digest })), output: { diagnostics: [{ code: "no-adapter", severity: "warning", message: `no adapter for source kind ${source.kind}` }] } });
      }
      continue;
    }
    const input: AdapterInput = { source, vocabulary: module.vocabulary, bindings, files };
    // A scenarios practice's step table is project code: the adapter receives its file URL, and the sandbox lets it
    // read that one file (Anchor, harnesses and A3, section 3.3).
    // It is one file: a directory is refused, never read through its first file.
    const codeRoot = opts.codeRoot ?? opts.root;
    const table = own?.steps === undefined ? undefined : filesAt(codeRoot, own.steps).files;
    const steps = table?.length === 1 && table[0]!.abs === resolve(codeRoot, own!.steps!) ? table[0]!.abs : undefined;
    if (own?.steps !== undefined && steps === undefined) {
      runs.push({ ...base, files: files.map(({ path, digest }) => ({ path, digest })), output: { diagnostics: [{ code: "no-step-table", severity: "error", message: `the step table ${own.steps} is missing, outside the project root or not a file` }] } });
      continue;
    }
    const config = { ...(opts.config ?? {}), ...(own?.settings ?? {}), ...(own?.cites !== undefined ? { cites: own.cites } : {}), ...(steps !== undefined ? { steps: pathToFileURL(realpathSync(steps)).href } : {}), ...(opts.commit !== undefined ? { commit: opts.commit } : {}) };
    if (opts.config !== undefined || opts.commit !== undefined || own?.settings !== undefined || own?.cites !== undefined || steps !== undefined) input.config = config;
    // The execution file sits beside a witness source only where it is named: by the practice (its harness's, the
    // reporter's default for a harness, or its own), or by the configuration of a project with no manifest. A source
    // with no named file never inherits another practice's outcomes (#22).
    const execAt = own !== undefined ? own.executions : source.kind === "Witnesses" ? opts.executions : undefined;
    // An executions file is the component's, never the subject's: it is read from the component root.
    const exec = execAt === undefined ? undefined : filesAt(opts.codeRoot ?? opts.root, execAt);
    const execFiles = (exec?.files ?? []).map((f) => {
      const bytes = new Uint8Array(readFileSync(f.abs));
      return { path: f.path, digest: digestOf(bytes), bytes };
    });
    if (execAt !== undefined && exec?.outside !== true) input.executions = execFiles;
    // A witness directory that holds the execution file reads it as executions only, never as witnesses.
    const execPaths = new Set(execFiles.map((f) => f.path));
    input.files = files.filter((f) => !execPaths.has(f.path));
    const failed = (err: unknown): AdapterOutput => ({ diagnostics: [{ code: "adapter-failed", severity: "error", message: (err as Error).message }] });
    const finish = (given: AdapterOutput): void => {
      // An adapter that returns no output failed, like one that threw.
      const output = typeof given === "object" && given !== null && Array.isArray(given.diagnostics) ? given : failed(new Error("the adapter returned no output"));
      if (output.claims !== undefined) output.claims.source = source.name;
      // A setting the adapter does not read changes nothing, which looks like one that worked.
      if (spec !== undefined) {
        for (const u of unknownSettings(spec, Object.keys(own?.settings ?? {}))) {
          output.diagnostics.push({ code: "unknown-setting", severity: "warning", message: `${spec} reads no setting ${u.name}${u.hint !== undefined ? `; did you mean ${u.hint}?` : ""}`, span: source.name });
        }
      }
      if (untracked > 0) {
        const some = selected.filter((f) => !opts.tracked!.has(f.path)).slice(0, 3).map((f) => f.path);
        output.diagnostics.push({ code: "untracked-file", severity: "warning", message: `${untracked} files in the subject's checkout that its commit does not hold were not read, e.g. ${some.join(", ")}`, span: source.name });
      }
      const made: SourceRun = { ...base, adapter: spec, files: [...input.files, ...execFiles].map(({ path, digest }) => ({ path, digest })), output };
      runs[slot] = made;
      // An adapter that failed or timed out is asked again next time.
      if (cacheFile !== undefined && !output.diagnostics.some((d) => d.code === "adapter-failed")) keep(cacheFile, made);
    };
    const slot = runs.length;
    runs.push(undefined as unknown as SourceRun);
    let url: string;
    try {
      url = resolveAdapter(spec, codeRoot);
    } catch (err) {
      finish(failed(err));
      continue;
    }
    if (opts.isolated === false) {
      try {
        const mod = (await import(url)) as { adapter: { run: (i: AdapterInput) => AdapterOutput | Promise<AdapterOutput> } };
        finish(structuredClone(await mod.adapter.run(input)));
      } catch (err) {
        finish(failed(err));
      }
    } else if (url.startsWith("file:") && !isToolCode(url)) {
      // A project's own adapter, or one handed a step table, keeps a sandbox of its own.
      alone.push(() => runIsolated(url, input, opts.timeoutMs, steps === undefined ? [] : [realpathSync(steps)]).then(finish, (e: unknown) => finish(failed(e))));
    } else if (steps !== undefined) {
      alone.push(() => runIsolated(url, input, opts.timeoutMs, [realpathSync(steps)]).then(finish, (e: unknown) => finish(failed(e))));
    } else {
      shared.push({ adapter: url, input, finish: (o) => (o instanceof Error ? finish(failed(o)) : finish(o)) });
    }
  }
  // The tool's own adapters share one sandbox; every other adapter has its own (stage 40).
  const results = await runIsolatedBatch(shared.map(({ adapter, input }) => ({ adapter, input })), opts.timeoutMs);
  results.forEach((r, i) => shared[i]!.finish(r));
  for (const job of alone) await job();
  return runs;
}

/** Whether a module URL is the tool's own code: under its packages or the node_modules it is installed in. */
function isToolCode(url: string): boolean {
  if (!url.startsWith("file:")) return true;
  let path: string;
  try {
    path = realpathSync(fileURLToPath(url));
  } catch {
    // A path that names no file is not the tool's: it runs alone and fails there as its own adapter-failed.
    return false;
  }
  return toolReadable().some((r) => path === r || path.startsWith(`${r}${sep}`));
}
