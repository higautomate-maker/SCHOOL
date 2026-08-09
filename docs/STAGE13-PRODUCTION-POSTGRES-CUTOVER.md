# Stage 13 — Production PostgreSQL cutover

Date: 2026-08-09

Status: **Production PostgreSQL provisioned and migrated; production Redis,
Hostinger candidate activation and private readiness acceptance remain pending.**

## Provisioned production resources

- Neon project: `hig-school-production` (`blue-dawn-27831797`)
- Cloud/region: AWS Singapore (`aws-ap-southeast-1`)
- PostgreSQL: 16
- Production branch: `production` (`br-shiny-bar-az21m26c`)
- Database: `hig_school_production`
- Migration role: `hig_school_production_owner`
- Runtime role: `hig_school_production_app`, created through SQL without
  `neon_superuser` membership and verified `NOSUPERUSER`, `NOBYPASSRLS`,
  `NOCREATEDB`, `NOCREATEROLE` and zero owned tables
- Pre-migration recovery branch: `stage13-pre-migration-20260809`
  (`br-restless-meadow-az04t737`)
- Reserved production hostname: `school.higaai.com`; DNS/public routing remains
  intentionally unconfigured until Stage 14
- Migration state: all 15 migrations through `0014_payment_foundation.sql`
  applied on 2026-08-09 with exact checksum verification
- Greenfield verification: zero tenants, users, plans and prohibited demo rows;
  51 RLS-enabled tables and 79 policies

## Confirmed production classification

This is a greenfield production repository. Hostinger currently contains only
the `staging-school` application. The isolated Neon production project listed
above now exists, but there is no legacy production SQLite business database to
import.

The Stage 13 path therefore creates an empty, isolated production PostgreSQL
database, applies migrations and verifies it remains empty. First-school
onboarding belongs to the controlled production launch workflow; demo seed data
is forbidden.

## Added production controls

- `.env.production.example`: runtime-only production configuration.
- `.env.production.operator.example`: migration-owner configuration and an
  explicit one-time cutover confirmation.
- `deploy/hostinger-production.compose.yml`: separate application, worker,
  operator, images, host port, logs, backups and Traefik router.
- `production:database-roles`: verifies separate runtime/migration identities,
  least privilege, production naming, target equality and no runtime ownership.
- `production:migrate`: refuses a nonempty target, requires explicit
  confirmation, applies ordered/checksummed migrations, verifies checksums and
  confirms no demo seed or business data exists.
- `stage13:test`: validates the deployment and migration safety contract.

## Required production resources

Resource checklist:

1. [x] Create a separate Neon project in the HIG Automation organization, in
   AWS Singapore.
2. [x] Create `hig_school_production` plus distinct
   `hig_school_production_owner` and `hig_school_production_app` roles.
3. [x] Grant the application role only required schema/table/sequence
   privileges and verify it is `NOSUPERUSER`, `NOBYPASSRLS` and owns no tables.
4. [ ] Create a production Redis allocation with TLS and authentication.
5. [x] Reserve `school.higaai.com`; configure DNS only after the candidate is
   healthy. Stage 14 controls public traffic and launch.
6. [ ] Store production secrets in protected environment files or the Hostinger
   secret manager; never put values in Git, chat, build arguments or images.

## Pre-migration procedure

Build images without starting application or worker:

```sh
export PRODUCTION_IMAGE_TAG=<approved-immutable-tag>
export PRODUCTION_HOSTNAME=<approved-production-hostname>
docker compose -f deploy/hostinger-production.compose.yml --profile operator build app worker operator
docker compose -f deploy/hostinger-production.compose.yml --profile operator run --rm operator npm run production:validate
docker compose -f deploy/hostinger-production.compose.yml --profile operator run --rm operator npm run production:database-roles
```

Create a Neon recovery branch or point-in-time recovery marker immediately
before migration. Because the target is greenfield, the pre-migration business
row count must be zero.

## Migration procedure

During the approved maintenance window with database, application and rollback
owners present:

```sh
docker compose -f deploy/hostinger-production.compose.yml --profile operator run --rm operator npm run production:migrate
docker compose -f deploy/hostinger-production.compose.yml --profile operator run --rm operator npm run db:pg:migrate:check
```

Remove `HIG_PRODUCTION_CUTOVER_APPROVED` immediately after the successful run.
Do not start public traffic during Stage 13.

## Candidate activation and verification

Start one internal candidate instance, keeping the production router disabled
or DNS unassigned until Stage 14:

1. Verify `/api/v1/health` and `/api/v1/readiness` return HTTP 200.
2. Verify the exact migration ledger/checksums and zero tenants/users/plans.
3. Verify runtime role protection, RLS, Redis and worker heartbeat.
4. Verify unauthenticated production APIs deny access and demo APIs are absent.
5. Run bounded load and restart persistence checks.
6. Preserve logs, command output, resource IDs and timings as Stage 13 evidence.

## Rollback

Before business onboarding, rollback is to stop the candidate and restore the
empty recovery branch. After any production write, do not discard or overwrite
the database: stop traffic, preserve evidence and use the reviewed recovery
procedure in `docs/INCIDENT-RESPONSE-AND-RECOVERY.md`.

Stage 13 closes only when the isolated production database, migrations,
readiness, roles, recovery point and internal candidate all pass. Stage 14 is a
separate authorization for DNS/public traffic, onboarding and launch.
