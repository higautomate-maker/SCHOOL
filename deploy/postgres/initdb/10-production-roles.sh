#!/bin/sh
set -eu

# Docker executes this only when the database volume is initialized empty.
# Passwords live only in .env.production.postgres, never in application env.
test "${POSTGRES_DB:-}" = hig_school_production
test "${POSTGRES_USER:-}" = postgres
test -n "${HIG_PRODUCTION_APP_PASSWORD:-}"
test -n "${HIG_PRODUCTION_OWNER_PASSWORD:-}"

psql -v ON_ERROR_STOP=1 --username postgres --dbname hig_school_production <<'SQL'
\getenv app_password HIG_PRODUCTION_APP_PASSWORD
\getenv owner_password HIG_PRODUCTION_OWNER_PASSWORD
CREATE ROLE hig_school_production_owner LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD :'owner_password';
CREATE ROLE hig_school_production_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD :'app_password';
ALTER DATABASE hig_school_production OWNER TO hig_school_production_owner;
GRANT CONNECT ON DATABASE hig_school_production TO hig_school_production_app;
GRANT USAGE ON SCHEMA public TO hig_school_production_app;
ALTER DEFAULT PRIVILEGES FOR ROLE hig_school_production_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hig_school_production_app;
ALTER DEFAULT PRIVILEGES FOR ROLE hig_school_production_owner IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO hig_school_production_app;
SQL
