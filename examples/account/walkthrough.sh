#!/usr/bin/env bash
# Reproduce docs/walkthrough.md: copy the example to a scratch repository and run every step.
# The copy lives under .csh-cache/ so that the specification resolves the csl package.
# Nothing is signed and nothing is approved: `csh approve` only drafts a ledger line.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$REPO/.csh-cache/walkthrough/account"
csh() { node "$REPO/packages/cli/bin/csh.js" "$@"; }
csl() { node "$REPO/packages/cli/bin/csl.js" "$@"; }
step() { printf '\n$ %s\n' "$*"; }

rm -rf "$WORK" && mkdir -p "$(dirname "$WORK")"
cp -r "$REPO/examples/account" "$WORK"
cd "$WORK"
printf 'reports/\n.csh-cache/\n' > .gitignore
git init -q -b main
git -c user.name=walkthrough -c user.email=walkthrough@example.invalid -c commit.gpgsign=false add -A
git -c user.name=walkthrough -c user.email=walkthrough@example.invalid -c commit.gpgsign=false commit -q -m "Account example"

step csl emit spec/account.csl.ts
csl emit spec/account.csl.ts

step "CSH_COMMIT=\$(git rev-parse HEAD) CSH_WITNESS_FILE=reports/witnesses.ndjson node --test test/account.test.ts"
CSH_COMMIT="$(git rev-parse HEAD)" CSH_WITNESS_FILE=reports/witnesses.ndjson node --test --test-reporter=spec test/account.test.ts 2>&1 | grep -E '^(✔|✖|ℹ (tests|pass|fail) )' | sed -E 's/ \([0-9.]+ms\)//'

step csh check
csh check

FIRST="$(node -e 'const r=require("./reports/csh-report.json");console.log(r.findings[0]?.id ?? "none")')"
step csh explain "$FIRST"
csh explain "$FIRST" || true

step csh gate
csh gate || true

step csh approve AccountService/ProtectFunds/MinimumBalance --actor Leigh --rationale "\"The floor protects customer funds.\""
csh approve AccountService/ProtectFunds/MinimumBalance --actor Leigh --rationale "The floor protects customer funds."

step git status --short
git status --short
