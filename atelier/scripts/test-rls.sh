#!/usr/bin/env bash
# Row-level-security tests for the Atelier schema, against a real Postgres.
#
#   DATABASE_URL=postgresql://user:pass@localhost:5432/atelier_test bash scripts/test-rls.sh
#
# It RESETS the `atelier` and `auth` schemas of that database, installs the Supabase stub
# (supabase/tests/auth_stub.sql), applies every migration (filename order) twice (proving they can be re-run),
# then runs supabase/tests/rls.sql. Use a throwaway database: the connecting user must be
# able to create roles and SET ROLE (the postgres:16 CI service user is a superuser).
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set (point it at a throwaway Postgres database)." >&2
  exit 2
fi

psql_run() { psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }

# Refuse to wipe a database that does not look like a test database.
dbname="$(psql "$DATABASE_URL" -X -At -c 'select current_database()')"
case "$dbname" in
  *test*) ;;
  *)
    if [ "${ATELIER_RLS_ALLOW_RESET:-}" != "1" ]; then
      echo "Refusing to reset database '$dbname': its name must contain 'test' (or set ATELIER_RLS_ALLOW_RESET=1)." >&2
      exit 2
    fi
    ;;
esac

echo "== Resetting schemas in $dbname"
psql_run -c 'drop schema if exists atelier cascade; drop schema if exists auth cascade;'

echo "== Installing the Supabase stub"
psql_run -f supabase/tests/auth_stub.sql

# Every migration, in filename order (0001, 0002, ...), twice: each must be re-runnable.
migrations=()
while IFS= read -r f; do migrations+=("$f"); done < <(printf '%s\n' supabase/migrations/*.sql | LC_ALL=C sort)
if [ "${#migrations[@]}" -eq 0 ]; then
  echo "No migrations found in supabase/migrations." >&2
  exit 2
fi
for pass in 1 2; do
  for f in "${migrations[@]}"; do
    echo "== Applying $f (pass $pass)"
    psql_run -f "$f"
  done
done

echo "== Running supabase/tests/rls.sql"
psql_run -f supabase/tests/rls.sql
