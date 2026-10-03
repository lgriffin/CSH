// Authority from the ledger (Authority tab, sections 3.2 and 3.3).
import { identityOf, maintainersHistory, type ReadOptions } from "./ledger.ts";
import { type LedgerState, persons, type ValidEntry } from "./types.ts";
import type { VcsPort } from "./vcs.ts";

export interface AuthorityInfo {
  authority: "approved" | "candidate" | "retired";
  reason?: string;
  selfApproved?: boolean;
  needsReview?: boolean;
  seq?: number;
}

export interface FragmentRef {
  name: string;
  digest: string;
  cites: { source: string; id: string }[];
}

/**
 * Decide one fragment's authority. `items` maps "Source/ID" to the current text digest of
 * each identified source item; when given, an approval whose recorded text digests differ
 * returns the fragment to candidate with reason source-text-changed.
 */
export function resolveAuthority(state: LedgerState, f: FragmentRef, items?: ReadonlyMap<string, string>): AuthorityInfo {
  const deciding = state.entries.filter((e) => e.fragment === f.name && e.digest === f.digest && (e.kind === "approve" || e.kind === "reject" || e.kind === "retire"));
  const last = deciding[deciding.length - 1];
  if (last === undefined) {
    const older = state.entries.some((e) => e.fragment === f.name && e.kind === "approve");
    return older ? { authority: "candidate", reason: "digest-changed" } : { authority: "candidate" };
  }
  if (last.kind === "reject") return { authority: "candidate", reason: "rejected", seq: last.seq };
  if (last.kind === "retire") return { authority: "retired", seq: last.seq };
  if (items !== undefined) {
    for (const c of f.cites) {
      const now = items.get(`${c.source}/${c.id}`);
      const then = last.cited?.find((x) => x.source === c.source && x.id === c.id)?.textDigest;
      if (now === undefined || then === undefined || now !== then) return { authority: "candidate", reason: "source-text-changed", seq: last.seq };
    }
  }
  const selfApproved = last.effectiveSelfApproved;
  const countersigned = state.entries.some((e) => e.kind === "countersign" && e.refers === last.seq);
  const needsReview = selfApproved && persons(state.maintainers).length >= 2 && !countersigned;
  return { authority: "approved", selfApproved, needsReview, seq: last.seq };
}

/** Valid, unexpired-or-not waivers for a fragment at its current digest. Expiry is the gate's to judge. */
export function waiversFor(state: LedgerState, f: { name: string; digest: string }): ValidEntry[] {
  return state.entries.filter((e) => e.kind === "waive" && e.fragment === f.name && e.digest === f.digest);
}

/**
 * Authorship (Authority tab, section 3.3): the signing identity of the commit that last
 * changed a fragment's digest. `digestsAt` emits the specification at a commit and returns
 * fragment digests by name; only commits that touch `specPaths` are examined.
 */
export function authorship(
  vcs: VcsPort,
  specPaths: string[],
  digestsAt: (commit: string) => ReadonlyMap<string, string> | undefined,
  opts: ReadOptions = {},
): (fragment: string, digest: string, before: string) => string | undefined {
  const mh = maintainersHistory(vcs, opts);
  const commits = [...new Set(specPaths.flatMap((p) => vcs.commitsTouching(p)))];
  // Order by ancestry: oldest first.
  commits.sort((a, b) => (a === b ? 0 : vcs.isAncestor(a, b) ? -1 : 1));
  const memo = new Map<string, ReadonlyMap<string, string> | undefined>();
  const at = (c: string) => {
    if (!memo.has(c)) memo.set(c, digestsAt(c));
    return memo.get(c);
  };
  return (fragment, digest, before) => {
    let author: string | undefined;
    let prev: string | undefined;
    for (const c of commits) {
      if (c !== before && !vcs.isAncestor(c, before)) continue;
      const d = at(c)?.get(fragment);
      if (d !== prev) {
        const info = vcs.commit(c);
        const m = [...mh.versions].reverse().find((v) => v.commit === info.parents[0] || (info.parents[0] !== undefined && vcs.isAncestor(v.commit, info.parents[0])))?.m ?? mh.versions[0]?.m;
        author = d === digest ? (identityOf(m, info.signature)?.name ?? "unattributed") : undefined;
        prev = d;
      }
    }
    return author;
  };
}
