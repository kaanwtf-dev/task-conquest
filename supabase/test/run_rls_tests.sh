#!/usr/bin/env bash
# Runs schema.sql twice (idempotency) against a throwaway local Postgres with a Supabase stub,
# then the RLS test suite. Usage: PGHOST=/tmp/pgq PGPORT=5544 supabase/test/run_rls_tests.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
db="questlog_rls_$$"
export PGUSER="${PGUSER:-postgres}"
psql -q -v ON_ERROR_STOP=1 -d postgres -c "create database $db"
trap 'psql -q -d postgres -c "drop database if exists $db" >/dev/null 2>&1 || true' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/supabase_stub.sql"
psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/../schema.sql"
psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/../schema.sql"   # must be re-runnable
if [ -f "$here/rls_test.sql" ]; then
  psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/rls_test.sql"
fi
echo "RLS OK"
