#!/usr/bin/env bash
# The npm package's install smoke test (stage 76, ADR-36): installs the packed package the three ways a stranger
# would, each in an empty directory outside the repository, and runs csh from each with no clone and no workspace.
#
#   .github/scripts/npm-smoke.sh <package.tgz> <expected-version>
set -euo pipefail
tgz=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
want=$2
repo=$(cd "$(dirname "$0")/../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# The footprint: the package itself stays small; what it installs is its registry dependencies.
bytes=$(wc -c < "$tgz")
echo "package: $(basename "$tgz"), $bytes bytes"
test "$bytes" -lt 3000000 || { echo "the package is over 3 MB" >&2; exit 1; }
tar -xzOf "$tgz" package/package.json > "$work/manifest.json"
node -e '
  const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (m.private) throw new Error("the package is private");
  for (const b of ["csh", "cshx", "csl", "csh-agent"]) if (!m.bin?.[b]) throw new Error(`no ${b} command`);
  if (m.version !== process.argv[2]) throw new Error(`version ${m.version}, wanted ${process.argv[2]}`);
' "$work/manifest.json" "$want"

# A subject: a small repository with prose, a diagram and Go code (fixture F160).
subject="$work/subject"
mkdir -p "$subject"
cp -r "$repo/fixtures/F160/inputs/subject/." "$subject"
git -C "$subject" init -q -b main
git -C "$subject" add -A
git -C "$subject" -c user.name=ci -c user.email=ci@example.invalid -c commit.gpgsign=false commit -qm "the subject"

check_reports() {
  for f in csh-analysis.json csh-analysis.html; do test -s "$1/$f" || { echo "missing $1/$f" >&2; exit 1; }; done
}

echo "== npm install --global"
prefix="$work/global"
npm install --global --prefix "$prefix" --no-audit --no-fund "$tgz" > /dev/null
PATH="$prefix/bin:$prefix:$PATH"
test "$(csh --version)" = "csh $want"
cshx help > /dev/null
csl --version > /dev/null
(cd "$work" && mkdir g && cd g && csh analyse "$subject" > out.txt && check_reports reports)

echo "== npm install into a project"
mkdir "$work/project" && cd "$work/project"
npm init -y > /dev/null
npm install --save-dev --no-audit --no-fund "$tgz" > /dev/null
npx csh analyse "$subject" --out local --json > analysis.json
node -e 'const a = JSON.parse(require("fs").readFileSync("analysis.json", "utf8")); if (a.schema !== "csh-analysis/v1") throw new Error(a.schema)'
check_reports local

echo "== npx with nothing installed"
mkdir "$work/once" && cd "$work/once"
npx --yes --package "$tgz" csh analyse "$subject" > /dev/null
check_reports reports
echo "the package installs and runs"
