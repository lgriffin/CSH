// Reading the ledger from history (Authority tab, section 3.1). Validity is decided per
// commit from what the repository shows, never from what the ledger file claims about itself.
import { type CommitInfo, normaliseFingerprint, type VcsPort } from "./vcs.ts";
import { type Decision, type Identity, type InvalidEntry, isCalendarDate, LEDGER_PATH, type LedgerState, type Maintainers, MAINTAINERS_PATH, persons, type ValidEntry } from "./types.ts";

export interface ReadOptions {
  ledgerPath?: string;
  maintainersPath?: string;
  /**
   * The commit holding the first, trusted maintainers file. It is pinned outside the
   * repository's ordinary write path (continuous-integration configuration). When absent,
   * the first commit that added the file is the root.
   */
  rootCommit?: string;
  /**
   * The identity that authored a fragment at a digest: the signer of the commit that last
   * changed the fragment's digest, before the given commit (Authority tab, section 3.3).
   */
  authorOf?: (fragment: string, digest: string, before: string) => string | undefined;
}

function lines(text: string | undefined): string[] {
  if (text === undefined || text === "") return [];
  const ls = text.split("\n");
  if (ls[ls.length - 1] === "") ls.pop();
  return ls;
}

function parseMaintainers(text: string | undefined): Maintainers | undefined {
  if (text === undefined) return undefined;
  try {
    const m = JSON.parse(text) as Maintainers;
    if (m.schema !== "csh-maintainers/v1" || !Array.isArray(m.identities)) return undefined;
    const strings = (x: unknown) => Array.isArray(x) && x.every((y) => typeof y === "string");
    const wellFormed = (i: unknown): boolean => {
      const r = i as Partial<Identity> | null;
      return typeof r === "object" && r !== null && typeof r.name === "string" && (r.kind === "person" || r.kind === "agent") && strings(r.keys) && strings(r.roles);
    };
    return m.identities.every(wellFormed) ? m : undefined;
  } catch {
    return undefined;
  }
}

export function identityOf(m: Maintainers | undefined, sig: CommitInfo["signature"]): Identity | undefined {
  if (m === undefined || sig === undefined) return undefined;
  const fprs = new Set(sig.fingerprints.map(normaliseFingerprint));
  return m.identities.find((i) => i.keys.some((k) => fprs.has(normaliseFingerprint(k))));
}

/** The maintainers file as it validly stood at each change: the root, then changes signed by a person already listed. */
export function maintainersHistory(vcs: VcsPort, opts: ReadOptions = {}): { versions: { commit: string; m: Maintainers }[]; invalid: { commit: string; reason: string }[] } {
  const path = opts.maintainersPath ?? MAINTAINERS_PATH;
  const versions: { commit: string; m: Maintainers }[] = [];
  const invalid: { commit: string; reason: string }[] = [];
  let commits = vcs.commitsTouching(path);
  if (opts.rootCommit !== undefined) {
    const root = opts.rootCommit;
    commits = commits.filter((c) => c !== root && vcs.isAncestor(root, c));
    const m = parseMaintainers(vcs.fileAt(root, path));
    if (m !== undefined) versions.push({ commit: root, m });
  }
  // Only the pinned root, or else the first commit that added the file, can be the unsigned root.
  // If that file is malformed there is no trusted root, and no later change can become one.
  let rootDecided = opts.rootCommit !== undefined;
  for (const c of commits) {
    const m = parseMaintainers(vcs.fileAt(c, path));
    if (!rootDecided) {
      rootDecided = true;
      if (m !== undefined) versions.push({ commit: c, m });
      else invalid.push({ commit: c, reason: "malformed" });
      continue;
    }
    if (versions.length === 0) {
      invalid.push({ commit: c, reason: "no-trusted-root" });
      continue;
    }
    const info = vcs.commit(c);
    const prev = maintainersAtVersions(versions, vcs, info.parents[0]);
    const who = identityOf(prev, info.signature);
    if (info.signature === undefined) invalid.push({ commit: c, reason: "unsigned" });
    else if (who === undefined) invalid.push({ commit: c, reason: "unknown-key" });
    else if (who.kind !== "person") invalid.push({ commit: c, reason: "agent-key" });
    else if (m === undefined) invalid.push({ commit: c, reason: "malformed" });
    else versions.push({ commit: c, m });
  }
  return { versions, invalid };
}

function maintainersAtVersions(versions: { commit: string; m: Maintainers }[], vcs: VcsPort, commit: string | undefined): Maintainers | undefined {
  if (commit === undefined) return undefined;
  for (let i = versions.length - 1; i >= 0; i--) if (versions[i]!.commit === commit || vcs.isAncestor(versions[i]!.commit, commit)) return versions[i]!.m;
  return undefined;
}

const KINDS = new Set(["approve", "reject", "retire", "waive", "countersign"]);

function parseDecision(line: string): { d: Decision } | { seq: number; why: string } {
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    return { seq: -1, why: "malformed" };
  }
  const d = v as Partial<Decision>;
  const seq = typeof d.seq === "number" ? d.seq : -1;
  if (typeof v !== "object" || v === null || d.schema !== "csh-decision/v1") return { seq, why: "malformed" };
  if (!Number.isInteger(d.seq) || !KINDS.has(d.kind as string) || typeof d.fragment !== "string" || typeof d.digest !== "string" || typeof d.actor !== "string" || typeof d.selfApproved !== "boolean") return { seq, why: "malformed" };
  if (typeof d.rationale !== "string") return { seq, why: "malformed" };
  return { d: d as Decision };
}

function roleFor(fragment: string): "intent-owner" | "domain-reviewer" {
  const container = fragment.split("/")[1] ?? "";
  return container.startsWith("@") || container === "#binding" ? "domain-reviewer" : "intent-owner";
}

/** Read every ledger entry in history and decide which count. */
export function readLedger(vcs: VcsPort, opts: ReadOptions = {}): LedgerState {
  const path = opts.ledgerPath ?? LEDGER_PATH;
  const mh = maintainersHistory(vcs, opts);
  const entries: ValidEntry[] = [];
  const invalid: InvalidEntry[] = [];
  let head = 0;
  for (const c of vcs.commitsTouching(path)) {
    const info = vcs.commit(c);
    const parent = info.parents[0];
    const before = lines(parent === undefined ? undefined : vcs.fileAt(parent, path));
    const after = lines(vcs.fileAt(c, path));
    const appendOnly = after.length >= before.length && before.every((l, i) => l === after[i]);
    const added = appendOnly ? after.slice(before.length) : after.filter((l, i) => before[i] !== l);
    const m = maintainersAtVersions(mh.versions, vcs, parent);
    const who = identityOf(m, info.signature);
    // Commit-level rules 1 to 4.
    let commitWhy: string | undefined;
    if (!appendOnly) commitWhy = "not-append-only";
    else if (info.signature === undefined) commitWhy = "unsigned";
    else if (who === undefined) commitWhy = "unknown-key";
    else if (who.kind !== "person") commitWhy = "agent-key";
    else if (info.changed.some((p) => p !== path)) commitWhy = "mixed-commit";
    for (const line of added) {
      const parsed = parseDecision(line);
      const seq = "d" in parsed ? parsed.d.seq : parsed.seq;
      const bad = (reason: string, detail?: string) => {
        const e: InvalidEntry = { seq, reason, commit: c };
        if (detail !== undefined) e.detail = detail;
        invalid.push(e);
      };
      if (commitWhy !== undefined) {
        bad(commitWhy, commitWhy === "mixed-commit" ? `also changes ${info.changed.filter((p) => p !== path).join(", ")}` : undefined);
        continue;
      }
      if (!("d" in parsed)) {
        bad(parsed.why);
        continue;
      }
      const d = parsed.d;
      const signer = who!;
      // Entry-level rules 5 and 6, and the solo-maintenance rules of section 3.3.
      if (d.seq !== head + 1) {
        bad("bad-seq", `expected ${head + 1}`);
        continue;
      }
      if (d.actor !== signer.name) {
        bad("actor-mismatch", `signed by ${signer.name}`);
        continue;
      }
      if (d.rationale.trim() === "") {
        bad("no-rationale");
        continue;
      }
      const people = persons(m!).length;
      if (d.kind === "approve") {
        const role = roleFor(d.fragment);
        if (!signer.roles.includes(role)) {
          bad("missing-role", `needs ${role}`);
          continue;
        }
        if (people >= 2 && opts.authorOf?.(d.fragment, d.digest, c) === signer.name) {
          bad("self-approval-ended", `${signer.name} authored ${d.fragment}`);
          continue;
        }
      }
      if (d.kind === "waive" && (d.waiver === undefined || typeof d.waiver.scope !== "string" || !isCalendarDate(d.waiver.expires))) {
        bad("malformed-waiver");
        continue;
      }
      if (d.kind === "countersign") {
        const target = entries.find((e) => e.seq === d.refers);
        if (target === undefined || target.kind !== "approve" || !target.effectiveSelfApproved) {
          bad("bad-countersign", `seq ${String(d.refers)} is not a self-approved approval`);
          continue;
        }
        if (target.actor === signer.name) {
          bad("bad-countersign", "a countersign must come from a different person");
          continue;
        }
      }
      entries.push({ ...d, commit: c, effectiveSelfApproved: d.kind === "approve" && (people === 1 || d.selfApproved) });
      head = d.seq;
    }
  }
  const last = mh.versions[mh.versions.length - 1];
  return { entries, invalid, head, maintainers: last?.m ?? { schema: "csh-maintainers/v1", identities: [] }, invalidMaintainerChanges: mh.invalid };
}
