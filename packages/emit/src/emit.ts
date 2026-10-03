// Emission: type-check, run in a locked-down subprocess, check the IR, write canonical
// JSON and the digest, then emit again in a fresh subprocess and compare (Language reference, section 7).
import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, canonicalModule, moduleDigest, validateModule, type Digest, type Module, type Obligation } from "@csh/kernel";
import { typeCheck, type CompileDiagnostic } from "./typecheck.ts";

export interface EmitError {
  /** E-ACCESS, E-EXPORT, E-DUP, E-INT, E-NAME, E-VOCAB, E-COMPOSE, E-WEAKEN, E-TIMEOUT, E-EVAL, TS (compiler), or S1 to S9. */
  code: string;
  message: string;
  path?: string;
  line?: number;
}

export interface ShadowedObligation {
  intent: string;
  name: string;
  pack: string;
  inherited: Obligation;
  local: Obligation;
}

export interface CompositionReport {
  inherited: { name: string; pack: string }[];
  /** Local obligations that replace an inherited one, with the refinement result. */
  refinements: { obligation: string; pack: string; result: string }[];
}

export type RefinementChecker = (s: ShadowedObligation, module: Module) => Promise<{ status: string; reason?: string }>;

export interface Lock {
  schema: "csh-lock/v1";
  packs: Record<string, { version: string; digest: Digest }>;
}

export interface EmitOptions {
  /** Directory the module may read beneath (the specification root). Defaults to the file's directory. */
  root?: string;
  /** Extra directories the module may read (installed packs). */
  readable?: string[];
  /** Pack lock file contents, compared with every pack import (rule S8). */
  lock?: Lock;
  /** Refinement check for local obligations that replace inherited ones; without one they are refused. */
  refine?: RefinementChecker;
  /** Time limit for each subprocess, in milliseconds. */
  timeoutMs?: number;
  /** Skip the TypeScript check (used when the caller already type-checked). */
  skipTypeCheck?: boolean;
  /** Test-only: leave the clock and randomness open so that rule S9 can be observed. */
  unsafeAllowNondeterminism?: boolean;
}

export type EmitResult =
  | { ok: true; module: Module; digest: Digest; canonical: string; composition: CompositionReport }
  | { ok: false; errors: EmitError[]; diagnostics?: CompileDiagnostic[] };

const here = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(here, "runner.ts");

/** The repository's packages and node_modules: what the sandbox needs to load the language itself. */
function toolReadable(): string[] {
  const pkgs = resolve(here, "..", "..");
  const repo = resolve(pkgs, "..");
  const out = [pkgs];
  const nm = join(repo, "node_modules");
  if (existsSync(nm)) out.push(nm);
  return out;
}

interface RunnerReply {
  ok: boolean;
  code?: string;
  message?: string;
  module?: Module;
  composition?: { errors: { code: string; message: string }[]; shadowed: ShadowedObligation[]; inherited: { name: string; pack: string }[] } | null;
}

/** Run the module once in a fresh, locked-down subprocess. */
export function runSandboxed(file: string, opts: EmitOptions = {}): Promise<RunnerReply> {
  const abs = resolve(file);
  const root = resolve(opts.root ?? dirname(abs));
  const readable = [root, ...(opts.readable ?? []), ...toolReadable()].map((p) => (existsSync(p) ? realpathSync(p) : p));
  const args = [
    "--permission",
    ...readable.map((p) => `--allow-fs-read=${p}`),
    "--disable-warning=ExperimentalWarning",
    "--no-addons",
    RUNNER,
    abs,
  ];
  if (opts.unsafeAllowNondeterminism === true) args.push("--allow-nondeterminism");
  return new Promise((done) => {
    const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe", "ipc"], env: {}, cwd: root });
    let settled = false;
    let stdout = "";
    let stderr = "";
    const finish = (r: RunnerReply) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      done(r);
    };
    const timer = setTimeout(() => finish({ ok: false, code: "E-TIMEOUT", message: `emission exceeded ${opts.timeoutMs ?? 30000} ms` }), opts.timeoutMs ?? 30000);
    child.on("message", (m) => finish(m as RunnerReply));
    child.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err) => finish({ ok: false, code: "E-EVAL", message: err.message }));
    // "close", not "exit": it fires only after the IPC channel has delivered every message, so a reply sent
    // just before the subprocess exits is never mistaken for a silent exit.
    child.on("close", (code) => {
      if (settled) return;
      const text = `${stderr}\n${stdout}`.trim();
      if (/ERR_ACCESS_DENIED|Access to this API has been restricted/.test(text)) finish({ ok: false, code: "E-ACCESS", message: text.split("\n")[0] ?? text });
      else finish({ ok: false, code: "E-EVAL", message: `emission subprocess exited with ${code}: ${text.slice(0, 2000)}` });
    });
  });
}

/** Check pack imports against the lock file (rule S8). */
function checkLock(m: Module, lock: Lock | undefined): EmitError[] {
  const errs: EmitError[] = [];
  for (const u of m.uses) {
    const l = lock?.packs[u.pack];
    if (l === undefined) errs.push({ code: "S8", message: `pack ${u.pack} is not pinned in the lock file`, path: `uses ${u.pack}` });
    else if (l.version !== u.version) errs.push({ code: "S8", message: `pack ${u.pack} version ${u.version} differs from the lock (${l.version})`, path: `uses ${u.pack}` });
    else if (l.digest !== u.digest) errs.push({ code: "S8", message: `pack ${u.pack} digest differs from the lock`, path: `uses ${u.pack}` });
  }
  return errs;
}

export async function emit(file: string, opts: EmitOptions = {}): Promise<EmitResult> {
  // 1. Type-check in strict mode.
  if (opts.skipTypeCheck !== true) {
    const diags = typeCheck(file);
    if (diags.length > 0) {
      return { ok: false, errors: diags.map((d) => ({ code: "TS", message: d.message, path: d.file, line: d.line })), diagnostics: diags };
    }
  }
  // 2 to 4. Sandboxed evaluation.
  const first = await runSandboxed(file, opts);
  if (!first.ok || first.module === undefined) return { ok: false, errors: [{ code: first.code ?? "E-EVAL", message: first.message ?? "emission failed" }] };
  // 5. Checks on the model.
  const errors: EmitError[] = [];
  const comp = first.composition ?? { errors: [], shadowed: [], inherited: [] };
  for (const e of comp.errors) errors.push({ code: e.code, message: e.message });
  for (const v of validateModule(first.module)) {
    const err: EmitError = { code: v.rule, message: v.message, path: v.path };
    errors.push(err);
  }
  if (first.module.uses.length > 0 || opts.lock !== undefined) errors.push(...checkLock(first.module, opts.lock));
  if (errors.length > 0) return { ok: false, errors };
  const refinements: CompositionReport["refinements"] = [];
  for (const s of comp.shadowed) {
    const qn = `${first.module.system}/${s.intent}/${s.name}`;
    if (opts.refine === undefined) {
      errors.push({ code: "E-WEAKEN", message: `${qn} replaces an obligation inherited from ${s.pack}, and no refinement check is available` });
      continue;
    }
    const r = await opts.refine(s, first.module);
    refinements.push({ obligation: qn, pack: s.pack, result: r.status });
    if (r.status !== "strengthens") {
      errors.push({
        code: "E-WEAKEN",
        message: `${qn} replaces an obligation inherited from ${s.pack} without strengthening it (${r.status}${r.reason !== undefined ? `: ${r.reason}` : ""}); weakening needs an explicit relax`,
      });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  // 6. Canonical JSON and digest.
  const module = canonicalModule(first.module);
  const canonical = canonicalJson(module);
  const digest = moduleDigest(module);
  // 7. Emit again in a fresh subprocess and compare.
  const second = await runSandboxed(file, opts);
  const digest2 = second.ok && second.module !== undefined ? moduleDigest(second.module) : undefined;
  if (digest2 !== digest) {
    return { ok: false, errors: [{ code: "S9", message: second.ok ? "two emissions of the same module differ" : `second emission failed: ${second.code}: ${second.message}` }] };
  }
  return { ok: true, module, digest, canonical, composition: { inherited: comp.inherited, refinements } };
}

export function readLock(path: string): Lock | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as Lock;
}
