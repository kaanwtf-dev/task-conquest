#!/usr/bin/env bash
# Everything that must pass before an update goes out (what GitHub's CI used to run on every push), then
# the zip to drop onto Netlify. Stops at the first failure, and then nothing is packaged.
# usage: scripts/release.sh [output dir]   (default: release/)
set -euo pipefail
cd "$(dirname "$0")/.."
out="${1:-release}"

echo "== 1/6 type-check: app";                     npx tsc -b
echo "== 2/6 type-check: reminders function";      npx tsc -p supabase/functions/reminders
echo "== 3/6 tests";                               npx vitest run
if [[ -n "${PGHOST:-}" ]]; then
  echo "== 4/6 database rules (local Postgres)";   bash supabase/test/run_rls_tests.sh
else
  echo "== 4/6 database rules: skipped (set PGHOST/PGPORT to a local Postgres to run them)"
fi
echo "== 5/6 build: app and reminders function"
unset BASE_PATH # Netlify serves the app at the site root
rm -rf dist
npm run build
npm run build:reminders
echo "== 6/6 package"
mkdir -p "$out"
rm -f "$out/task-conquest-netlify.zip"
(cd dist && zip -qr "../$out/task-conquest-netlify.zip" .)
cp dist-functions/reminders.ts "$out/reminders-function.ts"
echo "ready: $out/task-conquest-netlify.zip (drop its contents on Netlify) and $out/reminders-function.ts"
