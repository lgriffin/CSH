# Authority and ledger

This tab specifies who can make a fragment authoritative and how that is recorded, how evidence goes stale, and how the gate turns results into a delivery decision. It covers stages 7 and 9 of the path. Everything here is proposed and unimplemented.

## 1. Threat this design answers

An AI agent with write access to the repository can edit specifications, tests and code together, so that everything agrees with itself and nothing agrees with what the owner intended. The design assumes the agent can change any file. It relies on one thing the agent cannot do: produce a commit signed with a person's key.

Stated limits (P10):

- If an agent can use the person's signing key, this design gives no protection. The key must live outside any environment an agent runs in, for example on a hardware token that requires touch.
- Signature checking is only as trustworthy as the place it runs. The enforcing gate must run in continuous integration on a protected branch, not on a machine the agent controls.
- A person can approve something wrong. The design makes approval deliberate and visible; it does not make it correct.

## 2. Files

| Path | Holds | Who may change it |
| --- | --- | --- |
| `csh/maintainers.json` | People and agents, their signing key fingerprints and roles | A commit signed by an existing person key |
| `csh/ledger.ndjson` | Decisions, one JSON object per line, append-only | A commit signed by a person key, touching only this file |
| `csh/config.json` | Solver budget, source locations, gate mode | Anyone; changes are part of the snapshot |
| `csh/lock.json` | Pack versions and digests | Generated |

```ts
interface Maintainers {
  schema: "csh-maintainers/v1";
  identities: {
    name: string;
    kind: "person" | "agent";
    keys: string[];                 // signing key fingerprints
    roles: ("intent-owner" | "domain-reviewer" | "contributor")[];
  }[];
}
```

The first version of `maintainers.json` is the root of trust. Its commit hash is pinned in the continuous-integration configuration, outside the repository's ordinary write path.

## 3. Ledger entries

```ts
interface Decision {
  schema: "csh-decision/v1";
  seq: number;                      // previous seq + 1
  kind: "approve" | "reject" | "retire" | "waive" | "countersign";
  fragment: string;                 // qualified name
  digest: string;                   // fragment digest being decided on
  cited?: { source: string; id: string; textDigest: string }[];
  rationale: string;                // required, non-empty
  actor: string;                    // name in maintainers.json
  selfApproved: boolean;
  waiver?: {
    scope: string;                  // finding id or obligation name
    expires: string;                // ISO 8601 date, required
  };
  refers?: number;                  // seq of the entry a countersign or reject answers
}
```

### 3.1 When an entry counts

An entry is valid only if all of these hold. An invalid entry is ignored and listed in the report.

1. The commit that added the line is signed, and the signature verifies against a key in `maintainers.json` as it stood in that commit's parent.
2. That key belongs to an identity of kind person (CSH-016). An agent key is rejected and logged.
3. The commit changes no file other than the ledger. Approval and change never share a commit, so an approval cannot carry an edit along with it.
4. The commit only appends lines. Any edit or removal of an earlier line invalidates the commit.
5. `seq` follows the previous entry, `actor` matches the signing identity, and `rationale` is not empty.
6. For approve: the actor holds the role the fragment needs (intent-owner for intents and obligations, domain-reviewer for bindings and lifted claims).

### 3.2 Authority from the ledger

For a fragment with qualified name n and current digest d, read valid entries for n in order:

- The latest of approve, reject or retire whose digest is d decides: approved, candidate or retired.
- Entries for any other digest are history and decide nothing. This is what returns a changed fragment to candidate (CSH-017).
- If an approved fragment cites source items, the cited text digests in the approval must equal the current ones, else candidate with reason source-text-changed.

### 3.3 Solo maintenance

While `maintainers.json` lists one person, every approval has `selfApproved: true`, and every report marks those fragments self-approved (D9).

When a second person is added (D17):

- New approvals by a fragment's author are invalid. Authorship is the signing identity of the commit that last changed the fragment's digest.
- Earlier self-approved entries stay valid and are flagged needs-review until a `countersign` entry from a different person refers to them.
- The gate treats needs-review as a review disposition, not a block.

### 3.4 Making a decision

`csh approve <fragment>` prints the fragment through the canonical printer, its digest, the findings and gaps that involve it, and what approving it would unlock. It then appends an entry to the ledger file and stops. The person reads it, commits that file alone, and signs. The tool never commits or signs.

`csh reject`, `csh retire` and `csh waive` work the same way.

## 4. Snapshots

A snapshot identifies everything a result depends on.

```ts
interface Snapshot {
  commit: string;          // repository commit evaluated
  moduleDigest: string;    // emitted model
  ledgerHead: number;      // seq of the last valid entry
  configDigest: string;
  lockDigest: string;
  tool: { version: string; solver: string };
}
```

The snapshot digest is SHA-256 over its canonical JSON. Every report, assessment and gate decision carries it.

## 5. Evidence dependencies and staleness

When evidence is recorded against an obligation, the harness stores the digests it depended on:

| Dependency | Digest of |
| --- | --- |
| obligation | The fragment |
| bindings | Each binding fragment the obligation's terms use |
| assumptions | Each assumption in force |
| transition | For SolverCheck, each transition of the event |
| subject | For a witness, the commit or build it ran against |
| tool | Tool and solver version, configuration |

At evaluation, each stored digest is compared with the snapshot's. Any difference makes the evidence stale. Stale evidence is kept, shown, and never counts toward satisfied (CSH-007).

For witnesses, `subject.commit` must equal the snapshot commit, or be an ancestor with no change to files the configuration lists as implementation paths. If that cannot be shown, the witness is stale. This is deliberately conservative.

Every run may be repeated with all caches discarded. Stage 7's exit test is that the incremental run and the full run produce identical reports.

## 6. The gate

`csh gate` reads a report for a snapshot and returns one disposition per approved obligation and one overall.

| Condition on an approved obligation | Advisory mode | Enforcing mode |
| --- | --- | --- |
| conflicting | review, recommends block | block |
| violated, no valid waiver | review, recommends block | block |
| violated, valid unexpired waiver in scope | waived | waived |
| unknown or stale, policy marks the intent critical | review | block |
| unknown or stale, otherwise | review | review |
| satisfied | allow | allow |
| self-approved and needs-review | review | review |

Overall: block if any block; else review if any review or waived; else allow. Candidate fragments and findings that include a candidate never block; they are listed.

Criticality is a property of the policy: `s.policy(name, { require, reject, critical: true })`. This adds one optional boolean to `Policy` in the model.

```ts
interface GateDecision {
  schema: "csh-gate/v1";
  snapshotDigest: string;
  mode: "advisory" | "enforcing";
  overall: "allow" | "review" | "block";
  obligations: {
    fragment: string; verdict: string; applicability: string;
    disposition: "allow" | "review" | "block" | "waived";
    waiverSeq?: number; selfApproved: boolean;
  }[];
  invalidLedgerEntries: { seq: number; reason: string }[];
}
```

Rules:

- A waiver changes disposition only. The verdict in the report and the decision stays violated (P9).
- A waiver past its expiry date is ignored. Expiry is compared with the commit date of the snapshot commit, not the wall clock, so a decision is reproducible.
- A decision is valid for its snapshot digest only. Continuous integration recomputes the snapshot for the commit being merged and refuses a decision whose digest differs (CSH-010).
- `csh gate` exits non-zero only on overall block in enforcing mode.

## 7. Agent interface

An agent uses the same commands as a person, minus the signed commit.

| Agent may | Through |
| --- | --- |
| Read the model, findings, gaps, authority | `csl print`, `csh check`, `csh gaps`, `csh explain` |
| Propose specification changes and bindings | Ordinary commits; all results are candidate |
| Record witnesses | Adapter A |
| Draft a decision for a person | `csh approve` writes the line; the person commits and signs |

An agent's commit that touches the ledger is unsigned or agent-signed, so the entries are invalid and are reported. Nothing else is needed to keep an agent from approving.

An optional tool-protocol server may expose the read commands to agents. It is a transport and holds no authority.

## 8. Fixtures this tab must reproduce

F40 to F46 and F51 from the other tabs, plus:

| ID | Action | Expected |
| --- | --- | --- |
| F60 | A signed commit adds a ledger line and also edits a specification file | Entry invalid, reason mixed-commit |
| F61 | A signed commit rewrites an earlier ledger line | Commit invalid, reason not-append-only |
| F62 | Second person added; first person approves their own new obligation | Entry invalid, reason self-approval-ended |
| F63 | Second person countersigns an earlier self-approved entry | needs-review flag cleared for that fragment |
| F64 | Incremental run after a binding change, then full run | Identical reports |
