import { describe, expect, it } from "vitest";
import type { Assessment, Report } from "@csh/check";
import { acceptDecision, exitCode, gate, type Mode, type Snapshot, snapshotDigest, type Waiver, waiverValid } from "../src/index.ts";

const snapshot: Snapshot = { commit: "c1", moduleDigest: "m", ledgerHead: 3, configDigest: "cfg", lockDigest: "lock", tool: { version: "0.1.0", solver: "z3" } };

const assessment = (p: Partial<Assessment>): Assessment => ({
  fragment: "Account/#invariant/NonNegative",
  kind: "invariant",
  source: "intent",
  digest: "d1",
  authority: "approved",
  selfApproved: false,
  needsReview: false,
  verdict: "satisfied",
  applicability: "current",
  critical: false,
  methods: [],
  evidence: [],
  reasons: [],
  findings: [],
  ...p,
});

const report = (as: Assessment[]): Report => ({
  schema: "csh-report/v1",
  moduleDigest: "m",
  tool: { version: "0.1.0", solver: "z3", budgetMs: 5000 },
  findings: [],
  notComparable: [],
  gapView: { sources: [], rows: [], gaps: [] },
  assessments: as,
  unliftable: [],
  errors: [],
  diagnostics: [],
  executions: [],
  items: [],
});

const decide = (a: Partial<Assessment>, mode: Mode, waivers: Waiver[] = [], commitDate = "2026-10-01T10:00:00Z") =>
  gate({ report: report([assessment(a)]), snapshot, mode, waivers, commitDate });

describe("gate dispositions (Authority tab, section 6)", () => {
  it.each<[string, Partial<Assessment>, Mode, string]>([
    ["satisfied", {}, "enforcing", "allow"],
    ["conflicting, enforcing", { verdict: "conflicting" }, "enforcing", "block"],
    ["conflicting, advisory", { verdict: "conflicting" }, "advisory", "review"],
    ["violated, enforcing", { verdict: "violated" }, "enforcing", "block"],
    ["unknown", { verdict: "unknown" }, "enforcing", "review"],
    ["unknown, critical, enforcing", { verdict: "unknown", critical: true }, "enforcing", "block"],
    ["unknown, critical, advisory", { verdict: "unknown", critical: true }, "advisory", "review"],
    ["stale", { applicability: "stale" }, "enforcing", "review"],
    ["self-approved needing review", { selfApproved: true, needsReview: true }, "enforcing", "review"],
    ["self-approved, solo", { selfApproved: true }, "enforcing", "allow"],
  ])("%s gives %s", (_n, a, mode, disposition) => {
    expect(decide(a, mode).obligations[0]!.disposition).toBe(disposition);
  });

  it("records what enforcing mode would do in advisory mode", () => {
    const d = decide({ verdict: "violated" }, "advisory");
    expect(d.obligations[0]).toMatchObject({ disposition: "review", recommends: "block" });
    expect(exitCode(d)).toBe(0);
  });

  it("ignores candidate obligations, listing them", () => {
    const d = decide({ authority: "candidate", verdict: "violated" }, "enforcing");
    expect(d.obligations).toEqual([]);
    expect(d.overall).toBe("allow");
    expect(d.candidates.obligations).toEqual(["Account/#invariant/NonNegative"]);
  });

  const waiver: Waiver = { seq: 4, fragment: "Account/#invariant/NonNegative", digest: "d1", scope: "Account/#invariant/NonNegative", expires: "2026-10-15" };

  it("waives a violation until the waiver expires, judged by the commit date", () => {
    expect(decide({ verdict: "violated" }, "enforcing", [waiver]).obligations[0]).toMatchObject({ disposition: "waived", waiverSeq: 4 });
    expect(decide({ verdict: "violated" }, "enforcing", [waiver], "2026-10-15T23:00:00Z").obligations[0]!.disposition).toBe("waived");
    const late = decide({ verdict: "violated" }, "enforcing", [waiver], "2026-10-16T00:00:00Z");
    expect(late.obligations[0]).toMatchObject({ disposition: "block", because: "violated, waiver expired or out of scope" });
    expect(exitCode(late)).toBe(1);
  });

  it("does not apply a waiver at another digest", () => {
    expect(decide({ verdict: "violated", digest: "d2" }, "enforcing", [waiver]).obligations[0]!.disposition).toBe("block");
  });

  it("waives a finding-scoped waiver only when the finding is the obligation's", () => {
    const w = { ...waiver, scope: "f123" };
    expect(decide({ verdict: "violated", findings: ["f123"] }, "enforcing", [w]).obligations[0]!.disposition).toBe("waived");
    expect(decide({ verdict: "violated", findings: ["f999"] }, "enforcing", [w]).obligations[0]!.disposition).toBe("block");
  });

  it("refuses a decision made for another snapshot", () => {
    const d = decide({}, "enforcing");
    expect(acceptDecision(d, snapshot)).toEqual({ accepted: true });
    const moved = { ...snapshot, ledgerHead: 4 };
    expect(snapshotDigest(moved)).not.toBe(snapshotDigest(snapshot));
    expect(acceptDecision(d, moved).accepted).toBe(false);
  });

  it("compares expiry by date only", () => {
    expect(waiverValid(waiver, "2026-10-15T23:59:59Z")).toBe(true);
    expect(waiverValid(waiver, "2026-10-16")).toBe(false);
    expect(waiverValid({ ...waiver, expires: "2026-02-31" }, "2026-01-01")).toBe(false);
    expect(waiverValid({ ...waiver, expires: "2099-12-31junk" }, "2026-01-01")).toBe(false);
  });
});
