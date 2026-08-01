# Stage 6 — Hostinger staging deployment and migration rehearsal

Status: **Hostinger staging acceptance passed; awaiting explicit Stage 6 acceptance**.

Production remains unchanged:

```env
HIG_REPOSITORY_BACKEND=sqlite
HIG_POSTGRES_SHADOW_READS=false
```

This runbook must never be used against the live application, live domain,
production PostgreSQL/Redis, or customer data. Stage 6 uses only synthetic
greenfield data.

## Implementation validation — 2026-07-30

The following checks passed in the isolated development workspace:

- `npm run typecheck`;
- `npm run lint` (with the existing large-file Babel notice);
- `npm test`: 117 tests, 86 passed, 0 failed, 31 planned;
- `npm run build`;
- `npm run build:hostinger`;
- `npm run check:hostinger-bundle`;
- `npm run staging:validate` with synthetic, loopback-only staging values;
- `git diff --check`.

The following live gates were attempted but could not start because this
workspace is not permitted to connect to the local Docker socket:

- `npm run test:integration:infra`;
- `npm run test:integration:hostinger`.

Consequently the standalone readiness and load commands have no live
`DATABASE_URL`/`REDIS_URL` in this workspace, and the new staging smoke,
isolation, load, backup/restore, restart-persistence, and rollback commands
remain pending on the dedicated staging resources. `npm run staging:audit`
was also attempted, but the npm advisory service was unreachable. These are
environmental blocks, not passing results. Those restrictions applied before
the dedicated VPS was available. The live acceptance closure below supersedes
this earlier pre-deployment status.

## Stage 6 acceptance closure — 2026-08-01

Stage 6 was rehearsed on a dedicated Hostinger VPS in India running Ubuntu
24.04 LTS, Docker 29.6.1, and Docker Compose 5.3.0. The host had 15 GiB usable
memory and a 193 GiB filesystem at verification time. The staging site was
`staging-school.higaai.com`; no production credentials or customer data were
used.

The accepted staging image was
`hig-school-staging-app:security-20260730-stage6`. After forced recreation and
a subsequent restart, the container reported `running` and `healthy`; both
`/api/v1/health` and `/api/v1/readiness` returned HTTP 200.

Verified live results:

- PostgreSQL migrations and checksums were current and no demo seed ran;
- synthetic greenfield initialization created the two-school rehearsal data;
- external identity headers were overwritten, demo routes returned 404, an
  unapproved mobile-data request was blocked, and an unauthenticated internal
  request returned 401;
- health, readiness, trusted-platform boundary, school APIs, business records,
  idempotency smoke, two-school isolation, forged-tenant rejection, RLS, role,
  module, read, and write checks passed;
- bounded PostgreSQL load, pool, replay, and payment-concurrency checks passed
  in 13,064.1 ms at approximately 2.6 operations per second, with pool maximum
  4, total 4, idle 4, and waiting 0;
- a PostgreSQL 16.14 custom archive restored into a separate database, with
  matching row, tenant, and exact integer-paise financial totals;
- previous-image rollback preserved PostgreSQL data and the migration ledger;
- dependency review reported zero production-reachable findings after
  compatibility-tested dependency updates;
- type checking and lint passed; 117 tests ran, 86 passed, 0 failed, and 31
  remained planned;
- the security candidate image build took 73.4 seconds;
- restart persistence and the final post-restart smoke test passed.

The temporary Stage 6 identity boundary remains intentionally limited:
Traefik restricts the public router to the operator IP, overwrites client
identity headers with a synthetic staging identity, and permits test injection
only on its internal trusted route. It is not the Stage 7 authentication
system, so staging must remain access-restricted.

Stage 6 recommendation: **GO for acceptance closure only**. Do not begin Stage
7 until Stage 6 is explicitly accepted. Production remains on SQLite with
PostgreSQL shadow reads disabled.

## Staging architecture and separation

Use a dedicated Hostinger VPS Docker project named `staging-school`, preferably
on a staging-only VPS or at minimum with separate resources:

- domain: a dedicated staging subdomain such as
  `staging-school.<owned-domain>`;
- Docker project and application container;
- PostgreSQL database and least-privilege `NOBYPASSRLS` application user whose
  database/user names contain `staging_school`;
- Redis instance, database, or provider allocation plus namespace
  `staging-school:`;
- session and encryption secrets unique to staging;
- named data, log, and backup volumes;
- restore database separate from active staging;
- staging-only logs and backups;
- no production credentials or customer data.

`deploy/hostinger-staging.compose.yml` builds:

- `app`: the public runtime image;
- `operator`: a non-public staging administration image with migrations,
  tests, `pg_dump`, and `pg_restore`.

Do not publish the operator service or expose its container port.

## What Hostinger currently documents

Hostinger documents Node.js 18, 20, 22, and 24 for its Node.js Web App product.
This project requires Node `>=22.13.0 <23`, so select Node 22. Hostinger
documents GitHub and ZIP deployment, environment-variable entry/import,
automatic builds on GitHub pushes, deployment logs, server-app restart, and
editable build/start settings:

- [Deploying a Node.js web app](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)
- [Adding Node.js environment variables](https://www.hostinger.com/support/how-to-add-environment-variables-during-node-js-application-deployment/)
- [Redeploying a Node.js application](https://www.hostinger.com/support/how-to-redeploy-a-node-js-application/)

For the required CLI migration, PostgreSQL backup/restore, separate volumes,
and multi-container control, the recommended Stage 6 target is Hostinger VPS
Docker Manager. Hostinger documents Compose-project deployment, container
terminal access, restart/update/stop/log actions, and Docker troubleshooting:

- [Deploying with Hostinger Docker Manager](https://www.hostinger.com/support/12040815-how-to-deploy-your-first-container-with-hostinger-docker-manager/)
- [Managing Docker projects](https://www.hostinger.com/support/hostinger-vps-how-to-manage-your-docker-projects/)
- [Docker Manager troubleshooting](https://www.hostinger.com/support/12040867-troubleshooting-common-docker-manager-issues/)

These documents do **not** prove that the selected account provides managed
PostgreSQL, Redis, persistent mounts, automatic deployment rollback, trusted
identity-header injection, particular connection limits, or a deployment
timeout. Confirm each item manually before approval.

## Hostinger settings

| Setting | Stage 6 value | Confirmation |
| --- | --- | --- |
| Runtime | Node 22 | Confirm available in selected product |
| Build | `npm ci && npm run build:hostinger && npm run check:hostinger-bundle` | Locally verified |
| Start | `npm run start -- --hostname 0.0.0.0 --port "$PORT"` | Locally verified |
| Container port | `3000`; sample host port `3100` | Confirm proxy/port mapping |
| Health | `/api/v1/health` | Required HTTP 200 |
| Readiness | `/api/v1/readiness` | Required HTTP 200 |
| Restart | `unless-stopped`; hPanel Restart | Confirm on account |
| PostgreSQL TLS | URL `sslmode=verify-full`; `PG_SSL=require` | Verified against staging provider |
| Redis TLS | `rediss://` | Confirm provider |
| Pool | start with `PG_POOL_MAX=8` | Confirm provider connection quota |
| Persistent storage | three staging-only named volumes | Confirm backup policy |
| Logs | Docker `local`, 10 MB × 5 files | Confirm collection/retention |
| Deployment timeout | unknown | Manual confirmation required |
| GitHub behavior | pushes can trigger automatic builds | Decide staging branch policy |
| Rollback | no documented automatic guarantee was assumed | Rehearse manually |

The app listens on `0.0.0.0` and consumes the platform-provided `PORT`.

## Environment variables

Start from `.env.staging.example`, replace every placeholder locally, save the
result as `.env.staging`, set mode `0600`, and never commit it.

Required groups:

- staging guard: `HIG_DEPLOYMENT_ENV`, `HIG_STAGING_NAME`,
  `HIG_STAGING_PROTECTION`, `HIG_STAGING_REQUIRE_EMPTY`;
- runtime: `NODE_ENV`, `HIG_RUNTIME`, `PORT`, `APP_URL`, `LOG_LEVEL`;
- PostgreSQL: `DATABASE_URL`, `PG_SSL`, `PG_POOL_MAX`,
  `PG_IDLE_TIMEOUT_MS`, `PG_CONNECTION_TIMEOUT_MS`;
- Redis/queue: `REDIS_URL`, `HIG_REDIS_NAMESPACE`, `HIG_QUEUE_MODE`;
- repository: `HIG_REPOSITORY_BACKEND=postgres`,
  `HIG_POSTGRES_SHADOW_READS=false`;
- keys/authentication: `SESSION_SECRET`, `HIG_KEY_PROVIDER`,
  `HIG_ENCRYPTION_KEY`;
- storage: `HIG_STAGING_STORAGE_PATH`, `HIG_STAGING_LOG_PATH`,
  `HIG_STAGING_BACKUP_PATH`;
- safety: `HIG_SALES_DEMO=false`;
- smoke only: `HIG_STAGING_SMOKE_AUTH_EMAIL`, using a synthetic
  `@higschool.test` address.
- bounded load only: `HIG_LOAD_TENANT_ID`, using the non-secret UUID of the
  synthetic primary staging tenant.

The staging validator rejects:

- a non-staging deployment marker;
- SQLite or shadow-read mode;
- shared session/encryption secrets;
- placeholder secrets;
- production/live-looking URLs;
- resources without the staging identifier;
- non-TLS remote PostgreSQL or Redis;
- production cutover flags.

It has no production bypass.

## Exact greenfield deployment workflow

Run from a protected operator workstation or Hostinger VPS project terminal:

```sh
cp .env.staging.example .env.staging
chmod 600 .env.staging
# Replace every placeholder and verify staging-only resource URLs.

docker compose -f deploy/hostinger-staging.compose.yml build
docker compose -f deploy/hostinger-staging.compose.yml \
  --profile operator run --rm operator npm run staging:validate
docker compose -f deploy/hostinger-staging.compose.yml \
  --profile operator run --rm operator npm run staging:migrate
docker compose -f deploy/hostinger-staging.compose.yml \
  --profile operator run --rm operator npm run staging:initialize
docker compose -f deploy/hostinger-staging.compose.yml up -d app
docker compose -f deploy/hostinger-staging.compose.yml ps
```

`staging:migrate`:

1. validates all staging variables;
2. queries the connected database/user and requires the staging identifier;
3. rejects every production-cutover flag;
4. applies ordered migrations under the existing advisory lock;
5. verifies checksums and migration ordering;
6. verifies known demo-seed records are absent;
7. requires zero users/plans/tenants while
   `HIG_STAGING_REQUIRE_EMPTY=true`.

No demo seed is invoked. After the first initialization succeeds, change
`HIG_STAGING_REQUIRE_EMPTY=false` for future staging-only migration checks.

Initialization creates two synthetic schools. The primary scenario includes
campus, plan, subscription, membership, module policies, invitation,
configuration, session, class, section, subject, default and custom roles,
permissions, student, attendance, invoice, partial payment, workspace, audits,
outbox events, and idempotency replay.

## Smoke and tenant isolation

The current application trusts authentication headers supplied by its upstream
identity boundary. Hostinger identity-header injection and stripping of
client-supplied copies are not documented. Before using authenticated smoke
tests, manually configure and verify a staging-only trusted proxy. This is a
temporary limitation; full authentication hardening remains Stage 7.

Staging itself uses `HIG_SALES_DEMO=false`; all `/api/v1/demo/*` routes return
404. Demo credentials are therefore not exposed.

After the trusted header boundary is confirmed:

```sh
docker compose -f deploy/hostinger-staging.compose.yml \
  --profile operator run --rm operator npm run staging:smoke
docker compose -f deploy/hostinger-staging.compose.yml \
  --profile operator run --rm operator npm run staging:isolation
```

The smoke command fails on the first unexpected HTTP result, prints no secret,
and checks health, readiness, unauthenticated denial, school list/detail,
configuration, foundation, roles, students, attendance, invoices, payments,
workspace, and idempotency replay.

The isolation command requires a non-superuser, `NOBYPASSRLS` application role
and verifies both directions between two tenants: tenant, student, role, and
module reads return zero; cross-tenant writes affect zero rows; forged IDs are
rejected; platform listing remains separate.

## Bounded load and concurrency

Set `HIG_LOAD_TENANT_ID` to the synthetic primary tenant, then run:

```sh
docker compose -f deploy/hostinger-staging.compose.yml \
  --profile operator run --rm operator npm run staging:load
```

The bounded profile uses concurrency 4 and performs:

- 24 school/student/detail/operations reads;
- 4 attendance writes;
- one invoice;
- 4 duplicate payment requests with one committed payment;
- 2 concurrent overpayment attempts with one expected success and one expected
  rejection.

It prints duration, approximate throughput, success/failure expectations, and
pool total/idle/waiting counts. It requires zero waiting connections at exit
and never exceeds pool maximum 4. This is not an unlimited load test.

## Backup and restore rehearsal

Create a second, empty PostgreSQL database whose database/user names include
`staging_school`. Obtain a temporary owner URL for the active staging database
and an owner URL for the empty restore database. Enter them only in the VPS
shell without echoing them, pass them only to the one-shot operator container,
and unset them immediately afterward. Never store either URL in Git or chat:

```sh
read -rsp "Active staging owner URL: " STAGING_BACKUP_DATABASE_URL; echo
read -rsp "Empty restore database owner URL: " STAGING_RESTORE_DATABASE_URL; echo
export STAGING_BACKUP_DATABASE_URL STAGING_RESTORE_DATABASE_URL
docker compose -f deploy/hostinger-staging.compose.yml \
  --profile operator run --rm \
  -e STAGING_BACKUP_DATABASE_URL \
  -e STAGING_RESTORE_DATABASE_URL \
  operator npm run staging:backup:restore
unset STAGING_BACKUP_DATABASE_URL STAGING_RESTORE_DATABASE_URL
```

The source owner URL must name the same active staging database as
`DATABASE_URL`; the application continues to use its restricted `NOBYPASSRLS`
role. The command refuses an active/non-empty restore target, creates a
custom-format archive, validates it with `pg_restore --list`, restores into the
separate database, and compares tenant/student/attendance/invoice/payment
counts and exact integer-paise invoice, paid, payment, and outstanding totals.
It never overwrites active staging.

Cleanup after evidence is retained:

```sh
# Drop only the separately named staging restore database using the provider's
# reviewed control plane or dropdb with STAGING_RESTORE_DATABASE_URL.
unset STAGING_BACKUP_DATABASE_URL STAGING_RESTORE_DATABASE_URL
```

Do not remove `staging_school_backups` until retention approval.

## Rollback rehearsal

Before deploying a new staging revision:

1. record the current commit/image tag and export the staging variable names
   without values;
2. create and validate the PostgreSQL backup;
3. keep PostgreSQL/Redis and all volumes unchanged;
4. deploy a uniquely tagged candidate image;
5. on failure, select/rebuild the previously recorded commit/image tag;
6. restore the previous environment-variable set if the candidate changed it;
7. restart only the app container;
8. verify health, unauthenticated denial, PostgreSQL tenant count, and
   migration ledger:

```sh
export HIG_STAGING_ROLLBACK_CONFIRMATION=PREVIOUS_DEPLOYMENT_ACTIVE
docker compose -f deploy/hostinger-staging.compose.yml \
  --profile operator run --rm \
  -e HIG_STAGING_ROLLBACK_CONFIRMATION \
  operator npm run staging:rollback:verify
unset HIG_STAGING_ROLLBACK_CONFIRMATION
```

PostgreSQL writes made after activation cannot be merged automatically into
SQLite. Application rollback must preserve the PostgreSQL database unless a
separately approved database-restore decision is made.

## Dependency audit review

Run:

```sh
npm run staging:audit
```

The command never performs an upgrade. It records package, severity, direct
status, production reachability, vulnerable range, advisory source,
`fixAvailable`, and a remediation recommendation in a mode-0600 JSON report.
It fails when a production-reachable high/critical finding exists.

The first VPS review identified production-reachable findings. Compatible
direct and transitive dependency updates were applied without `--force` or
`--legacy-peer-deps`, rebuilt, and validated. The final retained review
reported `findingCount: 0`, `productionReachable: 0`, and zero high or critical
findings. Future deployments must rerun this review; any new
production-reachable high/critical issue blocks deployment.

## Manual Hostinger confirmations

- selected product supports Node 22 and a long-running server process;
- separate staging subdomain and application exist;
- PostgreSQL and Redis are separate from production;
- PostgreSQL/Redis CA and TLS behavior;
- database connection quota supports pool 8 plus operator connections;
- Docker volumes persist across Update/Restart;
- log and backup retention;
- build/start/deployment timeouts;
- GitHub branch and automatic deployment policy;
- inbound port/reverse-proxy/firewall configuration;
- trusted proxy strips external `oai-authenticated-user-*` headers before
  injecting a verified staging identity;
- previous deployment selection/rebuild procedure;
- `pg_dump`/`pg_restore` availability in the operator image;
- restore database can be created/dropped separately.

## Go/no-go checklist

Stage 6 is GO only when:

- dedicated resources and manual confirmations are recorded;
- migration/initialization pass on empty staging;
- app health and readiness are 200;
- the trusted authentication boundary is confirmed;
- smoke, isolation, load, backup/restore, restart persistence, and rollback
  verification pass;
- dependency audit has no unreviewed production-reachable high/critical issue;
- no production credential/data was used;
- production remains SQLite and shadow reads remain false.

Until then, do not begin Stage 7 and do not deploy or modify production.

## Safe cleanup

```sh
# Stops staging containers but preserves named volumes.
docker compose -f deploy/hostinger-staging.compose.yml down

# Inspect before any later, separately approved volume deletion.
docker volume ls --filter name=staging_school
```

Never use `down -v` during rollback or evidence collection.
