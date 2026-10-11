// Running sources through adapters (Evidence tab, section 4). The harness reads the
// files; the adapter sees only their bytes, the vocabulary and the bindings.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compareCodePoints, digestOf, type Binding, type ClaimSet, type Module, type Source } from "@csh/kernel";
import type { SourceRun } from "@csh/check";
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
function filesAt(root: string, at: string): { files?: { path: string; abs: string }[]; outside?: true } {
  const realRoot = realpathSync(root);
  const abs = resolve(root, at);
  if (isAbsolute(at) || !inside(resolve(root), abs)) return { outside: true };
  if (!existsSync(abs)) return {};
  if (!inside(realRoot, realpathSync(abs))) return { outside: true };
  const out: { path: string; abs: string }[] = [];
  const walk = (p: string) => {
    if (!inside(realRoot, realpathSync(p))) return; // a link out of the project is never followed
    if (statSync(p).isDirectory()) {
      for (const e of readdirSync(p).sort(compareCodePoints)) walk(join(p, e));
    } else out.push({ path: relative(root, p).split(sep).join("/"), abs: p });
  };
  walk(abs);
  return { files: out };
}

/** A glob as a regular expression over a slash-separated path: `**` spans directories, `*` and `?` do not. */
export function globRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      re += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

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

/** Run one adapter in an isolated subprocess. */
export function runIsolated(adapterUrl: string, input: AdapterInput, timeoutMs = 30000, readable: string[] = []): Promise<AdapterOutput> {
  // A project-local adapter may also read its own directory, and nothing else of the project but the files it is given.
  const own = [...(adapterUrl.startsWith("file:") ? [realpathSync(dirname(fileURLToPath(adapterUrl)))] : []), ...readable];
  const args = ["--permission", ...[...toolReadable(), ...own].map((p) => `--allow-fs-read=${p}`), "--disable-warning=ExperimentalWarning", "--no-addons", RUNNER];
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, args, { stdio: ["ignore", "ignore", "pipe", "ipc"], env: {}, serialization: "advanced" });
    let settled = false;
    let stderr = "";
    const finish = (err: Error | undefined, out?: AdapterOutput) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      if (err !== undefined) fail(err);
      else done(out!);
    };
    const timer = setTimeout(() => finish(new Error(`adapter exceeded ${timeoutMs} ms`)), timeoutMs);
    child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("message", (m: { ok: boolean; output?: AdapterOutput; message?: string }) => {
      if (m.ok && m.output !== undefined) finish(undefined, m.output);
      else finish(new Error(m.message ?? "adapter failed"));
    });
    child.on("error", (e) => finish(e));
    // "close", not "exit": a reply sent just before the subprocess exits is delivered first.
    child.on("close", (code) => finish(new Error(`adapter process exited with ${code}: ${stderr.slice(0, 1000)}`)));
    child.send({ adapter: adapterUrl, input });
  });
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
  for (const source of [...module.sources].sort((a, b) => compareCodePoints(a.name, b.name))) {
    const located = filesAt(opts.root, source.at);
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
    const base0 = source.at.replace(/\/+$/, "");
    // Globs match the path below the source's location; a source that is one file matches its own name.
    const below = (p: string) => (p.startsWith(`${base0}/`) ? p.slice(base0.length + 1) : p.split("/").pop()!);
    const kept = inc === undefined && exc === undefined ? found : found.filter((f) => (inc === undefined || inc.some((r) => r.test(below(f.path)))) && !(exc ?? []).some((r) => r.test(below(f.path))));
    const files = kept.map((f) => {
      const bytes = new Uint8Array(readFileSync(f.abs));
      return { path: f.path, digest: digestOf(bytes), bytes };
    });
    const named = opts.perSource?.[source.name]?.adapter ?? opts.adapters?.[source.kind];
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
    const config = { ...(opts.config ?? {}), ...(own?.settings ?? {}), ...(own?.cites !== undefined ? { cites: own.cites } : {}), ...(steps !== undefined ? { steps: pathToFileURL(realpathSync(steps)).href } : {}) };
    if (opts.config !== undefined || own?.settings !== undefined || own?.cites !== undefined || steps !== undefined) input.config = config;
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
    let output: AdapterOutput;
    try {
      const url = resolveAdapter(spec, codeRoot);
      if (opts.isolated === false) {
        const mod = (await import(url)) as { adapter: { run: (i: AdapterInput) => AdapterOutput | Promise<AdapterOutput> } };
        output = structuredClone(await mod.adapter.run(input));
      } else {
        output = await runIsolated(url, input, opts.timeoutMs, steps === undefined ? [] : [realpathSync(steps)]);
      }
    } catch (err) {
      output = { diagnostics: [{ code: "adapter-failed", severity: "error", message: (err as Error).message }] };
    }
    if (output.claims !== undefined) output.claims.source = source.name;
    runs.push({ ...base, adapter: spec, files: [...input.files, ...execFiles].map(({ path, digest }) => ({ path, digest })), output });
  }
  return runs;
}
