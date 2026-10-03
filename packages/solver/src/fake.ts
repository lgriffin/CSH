// A fake solver for tests and fault injection: it answers from a script.
import type { CheckInput, CheckResult, SolverPort } from "./port.ts";

export type FakeBehaviour = "crash" | "timeout" | "unknown" | "garbage" | ((input: CheckInput) => CheckResult | Promise<CheckResult>);

export function createFakeSolver(behaviour: FakeBehaviour, id = "fake 0"): SolverPort {
  return {
    id,
    async check(input: CheckInput): Promise<CheckResult> {
      if (behaviour === "crash") throw new Error("solver process exited unexpectedly");
      if (behaviour === "timeout") return { status: "unknown", reason: "solver-timeout" };
      if (behaviour === "unknown") return { status: "unknown", reason: "solver-unknown: incomplete" };
      if (behaviour === "garbage") return { status: "maybe" } as unknown as CheckResult;
      return behaviour(input);
    },
  };
}
