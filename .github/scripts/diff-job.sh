#!/usr/bin/env bash
# The CI change review for one component (Next layers, section 5.4). The merge base runs in a worktree of its own with
# its own install and its own csh, so a change to dependencies never runs the base against the head's (A-77, Q-21).
# The head is the checkout itself. csh diff writes the rendering to the job summary and diff.json, diff.md and the
# head's report and gate decision to the artifact directory. The job reads only; it never fails on what the diff says.
# A base that cannot be had is shown as base-unavailable, never as an empty diff.
#
#   .github/scripts/diff-job.sh <component root> <base commit> <artifact directory>
set -euo pipefail
COMPONENT="${1:?usage: diff-job.sh <component root> <base commit> <artifact directory>}"
BASE="${2:?base commit}"
OUT="${3:?artifact directory}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
csh() { node "$REPO/packages/cli/bin/csh.js" "$@"; }
mkdir -p "$OUT"
# Absolute, since the base is installed and run from its own worktree.
OUT="$(cd "$OUT" && pwd)"

WT="$REPO/.csh-cache/diff-base"
rm -rf "$WT"
git -C "$REPO" worktree prune
base="unavailable:base-unavailable: no run of the merge base was made"
if git -C "$REPO" worktree add --detach --force "$WT" "$BASE" >/dev/null 2>&1; then
  if [ ! -f "$WT/$COMPONENT/csh/component.json" ]; then
    base="unavailable:base-unavailable: $COMPONENT has no csh/component.json at ${BASE:0:12}; the component did not exist yet"
  elif ! (cd "$WT" && pnpm install --frozen-lockfile >"$OUT/base-install.log" 2>&1); then
    base="unavailable:base-unavailable: the merge base's dependencies did not install (base-install.log)"
  else
    # The base's own csh, on the base's own component. A block in enforcing mode still stores the run.
    (cd "$WT" && node packages/cli/bin/csh.js run --root "$COMPONENT" >"$OUT/base-run.log" 2>&1) || true
    stored="$(ls -td "$WT/$COMPONENT"/.csh-cache/runs/*/ 2>/dev/null | head -1 || true)"
    if [ -n "$stored" ] && [ -f "$stored/run.json" ]; then base="$stored"; else base="unavailable:base-unavailable: the merge base did not run (base-run.log)"; fi
  fi
else
  base="unavailable:base-unavailable: the merge base ${BASE:0:12} could not be checked out"
fi

csh diff "$base" . --root "$COMPONENT" --out "$OUT"
head_run="$(ls -td "$COMPONENT"/.csh-cache/runs/*/ 2>/dev/null | head -1 || true)"
if [ -n "$head_run" ]; then cp "$head_run/report.json" "$head_run/gate.json" "$OUT/"; fi
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  { printf '## csh diff: %s\n\n```text\n' "$COMPONENT"; cat "$OUT/diff.md"; printf '```\n'; } >> "$GITHUB_STEP_SUMMARY"
fi
git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1 || rm -rf "$WT"
