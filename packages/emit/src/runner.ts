// The sandboxed half of emission (Language reference, section 7, steps 3 and 4).
// Runs in a subprocess started with Node's permission model: file reads limited to
// the specification root and installed packages; no writes, child processes or workers.
// This file denies the clock, randomness, timers, the environment and the network
// before it imports the specification module.
import { createRequire, syncBuiltinESMExports } from "node:module";
import { pathToFileURL } from "node:url";
import { compositionOf, isModule } from "csl";

const send = process.send?.bind(process);
// The specification module must not be able to forge a result.
delete (process as { send?: unknown }).send;

function reply(msg: unknown): void {
  if (send === undefined) {
    process.stdout.write(JSON.stringify(msg));
    process.exit(0);
  }
  send(msg, () => process.exit(0));
}

class AccessError extends Error {
  readonly code = "E-ACCESS";
}

function deny(what: string): never {
  throw new AccessError(`E-ACCESS: specification modules may not use ${what}`);
}

const NODE_INTERNAL_ENV = /^(NODE_[A-Z_]+|WATCH_REPORT_DEPENDENCIES|UV_[A-Z_]+|FORCE_COLOR|NO_COLOR|TERM)$/;

function lockDown(allowNondeterminism: boolean): void {
  const g = globalThis as Record<string, unknown>;
  if (!allowNondeterminism) {
    const FakeDate = function () {
      deny("the clock (Date)");
    } as unknown as DateConstructor;
    Object.defineProperty(FakeDate, "now", { value: () => deny("the clock (Date.now)") });
    Object.defineProperty(FakeDate, "parse", { value: () => deny("the clock (Date.parse)") });
    Object.defineProperty(FakeDate, "UTC", { value: () => deny("the clock (Date.UTC)") });
    g.Date = FakeDate;
    Math.random = () => deny("randomness (Math.random)");
    Object.defineProperty(globalThis, "performance", { get: () => deny("the clock (performance)"), configurable: true });
    const c = globalThis.crypto as unknown as Record<string, unknown> | undefined;
    if (c !== undefined) {
      Object.defineProperty(globalThis, "crypto", { get: () => deny("randomness (crypto)"), configurable: true });
    }
    process.hrtime = Object.assign(() => deny("the clock (process.hrtime)"), { bigint: () => deny("the clock (process.hrtime)") }) as typeof process.hrtime;
    process.uptime = () => deny("the clock (process.uptime)");
  }
  for (const t of ["setTimeout", "setInterval", "setImmediate"]) g[t] = () => deny(`timers (${t})`);
  const env = new Proxy({}, {
    // The subprocess starts with an empty environment; Node's own loader still probes a few
    // variables, which read as absent. Every other read is a denied capability.
    get: (_t, k) => (typeof k === "symbol" || NODE_INTERNAL_ENV.test(k) ? undefined : deny(`environment variables (${String(k)})`)),
    has: () => deny("environment variables"),
    ownKeys: () => deny("environment variables"),
    set: () => deny("environment variables"),
  });
  Object.defineProperty(process, "env", { value: env, configurable: false, writable: false });
  g.fetch = () => deny("the network (fetch)");
  g.WebSocket = undefined;
  const require = createRequire(import.meta.url);
  const deniedModules: Record<string, string[]> = {
    net: ["connect", "createConnection", "createServer"],
    tls: ["connect", "createServer"],
    http: ["request", "get", "createServer"],
    https: ["request", "get", "createServer"],
    http2: ["connect", "createServer", "createSecureServer"],
    dgram: ["createSocket"],
    dns: ["lookup", "resolve", "resolve4", "resolve6"],
    child_process: ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"],
    worker_threads: ["Worker"],
    crypto: allowNondeterminism ? [] : ["randomBytes", "randomUUID", "randomInt", "getRandomValues", "randomFillSync", "randomFill"],
  };
  for (const [name, fns] of Object.entries(deniedModules)) {
    const m = require(`node:${name}`) as Record<string, unknown>;
    for (const fn of fns) {
      try {
        // A plain function, so that internal classes extending a denied one still load; calling it throws.
        const denied = function denied(): never {
          return deny(`${name}.${fn}`);
        };
        Object.defineProperty(m, fn, { value: denied, configurable: true, writable: true });
      } catch {
        // A non-configurable export is left to the permission model.
      }
    }
  }
  // Sockets exist for the IPC channel and pipes; opening a new connection is denied.
  const net = require("node:net") as { Socket: { prototype: Record<string, unknown> } };
  net.Socket.prototype.connect = function connect(): never {
    return deny("net.Socket.connect");
  };
  syncBuiltinESMExports();
  for (const k of ["log", "info", "warn", "error", "debug", "trace"] as const) console[k] = () => undefined;
}

async function main(): Promise<void> {
  const file = process.argv[2];
  const allowNondeterminism = process.argv.includes("--allow-nondeterminism");
  if (file === undefined) return reply({ ok: false, code: "E-USAGE", message: "no module given" });
  lockDown(allowNondeterminism);
  let mod: Record<string, unknown>;
  try {
    mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
  } catch (err) {
    return reply(classify(err));
  }
  const m = mod.default;
  if (!isModule(m)) {
    return reply({ ok: false, code: "E-EXPORT", message: "the default export is not a module built by system(...)" });
  }
  let json: string;
  try {
    json = JSON.stringify(m);
  } catch (err) {
    return reply({ ok: false, code: "S6", message: `the model is not plain data: ${(err as Error).message}` });
  }
  reply({ ok: true, module: JSON.parse(json), composition: compositionOf(m) ?? null });
}

function classify(err: unknown): { ok: false; code: string; message: string } {
  const e = err as { code?: unknown; message?: unknown } | undefined;
  const message = String(e?.message ?? err);
  if (e?.code === "E-ACCESS" || e?.code === "ERR_ACCESS_DENIED" || /E-ACCESS|ERR_ACCESS_DENIED|Access to this API has been restricted/.test(message)) {
    return { ok: false, code: "E-ACCESS", message };
  }
  const m = /^(E-[A-Z]+):/.exec(message);
  if (m !== null) return { ok: false, code: m[1]!, message };
  return { ok: false, code: "E-EVAL", message };
}

process.on("uncaughtException", (err) => reply(classify(err)));
process.on("unhandledRejection", (err) => reply(classify(err)));
await main();
