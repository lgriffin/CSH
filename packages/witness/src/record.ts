// recordWitness: a helper for any JavaScript or TypeScript test (Evidence tab, section 5).
// It records what happened; it does not assert.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Json, Witness } from "./witness.ts";

export interface RecordInput {
  event: string;
  args: Record<string, Json>;
  pre: Record<string, Json>;
  post: Record<string, Json>;
  result?: Json;
  mocked: string[];
  /** Test identity; defaults to CSH_TEST_NAME or the event name. */
  test?: string;
  /** Local result; defaults to passed, since a helper called mid-test cannot see the outcome. */
  localResult?: Witness["execution"]["localResult"];
  id?: string;
}

export interface RecordContext {
  /** Witness file; defaults to CSH_WITNESS_FILE or reports/witness.ndjson. */
  file?: string;
  commit?: string;
  environment?: string;
  now?: () => Date;
}

let counter = 0;

export function buildWitness(input: RecordInput, ctx: RecordContext = {}): Witness {
  const env = process.env;
  counter += 1;
  const w: Witness = {
    schema: "csh-witness/v1",
    id: input.id ?? `${input.test ?? env.CSH_TEST_NAME ?? input.event}#${counter}`,
    event: input.event,
    args: input.args,
    pre: input.pre,
    post: input.post,
    execution: {
      localResult: input.localResult ?? "passed",
      mocked: [...input.mocked],
    },
    subject: { commit: ctx.commit ?? env.CSH_COMMIT ?? env.GITHUB_SHA ?? "unknown", environment: ctx.environment ?? `node ${process.version}` },
    tool: { id: "@csh/witness", version: "0.1.0" },
    recordedAt: (ctx.now ?? (() => new Date()))().toISOString(),
  };
  if (input.result !== undefined) w.result = input.result;
  const test = input.test ?? env.CSH_TEST_NAME;
  if (test !== undefined) w.execution.test = test;
  return w;
}

/** Append one witness record to the witness file. */
export function recordWitness(input: RecordInput, ctx: RecordContext = {}): Witness {
  const w = buildWitness(input, ctx);
  const file = ctx.file ?? process.env.CSH_WITNESS_FILE ?? "reports/witness.ndjson";
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(w)}\n`);
  return w;
}
