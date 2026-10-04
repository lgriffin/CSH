#!/usr/bin/env bash
# The CI gate job for one component (Next layers, section 3.2). It imports the public keys kept under csh/keys/ and
# always prints csh status. Until a maintainers file was ever committed (and no root is pinned) nothing can be approved,
# so the job stops there and passes (rule 20). Once one was, the root must be pinned and usable, and the job runs the
# component in enforcing mode and verifies the decision the run wrote: a block fails the job. Which key counts is decided by the maintainers file at the pinned root
# (CSH_ROOT_COMMIT), never by the key files, which anyone can replace.
#
#   .github/scripts/gate-job.sh <component root>
set -euo pipefail
ROOT="${1:?usage: gate-job.sh <component root>}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
csh() { node "$REPO/packages/cli/bin/csh.js" "$@"; }

# The public keys first, so that csh status reads the same signatures the run does.
shopt -s nullglob
for key in "$ROOT"/csh/keys/*.asc; do
  gpg --batch --quiet --import "$key"
done

csh status --root "$ROOT"
# Whether the component is protected is read from history and the pinned root, never from whether the file is in the
# working tree: a change that deletes csh/maintainers.json must not turn the job off.
root_kind="$(csh status --root "$ROOT" --json | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{const j=JSON.parse(s);process.stdout.write(`${j.root.kind}${j.root.problem!==undefined?" unusable":""}`)})')"
case "$root_kind" in
  none)
    printf 'gate job: %s never had a csh/maintainers.json and no root is pinned, so it is unprotected and nothing can block yet; passing (rule 20)\n' "$ROOT"
    exit 0 ;;
  "pinned unusable")
    printf 'gate job: CSH_ROOT_COMMIT is set but cannot be used (see csh status above); failing\n' >&2
    exit 1 ;;
  history)
    printf 'gate job: %s has a maintainers file in its history but CSH_ROOT_COMMIT is not set; pin the root before the gate can be trusted; failing\n' "$ROOT" >&2
    exit 1 ;;
esac

csh run --root "$ROOT" --mode enforcing
csh gate --root "$ROOT" --verify reports/csh-gate.json
