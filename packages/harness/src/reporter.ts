// A reporter for Node's built-in test runner (Anchor, harnesses and A3, section 3.2): one csh-execution/v1 line per
// finished test, written to CSH_EXECUTIONS_FILE (default reports/executions.ndjson). It prints nothing, so it runs
// beside a reporter for people:
//   node --test --test-reporter=spec --test-reporter-destination=stdout \
//               --test-reporter=@csh/harness/reporter --test-reporter-destination=stdout test/
// Suites and skipped tests get no line. A failure in the test's own code is "failed"; any other failure (a hook, a
// timeout, a cancelled test) and a todo test are "errored".
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Execution } from "@csh/witness";
import { testIdentity } from "./identity.ts";

interface TestEventData {
  name: string;
  nesting: number;
  file?: string;
  skip?: boolean | string;
  todo?: boolean | string;
  details?: { type?: string; error?: { failureType?: string; cause?: { failureType?: string } } };
}

type TestEvent = { type: string; data: TestEventData };

export function executionOf(e: TestEvent, fullName: string, cwd = process.cwd()): Execution | undefined {
  if (e.type !== "test:pass" && e.type !== "test:fail") return undefined;
  const d = e.data;
  if (d.details?.type === "suite" || (d.skip !== undefined && d.skip !== false)) return undefined;
  let outcome: Execution["outcome"];
  if (d.todo !== undefined && d.todo !== false) outcome = "errored";
  else if (e.type === "test:pass") outcome = "passed";
  else outcome = d.details?.error?.failureType === "testCodeFailure" ? "failed" : "errored";
  return { schema: "csh-execution/v1", test: testIdentity(d.file, fullName, cwd), outcome };
}

/** Builds each test's full name from the names of the tests that enclose it, kept per file. */
export function nameTracker(): (e: TestEvent) => string {
  const stacks = new Map<string, string[]>();
  return (e) => {
    const key = e.data.file ?? "";
    const stack = stacks.get(key) ?? [];
    stacks.set(key, stack);
    if (e.type === "test:start") {
      stack.length = e.data.nesting;
      stack[e.data.nesting] = e.data.name;
    }
    return [...stack.slice(0, e.data.nesting), e.data.name].join(" > ");
  };
}

export default async function* reporter(source: AsyncIterable<TestEvent>): AsyncGenerator<string> {
  const file = process.env.CSH_EXECUTIONS_FILE ?? "reports/executions.ndjson";
  const fullName = nameTracker();
  let ready = false;
  for await (const e of source) {
    const name = fullName(e);
    const x = executionOf(e, name);
    if (x === undefined) continue;
    if (!ready) {
      mkdirSync(dirname(file), { recursive: true });
      ready = true;
    }
    appendFileSync(file, `${JSON.stringify(x)}\n`);
  }
  yield* [];
}
