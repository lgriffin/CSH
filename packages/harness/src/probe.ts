// The probe (Anchor, harnesses and A3, section 3.1): wraps the function under test once and records every call as a
// version 2 witness. It calls the real function and returns its real result; it asserts nothing, retries nothing and
// writes no outcome. The test runner's reporter supplies the outcome (section 3.2).
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { buildWitness, type Json, type Witness } from "@csh/witness";
import { testFile, testIdentity } from "./identity.ts";

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
  fullName?: string | undefined;
  filePath?: string | undefined;
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
const used = new Set<string>();

/** Escapes after "0" in a file token: one letter each, so the code is prefix-free. */
const ESCAPES: Record<string, string> = { "/": "s", ".": "d", "-": "h", _: "u", "0": "z" };

/**
 * The test file as a token of a witness id, of letters and digits only so that the example name the witness-files
 * adapter derives from the id keeps it whole: lower-case letters and the digits 1 to 9 kept, "/" as "0s", "." as "0d",
 * "-" as "0h", "_" as "0u", "0" as "0z", an upper-case letter as "0c" and the letter, anything else as "0x" and its
 * UTF-8 bytes in hex, and "0e" to end it. The code is prefix-free and holds no upper-case letter, so two files never
 * share a token, in the id or in the example name, whatever test names follow it (#25).
 */
export function fileSlug(path: string): string {
  let out = "";
  for (const ch of path) {
    if (/^[a-z1-9]$/.test(ch)) out += ch;
    else if (ESCAPES[ch] !== undefined) out += `0${ESCAPES[ch]}`;
    else if (/^[A-Z]$/.test(ch)) out += `0c${ch.toLowerCase()}`;
    else for (const b of new TextEncoder().encode(ch)) out += `0x${b.toString(16).padStart(2, "0")}`;
  }
  return `${out}0e`;
}

/**
 * A witness id from the test's file and full name: "locks on the third failure" in test/lockout.test.ts becomes
 * "test0slockout0dtest0dts0e--locks-on-the-third-failure". Node runs each file in its own process, so the file keeps ids
 * from two files apart; within a process, later calls are numbered, skipping any id already given (A-42).
 */
export function witnessId(fullName: string, file?: string): string {
  const slug = fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const name = slug === "" ? "witness" : slug;
  const base = file === undefined || file === "" ? name : `${fileSlug(file)}--${name}`;
  let n = calls.get(base) ?? 0;
  let id: string;
  do {
    n++;
    id = n === 1 ? base : `${base}-${n}`;
  } while (used.has(id));
  calls.set(base, n);
  used.add(id);
  return id;
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
      const file = testFile(t.filePath, ctx.cwd);
      return (...args: A): R => {
        const pre = mappers.pre(...args);
        const argValues = mappers.args(...args);
        const record = (out: Awaited<R>) => {
          const input: Parameters<typeof buildWitness>[0] = { id: witnessId(fullName, file), test, event, args: argValues, pre, post: mappers.post(out, ...args), mocked: mappers.mocked };
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
