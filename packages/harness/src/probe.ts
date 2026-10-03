// The probe (Anchor, harnesses and A3, section 3.1): wraps the function under test once and records every call as a
// version 2 witness. It calls the real function and returns its real result; it asserts nothing, retries nothing and
// writes no outcome. The test runner's reporter supplies the outcome (section 3.2).
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { buildWitness, type Json, type Witness } from "@csh/witness";
import { testIdentity } from "./identity.ts";

export const HARNESS_TOOL = { id: "@csh/harness", version: "0.1.0" };

/** Where each witness key comes from. These mappers are the only place that names witness keys. */
export interface ProbeMappers<A extends unknown[], R> {
  /** The state before the call, read from the call's arguments before the function runs. */
  pre: (...args: A) => Record<string, Json>;
  args: (...args: A) => Record<string, Json>;
  /** The state after the call, read from what the function returned (awaited, for an async function). */
  post: (out: Awaited<R>, ...args: A) => Record<string, Json>;
  result?: (out: Awaited<R>, ...args: A) => Json;
  /** Test doubles in play, as the author states them; the probe cannot detect one, so it does not claim to. */
  mocked: string[];
}

/** The parts of Node's test context the probe reads. */
export interface TestContextLike {
  name: string;
  fullName?: string;
  filePath?: string;
}

export interface ProbeContext {
  /** Witness file; defaults to CSH_WITNESS_FILE or reports/witnesses.ndjson. */
  file?: string;
  commit?: string;
  environment?: string;
  now?: () => Date;
  cwd?: string;
}

export interface Probe<A extends unknown[], R> {
  event: string;
  /** The function, recording each call as made by the test `t`, with the requirement identifiers it cites. */
  in(t: TestContextLike, options?: { cites?: string[] }): (...args: A) => R;
}

const calls = new Map<string, number>();

/** A witness id from the test's full name: "locks on the third failure" becomes "locks-on-the-third-failure". */
export function witnessId(fullName: string): string {
  const slug = fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const base = slug === "" ? "witness" : slug;
  const n = (calls.get(base) ?? 0) + 1;
  calls.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}

function write(w: Witness, file: string): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(w)}\n`);
}

export function probe<A extends unknown[], R>(event: string, fn: (...args: A) => R, mappers: ProbeMappers<A, R>, ctx: ProbeContext = {}): Probe<A, R> {
  return {
    event,
    in(t, options = {}) {
      const fullName = t.fullName ?? t.name;
      const test = testIdentity(t.filePath, fullName, ctx.cwd);
      return (...args: A): R => {
        const pre = mappers.pre(...args);
        const argValues = mappers.args(...args);
        const record = (out: Awaited<R>) => {
          const input: Parameters<typeof buildWitness>[0] = { id: witnessId(fullName), test, event, args: argValues, pre, post: mappers.post(out, ...args), mocked: mappers.mocked };
          if (mappers.result !== undefined) input.result = mappers.result(out, ...args);
          if (options.cites !== undefined) input.cites = options.cites;
          const ctxIn: Parameters<typeof buildWitness>[1] = {};
          if (ctx.commit !== undefined) ctxIn.commit = ctx.commit;
          if (ctx.environment !== undefined) ctxIn.environment = ctx.environment;
          if (ctx.now !== undefined) ctxIn.now = ctx.now;
          const w = buildWitness(input, ctxIn);
          w.tool = { ...HARNESS_TOOL };
          write(w, ctx.file ?? process.env.CSH_WITNESS_FILE ?? "reports/witnesses.ndjson");
        };
        // A call that throws returns nothing to observe, so nothing is recorded; the error reaches the test unchanged.
        const out = fn(...args);
        if (out !== null && typeof out === "object" && typeof (out as { then?: unknown }).then === "function") {
          return (out as unknown as Promise<unknown>).then((v) => {
            record(v as Awaited<R>);
            return v;
          }) as R;
        }
        record(out as Awaited<R>);
        return out;
      };
    },
  };
}
