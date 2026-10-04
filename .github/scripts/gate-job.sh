#!/usr/bin/env bash
# The CI gate job for one component (Next layers, section 3.2). It imports the public keys kept under csh/keys/ and
# always prints csh status. Until the component has a maintainers file nothing can be approved, so the job stops there
# and passes (rule 20). Once it has one, the job runs the component in enforcing mode and verifies the decision the run
# wrote: a block fails the job. Which key counts is decided by the maintainers file at the pinned root
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
if [ ! -f "$ROOT/csh/maintainers.json" ]; then
  printf 'gate job: %s has no csh/maintainers.json, so it is unprotected and nothing can block yet; passing (rule 20)\n' "$ROOT"
  exit 0
fi

csh run --root "$ROOT" --mode enforcing
csh gate --root "$ROOT" --verify reports/csh-gate.json
