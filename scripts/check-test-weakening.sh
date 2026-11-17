#!/usr/bin/env bash
# Flags changes that make checks easier to pass.
# Usage: scripts/check-test-weakening.sh [base-ref]
# Hard failures (red): added skips, ts-ignore, eslint-disable, "|| true",
#   continue-on-error, --no-verify, always-true assertions.
# Warning only: a change that removes many more assertions than it adds.
set -euo pipefail

BASE="${1:-origin/main}"
RANGE="$BASE...HEAD"
if ! git rev-parse --verify -q "$BASE" >/dev/null; then
  echo "Base ref $BASE not found; skipping."
  exit 0
fi

HARD='(\.skip\(|\bxit\(|\bxdescribe\(|test\.todo|it\.todo|@ts-ignore|@ts-nocheck|eslint-disable|\|\| true|continue-on-error|--no-verify|assert\.ok\(true\)|expect\(true\)\.toBe\(true\))'

added="$(git diff --unified=0 "$RANGE" -- . ':(exclude)package-lock.json' ':(exclude)scripts/check-test-weakening.sh' \
  | grep -E '^\+[^+]' | grep -E "$HARD" || true)"

fail=0
if [ -n "$added" ]; then
  echo "FAIL: this change adds patterns that make checks easier to pass:"
  echo "$added" | sed 's/^/   /'
  echo
  echo "If this is genuinely intended, the owner must approve it explicitly (see AGENTS.md: stop-and-ask)."
  fail=1
fi

removed_asserts="$(git diff --unified=0 "$RANGE" -- 'tests' '*.test.*' | grep -E '^-[^-]' | grep -cE 'assert|expect\(' || true)"
added_asserts="$(git diff --unified=0 "$RANGE" -- 'tests' '*.test.*' | grep -E '^\+[^+]' | grep -cE 'assert|expect\(' || true)"
if [ "$removed_asserts" -gt $((added_asserts + 3)) ]; then
  echo "WARNING: $removed_asserts assertion lines removed vs $added_asserts added. Make sure checks were not weakened."
fi

if [ "$fail" -eq 0 ]; then
  echo "PASS: no check-weakening patterns added."
fi
exit "$fail"
