# Stage 5 PostgreSQL cutover preparation

Status: implemented and validated as cutover tooling only. PostgreSQL is **not**
enabled by this stage. `HIG_REPOSITORY_BACKEND=sqlite` remains the application
default and the Hostinger SQLite volume remains the rollback source.

## Scope and safety properties

Stage 5 adds:

- fail-fast, secret-safe production environment validation;
- ordered, checksummed, advisory-lock-protected PostgreSQL migrations;
- SQLite source validation, controlled import, and reconciliation reports;
- PostgreSQL backup archive validation and restore instructions;
- PostgreSQL/Redis/migration readiness checks with a stable public response;
- opt-in shadow-read counters that never retain compared records;
- a bounded concurrency test for reads, pooling, payment locking, and replay;
- an operational cutover and rollback procedure.

The migration command never runs `db/postgres/seed-demo.sql`. It refuses a
partially initialized database without the migration ledger, refuses a nonempty
target for data import, and runs every import write in one transaction.

## Prerequisites

- Node.js 22.13–22.x and the locked npm dependency set;
- PostgreSQL 17 with TLS, tested backups, sufficient free storage, and a
  migration owner separate from the least-privilege application role;
- the application role has table/sequence privileges but is `NOSUPERUSER
  NOBYPASSRLS`, and can read `hig_schema_migrations`;
- Redis 7.4 or compatible with TLS and authentication in production;
- `pg_dump`, `pg_restore`, `psql`, `sqlite3`, and Docker/Compose on the
  operator workstation;
- a recent read-only production SQLite copy and enough maintenance time for
  backup, import, reconciliation, smoke tests, and rollback;
- named application, database, security, and rollback approvers.

## Production configuration

Store these values in Hostinger's secret/environment manager. Do not commit
their values or paste them into logs.

| Variable | Production requirement |
| --- | --- |
| `HIG_REPOSITORY_BACKEND` | Keep `sqlite` until the approved activation step; then set `postgres` |
| `DATABASE_URL` | Managed PostgreSQL URL using a least-privilege application role |
| `PG_SSL` | `require` |
| `PG_POOL_MAX` | Start at `8`; allowed range is 1–20 |
| `PG_IDLE_TIMEOUT_MS` | Start at `30000` |
| `PG_CONNECTION_TIMEOUT_MS` | Start at `10000` |
| `APP_URL` | Public `https://` origin |
| `SESSION_SECRET` | At least 32 random bytes |
| `REDIS_URL` | Managed `rediss://` URL |
| `HIG_QUEUE_MODE` | `redis` |
| `HIG_KEY_PROVIDER` | `environment` |
| `HIG_ENCRYPTION_KEY` | At least 32 random bytes, supplied as a secret |
| `HIG_POSTGRES_SHADOW_READS` | `false` by default |
| `HIG_SQLITE_SOURCE_PATH` | Read-only source copy used only by migration tooling |

Validate configuration without printing values:

```sh
npm run validate:production
```

The application startup command runs this validation before starting. SQLite
startup remains compatible and does not require PostgreSQL variables unless
shadow reads are explicitly enabled.

## Identifier compatibility gate

The PostgreSQL schema uses UUIDs for durable identifiers. The dry run preserves
compatible IDs exactly and reports every incompatible source identifier as a
blocker. It does **not** silently remap an identifier because that could break
external references, idempotency responses, or audit history. A production
source with legacy identifiers such as `usr_*` or plan slugs is a no-go until an
approved deterministic mapping and external-reference plan is added.

Calendar-only fields are validated and retained as `YYYY-MM-DD`. Timestamps are
validated and retained as instants. Paise values must be nonnegative safe
integers. Enum/status, JSON, uniqueness, and SQLite foreign-key failures are
reported before any PostgreSQL write.

## Pre-cutover backup and restore rehearsal

First stop writes using Hostinger maintenance mode or the upstream reverse
proxy's maintenance response. Keep the existing application container stopped
after in-flight requests drain.

Create a protected SQLite backup:

```sh
umask 077
export CUTOVER_DIR="/data/cutover-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$CUTOVER_DIR"
sqlite3 "$HIG_DEMO_DB_PATH" ".backup '$CUTOVER_DIR/hig-school.sqlite'"
sqlite3 "$CUTOVER_DIR/hig-school.sqlite" "PRAGMA integrity_check; PRAGMA foreign_key_check;"
```

Create a PostgreSQL custom-format backup immediately before migration:

```sh
umask 077
export PG_BACKUP="$CUTOVER_DIR/postgresql-before-cutover.dump"
pg_dump --format=custom --no-owner --no-acl --file="$PG_BACKUP" "$DATABASE_URL"
npm run db:pg:backup:validate -- --file "$PG_BACKUP"
```

Restore only into a new rehearsal database, never over the source:

```sh
createdb "$RESTORE_DATABASE_URL"
pg_restore --exit-on-error --single-transaction --no-owner --no-acl \
  --dbname="$RESTORE_DATABASE_URL" "$PG_BACKUP"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "SELECT 'tenants' AS table_name, count(*) FROM tenants
   UNION ALL SELECT 'users', count(*) FROM users
   UNION ALL SELECT 'students', count(*) FROM students
   UNION ALL SELECT 'fee_invoices', count(*) FROM fee_invoices
   UNION ALL SELECT 'fee_payments', count(*) FROM fee_payments;"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "SELECT conname FROM pg_constraint WHERE contype = 'f' AND NOT convalidated;"
```

The last query must return zero rows. Retain encrypted backups according to the
company retention policy and delete rehearsal databases after approval.

## Ordered schema migration

Use a migration owner account only for this command:

```sh
npm run db:pg:migrate
npm run db:pg:migrate:check
```

Migrations run lexicographically from `drizzle-postgres/*.sql`, record SHA-256
checksums in `hig_schema_migrations`, use a PostgreSQL advisory lock, and wrap
each migration in a transaction. Re-running the command is safe. A changed
checksum, a failed migration, or an existing schema without a ledger stops the
cutover. Do not run the demo seed.

## SQLite-to-PostgreSQL dry run and controlled import

Run against the protected SQLite copy:

```sh
export HIG_SQLITE_SOURCE_PATH="$CUTOVER_DIR/hig-school.sqlite"
export HIG_MIGRATION_REPORT_PATH="$CUTOVER_DIR/migration-dry-run.json"
npm run db:migrate:dry-run
```

Review `blockers`, every table count, financial totals, and each tenant total.
The report is created with mode `0600`; keep it as deployment evidence. The
source database is opened read-only.

Only when blockers are empty, migrations are current, and the target business
tables are empty:

```sh
export HIG_MIGRATION_REPORT_PATH="$CUTOVER_DIR/migration-execute.json"
npm run db:migrate:execute
export HIG_RECONCILIATION_REPORT_PATH="$CUTOVER_DIR/reconciliation.json"
npm run db:reconcile
```

Reconciliation must have an empty `mismatches` array. It compares all migrated
table counts plus global and per-tenant student, attendance, invoice, payment,
outstanding-balance, subscription, role, and membership totals.

## Shadow observation

Shadow reads are off by default. In a controlled pre-production environment,
keep SQLite as primary and set:

```sh
HIG_REPOSITORY_BACKEND=sqlite
HIG_POSTGRES_SHADOW_READS=true
```

Practical read paths compare schools, school management, configuration,
foundation, students, operations, and workspace. Roles are excluded because the
legacy role reader may initialize defaults and is therefore not a pure read.
Metrics are counters per repository: comparisons, mismatches, and failures.
Logs contain only the repository label and outcome—never record bodies,
credentials, connection URLs, or exception messages.

Disable shadow reads immediately if they affect database capacity. Any mismatch
is a no-go until explained and reconciled.

## Readiness and load checks

`GET /api/v1/health` remains a liveness endpoint. `GET /api/v1/readiness` checks:

- production configuration, queue mode, and key-provider mode;
- PostgreSQL connectivity;
- exact migration-ledger state;
- Redis connectivity and authentication.

The public response only exposes `ready`/`not_ready` and stable generic checks.
It never returns URLs, credentials, SQL errors, Redis errors, or environment
values.

Run the bounded database check in pre-production:

```sh
PG_POOL_MAX=4 npm run test:load:postgres
```

It uses concurrency 4, verifies the pool stays bounded, exercises mixed reads,
attendance writes, invoice creation, repeated-key payment collection, and
competing payments against one invoice. It proves replay creates one payment
and one idempotency record, and row locking permits only one payment that would
otherwise overdraw the invoice.

## Current preparation results

The checked-in representative fixture covers every SQLite production table
except the outbox table, which does not exist in the current SQLite schema and
is correctly reported as zero. Its dry run completed without writes or
blockers. The fixture reconciliation criteria are:

- one tenant, user, plan, campus, session, class, section, subject, setting,
  configuration, subscription, membership, policy, role, permission, student,
  attendance record, invoice, payment, module record, invitation, audit event,
  and idempotency record;
- invoice total 100,000 paise, paid/payment total 40,000 paise, and outstanding
  total 60,000 paise;
- global totals exactly equal the single tenant's totals.

The unit/contract gate, both application builds, and the Hostinger
Cloudflare-runtime guard pass in the implementation environment. The disposable
PostgreSQL load, import/reconciliation, backup/restore, and Hostinger container
checks require an unrestricted local Docker socket. Their success messages are
listed in the acceptance handoff; do not approve cutover until they are
observed.

## Cutover procedure

Proceed only during an approved maintenance window with the database owner,
application owner, and rollback decision-maker present.

1. Confirm the standard test gates and Docker integration gates are green.
2. Confirm the restore rehearsal, backup validation, migration dry run, and
   reconciliation rehearsal are green.
3. Enable maintenance mode and drain application requests.
4. Create and integrity-check the final SQLite backup.
5. Create and validate the final PostgreSQL backup.
6. Run `npm run db:pg:migrate` and `npm run db:pg:migrate:check`.
7. Run the final SQLite dry run, controlled import, and reconciliation.
8. Validate readiness with PostgreSQL configuration while the public site stays
   in maintenance.
9. Set `HIG_REPOSITORY_BACKEND=postgres`, keep shadow reads off, and restart one
   application instance.
10. Confirm readiness, login, school list/detail, student list, attendance,
    invoice, payment replay, and parent-visible data.
11. Restore normal traffic gradually and observe the alerts below.
12. Preserve the frozen SQLite database and all reports until the rollback
    window expires.

No code in Stage 5 changes the backend automatically.

After the persistent Hostinger environment value is changed, the final
production activation command is:

```sh
npm run validate:production && npm run start
```

## Go/no-go checklist

Go only when every item is true:

- final SQLite integrity and foreign-key checks pass;
- all source identifiers pass UUID compatibility;
- dry-run blockers are empty;
- PostgreSQL migration state is current;
- Redis, queue mode, and key provider are ready;
- backup archive validation and restore rehearsal pass;
- target business tables are empty before import;
- reconciliation mismatches are empty;
- bounded load and payment replay checks pass;
- an operator has verified recent login and critical workflows;
- rollback owner, window, and communication channel are confirmed.

Any failed item is a no-go.

## Rollback criteria and exact response

Rollback during the approved window for any of:

- readiness remains unavailable for five minutes;
- authentication or tenant isolation fails once;
- any cross-tenant result is observed;
- reconciliation changes after activation;
- payment duplication, incorrect balance, or idempotency failure is observed;
- sustained database errors exceed 1% for five minutes;
- p95 database latency exceeds 1 second for ten minutes;
- connection pool waiting clients remain above zero for five minutes.

Rollback:

1. Re-enable maintenance mode and stop all PostgreSQL-backed application
   instances.
2. Preserve PostgreSQL logs and create a post-failure PostgreSQL backup.
3. Set `HIG_REPOSITORY_BACKEND=sqlite`.
4. Point `HIG_DEMO_DB_PATH` to the frozen, integrity-checked SQLite backup.
5. Restart one instance and verify health, login, tenant isolation, attendance,
   invoice totals, and parent-visible data.
6. Restore traffic gradually.
7. Do not merge data written after cutover without a separately reviewed
   reconciliation plan.

## Monitoring and alert guidance

Dashboard and alert on:

- readiness status and restart count;
- HTTP 5xx rate, login failures, and p50/p95/p99 latency;
- PostgreSQL connection count, pool total/idle/waiting, acquire timeout,
  transaction rollback, deadlock, lock wait, and slow-query rate;
- failed or pending schema migrations and migration checksum errors;
- RLS denials, missing tenant context, and any cross-tenant security signal;
- PostgreSQL CPU, memory, storage, IOPS, replication/backup age, and connection
  saturation;
- Redis availability, latency, memory, evictions, rejected connections, and
  queue depth/oldest age;
- outbox pending/failed counts and oldest pending age;
- idempotency conflict/replay rate;
- payment failure, duplicate-reference, and invoice-balance anomalies;
- shadow comparison mismatch/failure counters while shadowing is enabled.

Alerts must identify a tenant only by its internal ID and must not include
student data, payment payloads, access tokens, secrets, or database URLs.

## Remaining risks

- This is a greenfield deployment. No legacy production repository database
  exists, so the legacy migration procedure is retained as a safety tool but is
  not part of the deployment path.
- Managed PostgreSQL and Redis capacity, TLS trust, backup retention, and
  network latency must be verified in the actual Hostinger environment.
- The Docker acceptance gates must pass outside a restricted sandbox before
  go/no-go approval.
- Writes made after PostgreSQL activation cannot be merged back automatically
  into SQLite; rollback therefore requires the defined decision window.

## Repository status after Stage 5

All production `/api/v1/schools` repository families have PostgreSQL
implementations behind the selector. `server/demo-store.ts` remains
intentionally SQLite-only for the isolated sales-demo/mobile experience. The
Node SQLite adapter remains the Hostinger fallback and production default until
the explicit cutover step is approved.

## Stage 5 acceptance closure — 2026-07-30

Classification: **greenfield deployment**. There is no legacy production
repository database and therefore no legacy production data to migrate. The
only SQLite database discovered is `.data/hig-school-demo.sqlite`, which
contains the isolated `demo_state` store used by the sales-demo/mobile
experience. It is not a production repository source.

Legacy identifier findings, legacy-data migration, and legacy-data
reconciliation are **not applicable**. Zero findings from the demo-state file
must not be presented as evidence that production records were migrated.

Decision: **PENDING FINAL DOCKER RERUN.** The implementation and all
non-Docker gates pass, but this Codex task is currently denied access to the
local Docker socket. Stage 5 must not be marked complete until the updated
greenfield infrastructure and Hostinger Docker gates pass outside that
restriction. Do not begin Stage 6 and do not activate PostgreSQL.

### Greenfield acceptance path

`npm run test:integration:infra` now performs two deliberately separated
paths:

1. The existing deterministic demo-seeded database exercises regression,
   readiness, RLS, replay, locking, rollback, and load behavior. The seed is
   explicitly non-production.
2. A new `hig_school_greenfield_test` database starts completely empty. It
   applies every ordered migration, validates the migration ledger and SHA-256
   checksums, runs `--check`, verifies zero users/plans/tenants, and never runs
   `db/postgres/seed-demo.sql`.

The clean path creates an empty SQLite production-repository schema only to
prove zero-row source/import/reconciliation behavior. This is a greenfield
validation case, not a legacy production-data reconciliation.

It then uses the PostgreSQL repositories to:

- create the first school, administrator, plan, tenant, campus, subscription,
  membership, five module policies, invitation, audit, and idempotency record
  atomically;
- replay the same school-creation key without duplicate records;
- inject a final-step failure and verify tenant, administrator, plan, and all
  dependent onboarding writes roll back;
- create configuration, academic session, class, section, subject, role,
  permissions, student, attendance, invoice, payment, workspace, audit,
  outbox, and idempotency records;
- verify tenant isolation and forced RLS;
- preserve calendar dates as `YYYY-MM-DD`, timestamps as ISO instants, and
  exact integer paise;
- verify payment replay, row locking/concurrency through the existing load
  gate, and overpayment rejection.

Expected populated greenfield financial totals are deliberately non-round:

- invoice: 100,001 paise;
- paid invoice balance: 40,001 paise;
- payment total: 40,001 paise;
- outstanding: 60,000 paise.

The populated greenfield database is backed up in PostgreSQL custom format,
restored into `hig_school_restore_test`, and rechecked for tenant count, student
count, and the exact financial totals above. Docker Compose removes all
PostgreSQL and Redis containers and tmpfs-backed data in `finally`.

### Current verification evidence

- Typecheck: passed.
- Lint: passed; the existing large-page Babel styling note remains.
- Unit/contract tests: 113 total, 81 passed, 0 failed, 32 planned.
- Default build: passed.
- Hostinger build: passed.
- Hostinger Cloudflare-runtime guard: passed.
- Empty SQLite production-repository schema: 23 tables, integrity `ok`.
- Empty-source migration dry run: passed without writes.
- `git diff --check`: passed.
- Updated infrastructure Docker gate: pending because Docker socket access was
  denied by the current sandbox before containers could start.
- Updated Hostinger Docker gate: pending for the same environmental reason.

Run these outside the restricted task:

```sh
npm run test:integration:infra
npm run test:integration:hostinger
```

Stage 5 becomes **GO/COMPLETE** only after both commands exit zero and print
their expected greenfield and Hostinger success messages.

Production remains:

```env
HIG_REPOSITORY_BACKEND=sqlite
HIG_POSTGRES_SHADOW_READS=false
```
