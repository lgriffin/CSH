// The isolated half of running an adapter (Evidence tab, section 4: "It runs in an
// isolated subprocess and never sees the ledger"). Started with Node's permission model:
// it may read the tool's own code and nothing else. The input bytes arrive over IPC.
// The clock, randomness, timers, the environment and the network are denied, since an
// adapter must be deterministic.
import { createRequire, syncBuiltinESMExports } from "node:module";

const send = process.send?.bind(process);
delete (process as { send?: unknown }).send;

function reply(msg: unknown): void {
  if (send === undefined) process.exit(2);
  send(msg, () => process.exit(0));
}

function deny(what: string): never {
  throw new Error(`E-ACCESS: adapters may not use ${what}`);
}

const NODE_INTERNAL_ENV = /^(NODE_[A-Z_]+|WATCH_REPORT_DEPENDENCIES|UV_[A-Z_]+|FORCE_COLOR|NO_COLOR|TERM)$/;

function lockDown(): void {
  const g = globalThis as Record<string, unknown>;
  const FakeDate = function () {
    deny("the clock (Date)");
  } as unknown as DateConstructor;
  Object.defineProperty(FakeDate, "now", { value: () => deny("the clock (Date.now)") });
  g.Date = FakeDate;
  Math.random = () => deny("randomness (Math.random)");
  for (const t of ["setTimeout", "setInterval", "setImmediate"]) g[t] = () => deny(`timers (${t})`);
  Object.defineProperty(process, "env", {
    value: new Proxy({}, { get: (_t, k) => (typeof k === "symbol" || NODE_INTERNAL_ENV.test(k) ? undefined : deny(`environment variables (${String(k)})`)) }),
  });
  g.fetch = () => deny("the network (fetch)");
  const require = createRequire(import.meta.url);
  const denied: Record<string, string[]> = {
    net: ["connect", "createConnection", "createServer"],
    tls: ["connect", "createServer"],
    http: ["request", "get", "createServer"],
    https: ["request", "get", "createServer"],
    http2: ["connect", "createServer", "createSecureServer"],
    dgram: ["createSocket"],
    dns: ["lookup", "resolve", "resolve4", "resolve6"],
    worker_threads: ["Worker"],
    child_process: ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"],
    crypto: ["randomBytes", "randomUUID", "randomInt", "getRandomValues"],
  };
  for (const [name, fns] of Object.entries(denied)) {
    const m = require(`node:${name}`) as Record<string, unknown>;
    for (const fn of fns) {
      try {
        Object.defineProperty(m, fn, { value: function denied(): never { return deny(`${name}.${fn}`); }, configurable: true, writable: true });
      } catch {
        // Left to the permission model.
      }
    }
  }
  // The IPC channel is already open; opening any new connection is denied.
  const net = require("node:net") as { Socket: { prototype: Record<string, unknown> } };
  net.Socket.prototype.connect = function connect(): never {
    return deny("net.Socket.connect");
  };
  syncBuiltinESMExports();
  for (const k of ["log", "info", "warn", "error", "debug", "trace"] as const) console[k] = () => undefined;
}

process.on("message", async (msg: { adapter: string; input: unknown }) => {
  try {
    // Locked down before the adapter's module is evaluated, so that its top-level code is held to the same rules.
    lockDown();
    const mod = (await import(msg.adapter)) as { adapter?: { run: (i: unknown) => unknown } };
    if (mod.adapter === undefined || typeof mod.adapter.run !== "function") return reply({ ok: false, message: "the module exports no adapter" });
    const output = await mod.adapter.run(msg.input);
    reply({ ok: true, output });
  } catch (err) {
    reply({ ok: false, message: String((err as Error)?.message ?? err) });
  }
});
process.on("uncaughtException", (err) => reply({ ok: false, message: String(err?.message ?? err) }));
