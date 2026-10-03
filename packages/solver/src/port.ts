// The solver port. Anything that reaches the solver goes through this interface,
// so tests can substitute a fake (Implementer's brief, section 4).
import type { Vocabulary } from "@csh/kernel";
import type { F } from "./formula.ts";

export interface Tracked {
  id: string;
  f: F;
}

export interface CheckInput {
  vocabulary: Vocabulary;
  /** Background assertions, never in a core. */
  hard: F[];
  /** Assertions tracked under an id so that they can appear in an unsatisfiable core. */
  tracked: Tracked[];
  timeoutMs: number;
}

export type SatStatus = "sat" | "unsat" | "unknown";

export interface CheckResult {
  status: SatStatus;
  /** For unknown: solver-timeout, solver-error: ..., or solver-unknown: ... */
  reason?: string;
  /** For unsat: the ids of tracked assertions in the core. */
  core?: string[];
  /** For sat: the value of every free constant, integers as decimal strings, enumerations as member names. */
  model?: Record<string, string>;
}

export interface SolverPort {
  /** Solver identity and version, recorded in every report. */
  readonly id: string;
  check(input: CheckInput): Promise<CheckResult>;
}
