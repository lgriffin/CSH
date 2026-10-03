// The gate (Authority tab, sections 4 and 6): snapshots, dispositions, waivers and the
// decision record. A decision is valid for its snapshot digest only.
import { digestJson, stableJson } from "@csh/kernel";
import type { Assessment, Report } from "@csh/check";
import { isCalendarDate } from "@csh/ledger";

export interface Snapshot {
  commit: string;
  moduleDigest: string;
  ledgerHead: number;
  configDigest: string;
  lockDigest: string;
  tool: { version: string; solver: string };
}

export function snapshotDigest(s: Snapshot): string {
  return digestJson(s);
}

export type Disposition = "allow" | "review" | "block" | "waived";
export type Mode = "advisory" | "enforcing";

export interface Waiver {
  seq: number;
  fragment: string;
  digest: string;
  scope: string;
  expires: string;
}

export interface GateDecision {
  schema: "csh-gate/v1";
  snapshotDigest: string;
  mode: Mode;
  overall: "allow" | "review" | "block";
  obligations: {
    fragment: string;
    verdict: string;
    applicability: string;
    disposition: Disposition;
    waiverSeq?: number;
    selfApproved: boolean;
    /** Extension: in advisory mode, what enforcing mode would do. */
    recommends?: "block";
    /** Extension: why this disposition. */
    because: string;
  }[];
  invalidLedgerEntries: { seq: number; reason: string }[];
  /** Extension: candidate obligations and findings with a candidate member, listed and never blocking. */
  candidates: { obligations: string[]; findings: string[] };
}

export interface GateInput {
  report: Report;
  snapshot: Snapshot;
  mode: Mode;
  waivers: Waiver[];
  /** Commit date of the snapshot commit: waiver expiry is compared with it, not the wall clock. */
  commitDate: string;
}

/** A waiver is valid through its expiry date, compared with the date of the snapshot commit. */
export function waiverValid(w: Waiver, commitDate: string): boolean {
  // An expiry that is not a real calendar date never validates a waiver.
  return isCalendarDate(w.expires) && commitDate.slice(0, 10) <= w.expires;
}

function waiverFor(a: Assessment, input: GateInput): Waiver | undefined {
  const inScope = (w: Waiver) => w.fragment === a.fragment && w.digest === a.digest && (w.scope === a.fragment || a.findings.includes(w.scope));
  return input.waivers.filter(inScope).filter((w) => waiverValid(w, input.commitDate)).sort((x, y) => y.seq - x.seq)[0];
}

export function gate(input: GateInput): GateDecision {
  const { report, mode } = input;
  const assessments = report.assessments ?? [];
  const obligations: GateDecision["obligations"] = [];
  for (const a of assessments.filter((x) => x.authority === "approved")) {
    const row: GateDecision["obligations"][number] = { fragment: a.fragment, verdict: a.verdict, applicability: a.applicability, disposition: "allow", selfApproved: a.selfApproved, because: "satisfied" };
    const blockOrReview = (because: string) => {
      row.because = because;
      if (mode === "enforcing") row.disposition = "block";
      else {
        row.disposition = "review";
        row.recommends = "block";
      }
    };
    if (a.verdict === "conflicting") blockOrReview("conflicting");
    else if (a.verdict === "violated") {
      const w = waiverFor(a, input);
      if (w !== undefined) {
        row.disposition = "waived";
        row.waiverSeq = w.seq;
        row.because = `violated, waived until ${w.expires}`;
      } else blockOrReview(input.waivers.some((w) => w.fragment === a.fragment) ? "violated, waiver expired or out of scope" : "violated, no valid waiver");
    } else if (a.verdict === "unknown" || a.applicability === "stale") {
      const why = a.verdict === "unknown" ? "unknown" : "stale";
      if (a.critical && mode === "enforcing") {
        row.disposition = "block";
        row.because = `${why}, critical policy`;
      } else {
        row.disposition = "review";
        row.because = a.critical ? `${why}, critical policy` : why;
      }
    }
    if (a.selfApproved && a.needsReview && row.disposition === "allow") {
      row.disposition = "review";
      row.because = "self-approved, needs review";
    }
    obligations.push(row);
  }
  const overall = obligations.some((o) => o.disposition === "block") ? "block" : obligations.some((o) => o.disposition === "review" || o.disposition === "waived") ? "review" : "allow";
  return {
    schema: "csh-gate/v1",
    snapshotDigest: snapshotDigest(input.snapshot),
    mode,
    overall,
    obligations,
    invalidLedgerEntries: (report.ledger?.invalid ?? []).map(({ seq, reason }) => ({ seq, reason })),
    candidates: {
      obligations: assessments.filter((a) => a.authority === "candidate").map((a) => a.fragment),
      findings: report.findings.filter((f) => f.members.some((m) => m.authority !== "approved")).map((f) => f.id),
    },
  };
}

/** Continuous integration recomputes the snapshot and refuses a decision made for another (CSH-010). */
export function acceptDecision(d: GateDecision, current: Snapshot): { accepted: true } | { accepted: false; reason: string } {
  const digest = snapshotDigest(current);
  if (d.snapshotDigest !== digest) return { accepted: false, reason: `decision is for snapshot ${d.snapshotDigest}, not ${digest}` };
  return { accepted: true };
}

/** `csh gate` exits non-zero only on overall block in enforcing mode. */
export function exitCode(d: GateDecision): number {
  return d.mode === "enforcing" && d.overall === "block" ? 1 : 0;
}

export function formatDecision(d: GateDecision): string {
  return stableJson(d);
}
