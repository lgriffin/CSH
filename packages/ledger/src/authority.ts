// Authority from the ledger (Authority tab, sections 3.2 and 3.3).
import { identityOf, maintainersHistory, type ReadOptions } from "./ledger.ts";
import { type Identity, type LedgerState, persons, type ValidEntry } from "./types.ts";
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

/** Where a fragment's current digest came from: the commit that last changed it, and who signed that commit. */
export interface Provenance {
  commit: string;
  /** Committer date of that commit, ISO 8601. */
  date: string;
  /** The signing identity, as the maintainers file in force before the commit lists it; absent when unsigned or unlisted. */
  identity?: Identity;
}

/**
 * Provenance of each fragment's digest (Authority tab, section 3.3; Next layers, section 6.5): the commit that last
 * changed it, among the commits that touch `specPaths`, and its signing identity. `digestsAt` emits the specification at
 * a commit and returns fragment digests by name. Undefined when the digest given is not the one history last gave it,
 * such as an uncommitted change.
 */
export function provenance(
  vcs: VcsPort,
  specPaths: string[],
  digestsAt: (commit: string) => ReadonlyMap<string, string> | undefined,
  opts: ReadOptions = {},
): (fragment: string, digest: string, before: string) => Provenance | undefined {
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
    let found: Provenance | undefined;
    let prev: string | undefined;
    for (const c of commits) {
      if (c !== before && !vcs.isAncestor(c, before)) continue;
      const d = at(c)?.get(fragment);
      if (d !== prev) {
        const info = vcs.commit(c);
        const identity = identityOf(maintainersAt(vcs, mh, c), info.signature);
        found = d === digest ? { commit: c, date: info.date, ...(identity !== undefined ? { identity } : {}) } : undefined;
        prev = d;
      }
    }
    return found;
  };
}

/**
 * The maintainers file that names who signed `commit`: the version in force before it, or, for the commit that is the
 * root of trust, the root's own. A commit older than any maintainers file has none, and its signer is named by no one,
 * even when a later file lists the key (A-91).
 */
export function maintainersAt(vcs: VcsPort, mh: ReturnType<typeof maintainersHistory>, commit: string) {
  const parent = vcs.commit(commit).parents[0];
  const before = [...mh.versions].reverse().find((v) => v.commit === parent || (parent !== undefined && vcs.isAncestor(v.commit, parent)));
  if (before !== undefined) return before.m;
  return mh.versions[0]?.commit === commit ? mh.versions[0].m : undefined;
}

export type AuthoredBy = "person" | "agent" | "unknown";

/** Who wrote a fragment's current digest: the kind of the identity that signed it; unknown when unsigned or unlisted. */
export const authoredByOf = (p: Provenance | undefined): AuthoredBy => p?.identity?.kind ?? "unknown";

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
  const of = provenance(vcs, specPaths, digestsAt, opts);
  return (fragment, digest, before) => {
    const p = of(fragment, digest, before);
    return p === undefined ? undefined : (p.identity?.name ?? "unattributed");
  };
}
