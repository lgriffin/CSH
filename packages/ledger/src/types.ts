// Files of the Authority tab, section 2 and 3: maintainers and decisions.

export type Role = "intent-owner" | "domain-reviewer" | "contributor";

export interface Identity {
  name: string;
  kind: "person" | "agent";
  /** Signing key fingerprints. */
  keys: string[];
  roles: Role[];
}

export interface Maintainers {
  schema: "csh-maintainers/v1";
  identities: Identity[];
}

export type DecisionKind = "approve" | "reject" | "retire" | "waive" | "countersign";

export interface Decision {
  schema: "csh-decision/v1";
  seq: number;
  kind: DecisionKind;
  fragment: string;
  digest: string;
  cited?: { source: string; id: string; textDigest: string }[];
  rationale: string;
  actor: string;
  selfApproved: boolean;
  waiver?: { scope: string; expires: string };
  refers?: number;
}

/** A valid entry, with what the harness learned about it while reading the history. */
export interface ValidEntry extends Decision {
  commit: string;
  /** True when the maintainers file listed a single person at the time (D9), or the entry says so. */
  effectiveSelfApproved: boolean;
}

export interface InvalidEntry {
  seq: number;
  reason: string;
  commit?: string;
  detail?: string;
}

export interface LedgerState {
  entries: ValidEntry[];
  invalid: InvalidEntry[];
  /** seq of the last valid entry (0 when none). */
  head: number;
  /** The maintainers file in force at the head of history. */
  maintainers: Maintainers;
  /** Ignored changes to the maintainers file. */
  invalidMaintainerChanges: { commit: string; reason: string }[];
}

export const LEDGER_PATH = "csh/ledger.ndjson";
export const MAINTAINERS_PATH = "csh/maintainers.json";

export function persons(m: Maintainers): Identity[] {
  return m.identities.filter((i) => i.kind === "person");
}

/** A real calendar date written YYYY-MM-DD, such as a waiver expiry. */
export function isCalendarDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
