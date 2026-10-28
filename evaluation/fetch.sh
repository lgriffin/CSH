#!/usr/bin/env bash
# Fetch one commit of a repository, and nothing else, into a directory (stage 79): usage fetch.sh <repo> <commit> <dir>.
# The analysis reads the checkout's origin remote and HEAD, so both are set as a clone would set them.
set -euo pipefail
repo="$1" commit="$2" dir="$3"
git init -q "$dir"
git -C "$dir" remote add origin "$repo"
for attempt in 1 2 3 4; do
  git -C "$dir" fetch -q --depth 1 origin "$commit" && break
  [ "$attempt" = 4 ] && exit 1
  sleep $((2 ** attempt))
done
git -C "$dir" checkout -q FETCH_HEAD
test "$(git -C "$dir" rev-parse HEAD)" = "$commit"
