# Change review

A run says what holds now. A reviewer of a change wants to know what the change did: which approvals it cost, which
approved rules it broke, which signals it cleared or raised, and which evidence moved with it. `csh diff` compares two
runs of one component and says that, with what costs the reviewer a decision first
([10](../spec/10-next-layers.md), section 5). It decides nothing: the gate decides, and the diff explains.

## Running it

```sh
csh diff <base> <head> [--json] [--out <dir>] [--root <component>]
```

Each side is one of:

| Side | Read as |
|---|---|
| A directory holding `run.json`, `report.json` and `gate.json` | A stored run, such as `.csh-cache/runs/<digest>/` or an A3 stage record |
| A commit | Its stored run if there is one, else a run at that commit (`csh run --at`) |
| `.` | The working tree, run now. Refused in CI when the tree is dirty |
| `unavailable:<reason>` | A side that could not be had, with why |

Paths resolve from the current directory. Between two commits, the paths that changed come from `git diff`, and with the
component's manifest they give the observations and the inputs below. `--json` prints the `csh-diff/v1` model;
`--out` writes `diff.json` and `diff.md` to a directory. The command exits 0 whatever the diff shows, and non-zero only
when the head cannot be run.

## Reading it

The regression stage of the [lockout walkthrough](../lockout-walkthrough.md), section 11, against the approved one:

```text
Approvals lost: none
New violations and conflicts on approved rules:
  - SignInService/StopPasswordGuessing/LockOnThirdFailure: satisfied -> violated (block)
Rules that became unknown or stale: none
New signals among candidates:
  - example-conflict: SignInService/@UnitTests/WitnessTest0slockout0dtest0dts0eAllowsAThirdFailedAttempt, SignInService/StopPasswordGuessing/LockOnThirdFailure
  ...
Signals cleared: none
Observations:
  - tests no longer seen: UnitTests/test/lockout.test.ts::locks on the third failed attempt
  - the implementation and its tests changed in one change
  - the specification is untouched
```

| Section | What it lists |
|---|---|
| Approvals lost | Approved fragments the change edited, which are candidate again |
| New violations and conflicts on approved rules | Approved rules whose verdict became violated or conflicting, with the gate's disposition |
| Rules that became unknown or stale | Rules that could no longer be decided, with why |
| New signals among candidates | Findings and gaps the change raised, except the violations already listed |
| Signals cleared | Findings and gaps the change removed |
| Observations | Plain statements about the change: tests no longer seen, the specification and a practice's evidence changed together, the implementation and its tests changed together, the specification untouched |
| Authority moved | Rules whose authority changed, such as an approval gained; shown only when one did ([A-86](../../ASSUMPTIONS.md)) |

An empty section says `none`, so silence is never confused with an omission. The last line counts everything,
including what persisted. Signals are matched by id, which is stable across runs: a signal appears, clears or persists.

An observation is a fact about the change, never a judgment. "The implementation and its tests changed in one change"
is often right; the reviewer decides whether it is here.

## When a side cannot be run

A commit whose dependencies differ from the installed ones, or one from before the component existed, cannot be run.
The diff then says which side is missing and why, shows the other side alone, and says that no comparison was made. It
is never shown as an empty diff ([A-77](../../ASSUMPTIONS.md)).

## In continuous integration

The Change review job (`.github/scripts/diff-job.sh`) runs on every pull request, for the gate component and for the
`Workspace` component at the root. It checks out the merge base in a worktree of its own, installs it, runs it with its
own copy of the tool, and diffs that stored run against the head. The rendering goes to the job's summary and the
model, report and decision are kept as an artifact. The workflow asks for read access only and posts nothing on the
pull request ([A-75](../../ASSUMPTIONS.md)). The job never fails on what the diff says; the gate job does the deciding.
