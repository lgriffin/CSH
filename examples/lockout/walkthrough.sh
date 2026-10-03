#!/usr/bin/env bash
# Reproduce docs/lockout-walkthrough.md: copy the example to a scratch repository, make each stage a commit, run it
# with csh run and record it as a stage of the A3 with csh a3 stage, then build the A3 with csh a3 build. The A3's
# committed output (examples/lockout/csh/a3/three-practices/a3.json, a3.md and a3.html) holds every count the
# walkthrough documents, so csh a3 build --check is the test: no step of this script decides anything itself.
# The copy lives under .csh-cache/ so that the specification resolves the csl package.
# The approval stage signs with a throwaway key made for this run only; it never touches your own keys.
#
#   examples/lockout/walkthrough.sh            run, and fail if the committed A3 differs from the built one
#   examples/lockout/walkthrough.sh --update   run, and copy the built A3 over the committed one
set -euo pipefail
UPDATE=0
[ "${1:-}" = "--update" ] && UPDATE=1
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$REPO/.csh-cache/walkthrough/lockout"
csh() { node "$REPO/packages/cli/bin/csh.js" "$@"; }
csl() { node "$REPO/packages/cli/bin/csl.js" "$@"; }
step() { printf '\n$ %s\n' "$*"; }
git_() { git -c user.name=walkthrough -c user.email=walkthrough@example.invalid -c commit.gpgsign=false "$@"; }
# csh run: the tdd practice's harness runs the tests (their output goes to stderr, trimmed here to the test lines),
# then check and gate. The run record is stored under .csh-cache/runs/, and the report and decision under reports/.
run() {
  local rc=0
  mkdir -p .csh-cache
  csh run "$@" > .csh-cache/run.out 2> .csh-cache/run.err || rc=$?
  grep -E '^(✔|✖|ℹ (tests|pass|fail) )' .csh-cache/run.err | sed -E 's/ \([0-9.]+ms\)//' || true
  grep -v -E "^(✔|✖|ℹ |▶|  |$)" .csh-cache/run.err >&2 || true
  cat .csh-cache/run.out
  return "$rc"
}
# Record the run of HEAD as a stage of the A3, and commit the record: a sheet must read correctly after its branches
# are gone (Anchor, harnesses and A3, section 5.7).
stage() {
  csh a3 stage three-practices "$1" --at HEAD >/dev/null
  git_ add csh/a3
  git_ commit -q -m "A3 stage $1"
}

rm -rf "$WORK" "$WORK.stages" && mkdir -p "$(dirname "$WORK")"
cp -r "$REPO/examples/lockout" "$WORK"
rm -rf "$WORK/countermeasures" "$WORK/model" "$WORK/regression" "$WORK/csh/a3/three-practices/stages"
cd "$WORK"
printf 'reports/\n.csh-cache/\n' > .gitignore
git init -q -b main
git_ add -A
git_ commit -q -m "Lockout example"

step csl emit spec/lockout.csl.ts
csl emit spec/lockout.csl.ts

step csh run
run

# Explain the joint conflict and the conflict that holds the off-by-one.
for id in $(node -e 'const r=require("./reports/csh-report.json");console.log(r.findings.filter(f=>f.kind==="joint-conflict"||f.members.some(m=>m.fragment.endsWith("/WitnessAllowsThreeFailedAttemptsBeforeLocking"))).map(f=>f.id).join(" "))'); do
  step csh explain "$id"
  csh explain "$id" || true
done

stage before

# The countermeasures of the A3 (docs/lockout-a3.md, section 5), applied as one change.
printf '\n== After the countermeasures\n'
cp -r "$REPO/examples/lockout/countermeasures/." .
rm -rf reports
git_ add -A
git_ commit -q -m "Lockout countermeasures"

step git show --stat --format= HEAD
git show --stat --format= HEAD

step csh run
run
stage countermeasures

# The countermeasures leave every rule candidate and unknown: nothing models the sign-in, and nobody has approved
# anything. A model of the agreed behaviour lets the solver check each rule; a signed approval makes them count.
printf '\n== A model, then approval\n'
cp -r "$REPO/examples/lockout/model/." .
rm -rf reports
git_ add -A
git_ commit -q -m "Model the sign-in"

step csl emit spec/lockout.csl.ts
csl emit spec/lockout.csl.ts

step csh run
run

# A throwaway OpenPGP key stands in for the owner's. In a real repository the key lives on a token the agent
# cannot reach (docs/spec/05-authority-and-ledger.md, section 1); here it exists for this run only.
GNUPGHOME="$(mktemp -d "${TMPDIR:-/tmp}/csh-walkthrough-gnupg.XXXXXX")"
export GNUPGHOME
trap 'gpgconf --kill gpg-agent >/dev/null 2>&1 || true; rm -rf "$GNUPGHOME"' EXIT
gpg --batch --quiet --pinentry-mode loopback --passphrase '' --quick-gen-key 'Owner (walkthrough only) <owner@example.invalid>' ed25519 sign never 2>/dev/null
FPR="$(gpg --with-colons --list-secret-keys 2>/dev/null | awk -F: '$1=="fpr"{print $10; exit}')"
git config gpg.format openpgp
signed() { git -c user.name=Owner -c user.email=owner@example.invalid -c user.signingkey="$FPR" commit -q -S "$@"; }

step "csh/maintainers.json: one person, Owner, with the throwaway key"
cat > csh/maintainers.json <<JSON
{ "schema": "csh-maintainers/v1", "identities": [ { "name": "Owner", "kind": "person", "keys": ["$FPR"], "roles": ["intent-owner", "domain-reviewer"] } ] }
JSON
git add csh/maintainers.json
signed -m "Maintainers"

approve() { csh approve "SignInService/$1" --actor Owner --rationale "$2" >/dev/null; printf '  approved %s\n' "$1"; }
step "csh approve <fragment> --actor Owner --rationale <why>, nine times"
approve StopPasswordGuessing/LockOnThirdFailure "LCK-001 as rewritten: the third failure locks."
approve StopPasswordGuessing/RefuseWhileLocked "LCK-002: a locked account refuses and does not count."
approve StopPasswordGuessing/AcceptCorrectPassword "LCK-003 as rewritten: only while unlocked."
approve StopPasswordGuessing/LockHasDuration "A lock always carries its fifteen minutes."
approve "#binding/Login.failures" "failedAttempts is the failure count."
approve "#binding/Login.locked" "locked is the lock flag."
approve "#binding/Login.lockSeconds" "lockSeconds is the lock duration in seconds."
approve "#binding/SignIn.args.passwordOk" "passwordOk says whether the password matched."
approve "#binding/SignIn.result" "result is the outcome of the sign-in."

step "git commit -S csh/ledger.ndjson   (the ledger alone, signed by Owner)"
git add csh/ledger.ndjson
signed -m "Approve the lockout rules and bindings"

step csh run --mode enforcing
run --mode enforcing
stage approved

# An agent later rereads "three failed attempts" as three allowed, and edits the code and its test together. The
# tests stay green. Its commit is unsigned and touches nothing the owner approved, so only the evidence changes.
printf '\n== A regression\n'
cp -r "$REPO/examples/lockout/regression/." .
rm -rf reports
git_ add -A
git_ commit -q -m "Simplify the lockout threshold"

step git show --stat --format= HEAD
git show --stat --format= HEAD

step csh run --mode enforcing
# The enforcing gate blocks here; the A3's committed counts say so, and csh a3 build --check holds the script to them.
run --mode enforcing || true
stage regression

# The A3 is built from the four stage records and the judgments in csh/a3/three-practices/judgments.json.
printf '\n== The A3\n'
if [ "$UPDATE" = 1 ]; then
  step csh a3 build three-practices
  csh a3 build three-practices
  for f in a3.json a3.md a3.html; do cp "csh/a3/three-practices/$f" "$REPO/examples/lockout/csh/a3/three-practices/$f"; done
else
  step csh a3 build three-practices --check
  csh a3 build three-practices --check
fi

step csh a3 verify three-practices
csh a3 verify three-practices 2>/dev/null
