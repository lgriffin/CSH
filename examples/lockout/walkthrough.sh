#!/usr/bin/env bash
# Reproduce docs/lockout-walkthrough.md: copy the example to a scratch repository and run every step.
# The copy lives under .csh-cache/ so that the specification resolves the csl package.
# Nothing is signed and nothing is approved.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$REPO/.csh-cache/walkthrough/lockout"
csh() { node "$REPO/packages/cli/bin/csh.js" "$@"; }
csl() { node "$REPO/packages/cli/bin/csl.js" "$@"; }
step() { printf '\n$ %s\n' "$*"; }

rm -rf "$WORK" && mkdir -p "$(dirname "$WORK")"
cp -r "$REPO/examples/lockout" "$WORK"
rm -rf "$WORK/countermeasures"
cd "$WORK"
printf 'reports/\n.csh-cache/\n' > .gitignore
git init -q -b main
git -c user.name=walkthrough -c user.email=walkthrough@example.invalid -c commit.gpgsign=false add -A
git -c user.name=walkthrough -c user.email=walkthrough@example.invalid -c commit.gpgsign=false commit -q -m "Lockout example"

step csl emit spec/lockout.csl.ts
csl emit spec/lockout.csl.ts

step "CSH_COMMIT=\$(git rev-parse HEAD) CSH_WITNESS_FILE=reports/witnesses.ndjson node --test test/lockout.test.ts"
CSH_COMMIT="$(git rev-parse HEAD)" CSH_WITNESS_FILE=reports/witnesses.ndjson node --test --test-reporter=spec test/lockout.test.ts 2>&1 | grep -E '^(✔|✖|ℹ (tests|pass|fail) )' | sed -E 's/ \([0-9.]+ms\)//'

step csh check
csh check

# Explain the joint conflict and the conflict that holds the off-by-one.
for id in $(node -e 'const r=require("./reports/csh-report.json");console.log(r.findings.filter(f=>f.kind==="joint-conflict"||f.members.some(m=>m.fragment.endsWith("/WitnessAllowsThreeFailures"))).map(f=>f.id).join(" "))'); do
  step csh explain "$id"
  csh explain "$id" || true
done

step csh gate
csh gate || true

# The countermeasures of the A3 (docs/lockout-a3.md, section 5), applied as one change.
printf '\n== After the countermeasures\n'
cp -r "$REPO/examples/lockout/countermeasures/." .
rm -rf reports
git -c user.name=walkthrough -c user.email=walkthrough@example.invalid -c commit.gpgsign=false add -A
git -c user.name=walkthrough -c user.email=walkthrough@example.invalid -c commit.gpgsign=false commit -q -m "Lockout countermeasures"

step git show --stat --format= HEAD
git show --stat --format= HEAD

step "CSH_COMMIT=\$(git rev-parse HEAD) CSH_WITNESS_FILE=reports/witnesses.ndjson node --test test/lockout.test.ts"
CSH_COMMIT="$(git rev-parse HEAD)" CSH_WITNESS_FILE=reports/witnesses.ndjson node --test --test-reporter=spec test/lockout.test.ts 2>&1 | grep -E '^(✔|✖|ℹ (tests|pass|fail) )' | sed -E 's/ \([0-9.]+ms\)//'

step csh check
csh check
