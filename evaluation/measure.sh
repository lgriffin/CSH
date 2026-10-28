#!/usr/bin/env bash
# Analyse a checkout cold and report the result, its time and its peak memory to the job summary (stage 79): usage
# measure.sh <dir> [csh analyse options]. Exits with csh analyse's status. Nothing is written into the checkout.
set -uo pipefail
dir="$1"
shift
summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
command -v /usr/bin/time > /dev/null || sudo apt-get install -y -qq time > /dev/null
before="$(git -C "$dir" status --porcelain --ignored)"
status=0
/usr/bin/time -v -o time.txt node packages/cli/bin/csh.js analyse "$dir" --out reports/analysis "$@" > analysis.txt || status=$?
seconds="$(sed -n 's/^\s*Elapsed (wall clock) time (h:mm:ss or m:ss): //p' time.txt)"
peak="$(sed -n 's/^\s*Maximum resident set size (kbytes): //p' time.txt)"
peak="${peak:-0}"
{
  echo "Time ${seconds}, peak memory $((peak / 1024)) MB, $(git -C "$dir" ls-files | wc -l) tracked files"
  echo
  echo '```'
  cat analysis.txt
  echo '```'
} >> "$summary"
cat analysis.txt
if [ "$before" != "$(git -C "$dir" status --porcelain --ignored)" ]; then echo "the analysis wrote into $dir"; exit 1; fi
exit "$status"
