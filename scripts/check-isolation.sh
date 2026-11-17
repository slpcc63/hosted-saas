#!/usr/bin/env bash
# Isolation build: proves an extension works with every OTHER extension deleted.
# Usage: scripts/check-isolation.sh <sentinel|cadence|closeout>
# This is the real test of "separated". It cannot be argued around: either the app
# still type-checks, tests and builds without the others, or it does not.
set -euo pipefail

APP="${1:?usage: scripts/check-isolation.sh <app-name>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

read_json() { node -e "const c=require('./extensions.json');$1"; }

APP_DIR="$(read_json "const a=c.apps['$APP'];if(!a){process.exit(2)}console.log(a.dir)")" \
  || { echo "Unknown app '$APP' (see extensions.json)"; exit 2; }
CORE_DIR="$(read_json "console.log(c.apps['$APP'].core)")"

if [ ! -d "$APP_DIR" ]; then
  echo "SKIPPED: $APP_DIR does not exist yet."
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
tar -C "$ROOT" --exclude=node_modules --exclude=.git --exclude=.next --exclude=.build -cf - . | tar -C "$TMP" -xf -
cd "$TMP"

# Delete the hub and every other extension (app + core).
REMOVE="$(read_json "
const out=[c.hub];
for (const [name,a] of Object.entries(c.apps)) if (name!=='$APP') out.push(a.dir,a.core);
console.log(out.join('\n'))")"
while IFS= read -r p; do
  if [ -n "$p" ] && [ -e "$p" ]; then
    echo "removing $p"
    rm -rf "$p"
  fi
done <<< "$REMOVE"

echo "--- install (workspaces shrink to what remains)"
if ! npm install --no-audit --no-fund --ignore-scripts >"$TMP/install.log" 2>&1; then
  echo "ISOLATION FAIL: $APP cannot even install without the other extensions."
  echo "That means it depends on something that was deleted (another extension or the hub)."
  echo "Look for the missing package name below; it is the hidden dependency:"
  grep -E "404|ENOENT|not in this registry|Could not resolve" "$TMP/install.log" | head -5 | sed 's/^/   /'
  exit 1
fi

run() { # run an npm script in a workspace if it defines it
  local ws="$1" script="$2"
  [ -d "$ws" ] || return 0
  echo "--- $script: $ws"
  npm run "$script" --workspace "$ws" --if-present
}

for step in typecheck test build; do
  run "$APP_DIR" "$step"
  run "$CORE_DIR" "$step"
done
echo "ISOLATION PASS: $APP built and tested without the hub or any other extension."
