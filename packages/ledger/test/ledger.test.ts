import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendDecision,
  type Decision,
  formatDecision,
  type Identity,
  LEDGER_PATH,
  MAINTAINERS_PATH,
  type MemoryCommit,
  memoryVcs,
  readLedger,
  resolveAuthority,
  waiversFor,
} from "../src/index.ts";

const ana: Identity = { name: "ana", kind: "person", keys: ["AAAA"], roles: ["intent-owner", "domain-reviewer"] };
const ben: Identity = { name: "ben", kind: "person", keys: ["BBBB"], roles: ["intent-owner"] };
const bot: Identity = { name: "bot", kind: "agent", keys: ["CCCC"], roles: ["contributor"] };
const maintainers = (...ids: Identity[]) => JSON.stringify({ schema: "csh-maintainers/v1", identities: ids });

let seq = 0;
const dec = (p: Partial<Decision> = {}): Decision => ({
  schema: "csh-decision/v1",
  seq: p.seq ?? ++seq,
  kind: "approve",
  fragment: "Account/#invariant/NonNegative",
  digest: "sha256:1",
  rationale: "reviewed",
  actor: "ana",
  selfApproved: false,
  ...p,
});

/** A history: a root commit with the maintainers file, then one commit per step appending ledger lines. */
function history(people: Identity[], steps: { lines: Decision[] | string[]; signer?: string | undefined; extra?: Record<string, string>; replace?: boolean }[]) {
  const commits: MemoryCommit[] = [{ hash: "c0", files: { [MAINTAINERS_PATH]: maintainers(...people) } }];
  let text = "";
  steps.forEach((s, i) => {
    const ls = s.lines.map((l) => (typeof l === "string" ? l : formatDecision(l)));
    text = (s.replace === true ? "" : text) + ls.map((l) => `${l}\n`).join("");
    const c: MemoryCommit = { hash: `c${i + 1}`, parent: `c${i}`, files: { [LEDGER_PATH]: text, ...(s.extra ?? {}) } };
    if (s.signer !== undefined) c.signer = s.signer;
    commits.push(c);
  });
  return memoryVcs(commits);
}

describe("ledger rules", () => {
  it("accepts a signed, append-only entry by a listed person", () => {
    seq = 0;
    const s = readLedger(history([ana], [{ lines: [dec()], signer: "aaaa" }]));
    expect(s.invalid).toEqual([]);
    expect(s.head).toBe(1);
    expect(s.entries[0]!.effectiveSelfApproved).toBe(true); // one person listed (D9)
  });

  it.each([
    ["unsigned", { signer: undefined }, "unsigned"],
    ["an unknown key", { signer: "DDDD" }, "unknown-key"],
    ["an agent key", { signer: "CCCC" }, "agent-key"],
    ["a commit that changes another file", { signer: "AAAA", extra: { "src/a.ts": "x" } }, "mixed-commit"],
  ])("rejects %s", (_n, step, reason) => {
    seq = 0;
    const s = readLedger(history([ana, bot], [{ lines: [dec()], ...step }]));
    expect(s.entries).toEqual([]);
    expect(s.invalid.map((x) => x.reason)).toEqual([reason]);
  });

  it("rejects a commit that rewrites earlier lines", () => {
    seq = 0;
    const first = dec();
    const s = readLedger(history([ana], [{ lines: [first], signer: "AAAA" }, { lines: [{ ...first, rationale: "edited" }, dec()], signer: "AAAA", replace: true }]));
    expect(s.entries.map((e) => e.seq)).toEqual([1]);
    expect(s.invalid.every((x) => x.reason === "not-append-only")).toBe(true);
  });

  it.each([
    ["a skipped sequence number", dec({ seq: 3 }), "bad-seq"],
    ["an actor who did not sign", dec({ seq: 1, actor: "ben" }), "actor-mismatch"],
    ["an empty rationale", dec({ seq: 1, rationale: "  " }), "no-rationale"],
    ["a malformed line", "{\"schema\":\"csh-decision/v1\",\"seq\":1}", "malformed"],
    ["a waiver with no expiry", dec({ seq: 1, kind: "waive", waiver: { scope: "x", expires: "soon" } }), "malformed-waiver"],
  ])("rejects %s", (_n, line, reason) => {
    const s = readLedger(history([ana], [{ lines: [line] as Decision[] | string[], signer: "AAAA" }]));
    expect(s.invalid.map((x) => x.reason)).toEqual([reason]);
  });

  it("requires the role the fragment needs", () => {
    seq = 0;
    const s = readLedger(history([ana, ben], [{ lines: [dec({ actor: "ben", fragment: "Account/@Product/R1" })], signer: "BBBB" }]));
    expect(s.invalid.map((x) => x.reason)).toEqual(["missing-role"]);
  });

  it("ends self-approval once a second person is listed", () => {
    seq = 0;
    const vcs = history([ana, ben], [{ lines: [dec()], signer: "AAAA" }]);
    expect(readLedger(vcs, { authorOf: () => "ana" }).invalid.map((x) => x.reason)).toEqual(["self-approval-ended"]);
    expect(readLedger(vcs, { authorOf: () => "ben" }).invalid).toEqual([]);
  });

  it("accepts a countersign only from a different person, on a self-approved approval", () => {
    seq = 0;
    const s = readLedger(
      history([ana, ben], [
        { lines: [dec({ selfApproved: true })], signer: "AAAA" },
        { lines: [dec({ kind: "countersign", refers: 1 })], signer: "AAAA" },
        { lines: [dec({ seq: 2, kind: "countersign", refers: 1, actor: "ben" })], signer: "BBBB" },
      ]),
    );
    expect(s.invalid.map((x) => x.reason)).toEqual(["bad-countersign"]);
    expect(s.entries.map((e) => e.kind)).toEqual(["approve", "countersign"]);
    const a = resolveAuthority(s, { name: "Account/#invariant/NonNegative", digest: "sha256:1", cites: [] });
    expect(a).toMatchObject({ authority: "approved", selfApproved: true, needsReview: false });
  });

  it("ignores a maintainers change signed by someone not already listed", () => {
    seq = 0;
    const vcs = memoryVcs([
      { hash: "c0", files: { [MAINTAINERS_PATH]: maintainers(ana) } },
      { hash: "c1", parent: "c0", signer: "BBBB", files: { [MAINTAINERS_PATH]: maintainers(ana, ben) } },
      { hash: "c2", parent: "c1", signer: "BBBB", files: { [LEDGER_PATH]: `${formatDecision(dec({ actor: "ben" }))}\n` } },
    ]);
    const s = readLedger(vcs);
    expect(s.invalidMaintainerChanges).toEqual([{ commit: "c1", reason: "unknown-key" }]);
    expect(s.invalid.map((x) => x.reason)).toEqual(["unknown-key"]);
  });
});

describe("authority", () => {
  const ledger = (lines: Decision[]) => readLedger(history([ana], [{ lines, signer: "AAAA" }]));
  const f = { name: "Account/#invariant/NonNegative", digest: "sha256:1", cites: [{ source: "Product", id: "R1" }] };

  it("returns a fragment to candidate when its digest changes", () => {
    seq = 0;
    expect(resolveAuthority(ledger([dec()]), { ...f, digest: "sha256:2" })).toEqual({ authority: "candidate", reason: "digest-changed" });
  });

  it("follows the last decision: reject, then retire", () => {
    seq = 0;
    expect(resolveAuthority(ledger([dec(), dec({ kind: "reject" })]), f)).toMatchObject({ authority: "candidate", reason: "rejected" });
    seq = 0;
    expect(resolveAuthority(ledger([dec(), dec({ kind: "retire" })]), f)).toMatchObject({ authority: "retired" });
  });

  it("returns to candidate when cited source text changed", () => {
    seq = 0;
    const s = ledger([dec({ cited: [{ source: "Product", id: "R1", textDigest: "t1" }] })]);
    expect(resolveAuthority(s, f, new Map([["Product/R1", "t1"]])).authority).toBe("approved");
    expect(resolveAuthority(s, f, new Map([["Product/R1", "t2"]]))).toMatchObject({ authority: "candidate", reason: "source-text-changed" });
  });

  it("lists waivers at the current digest only", () => {
    seq = 0;
    const s = ledger([dec({ kind: "waive", waiver: { scope: "Q-PRES", expires: "2026-12-01" } })]);
    expect(waiversFor(s, f)).toHaveLength(1);
    expect(waiversFor(s, { ...f, digest: "sha256:2" })).toHaveLength(0);
  });
});

describe("drafting", () => {
  it("appends a line with the next sequence number and refuses an empty rationale", () => {
    const dir = mkdtempSync(join(tmpdir(), "csh-ledger-"));
    try {
      const file = join(dir, "csh", "ledger.ndjson");
      const base = { kind: "approve" as const, fragment: "F", digest: "d", rationale: "ok", actor: "ana", selfApproved: true };
      expect(appendDecision(file, base).seq).toBe(1);
      expect(appendDecision(file, base).seq).toBe(2);
      expect(() => appendDecision(file, { ...base, rationale: " " })).toThrow(/rationale/);
      const ls = readFileSync(file, "utf8").trim().split("\n");
      expect(ls).toHaveLength(2);
      expect(Object.keys(JSON.parse(ls[0]!))).toEqual(["schema", "seq", "kind", "fragment", "digest", "rationale", "actor", "selfApproved"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
