# Stage 3 PostgreSQL repository migration

Status: in progress — platform listing plus the tenant repository slice are implemented; production cutover remains disabled pending acceptance.

## Implemented slice

- `pg`/Drizzle Node PostgreSQL runtime with bounded pooling.
- Transaction-local tenant and platform-read RLS contexts.
- SELECT-only platform RLS policies for the school-list query.
- PostgreSQL school listing that preserves the existing `SchoolSummary` DTO.
- Stable cursor pagination ordered by `(created_at, id)`, with a maximum page size of 100.
- `GET /api/v1/schools?limit=50&cursor=...` returning `schools` and `nextCursor`.
- SQLite remains the default accepted Hostinger backend.
- Optional non-production shadow reads compare PostgreSQL and SQLite tenant identities.
- Explicit PostgreSQL cutover flag; it must remain disabled until every repository is ported.

## Runtime flags

```env
HIG_REPOSITORY_BACKEND=sqlite
HIG_POSTGRES_SHADOW_READS=false
```

For a controlled non-production comparison, configure `DATABASE_URL` and set
`HIG_POSTGRES_SHADOW_READS=true`. Do not set `HIG_REPOSITORY_BACKEND=postgres`
in production yet: only the first read-only repository slice has moved.

## Verification completed

- `npm run typecheck`
- `npm run lint`
- `npm test` — 98 tests, 64 active passed, 34 planned contracts
- `npm run build`
- `npm run build:hostinger`
- `npm run check:hostinger-bundle`

The remaining live gate is:

```bash
npm run test:integration:infra
```

It requires access to Docker and verifies fresh migrations, deterministic seeding,
tenant isolation, platform-read RLS, and Redis.

## Next slice

The following complete read/write repository families now have PostgreSQL
implementations behind the selector:

- school detail and Company school actions;
- school configuration and payment-gateway configuration;
- academic foundation, settings, classes, sections, and subjects;
- roles and role permissions;
- student listing, admission, and idempotent replay;
- cross-module workspace records and status changes.

All PostgreSQL operations use transaction-scoped tenant context and retain
explicit tenant predicates in addition to forced RLS. SQLite remains the default
and fallback. Practical SQLite reads can schedule non-blocking PostgreSQL shadow
comparisons; role listing is excluded because its existing contract may create
the default School Admin role.

The disposable integration gate now executes the repository implementations as
a non-superuser, non-`BYPASSRLS` application role. It validates reads, writes,
idempotent replay, rollback, and cross-tenant read/write isolation.

Operations/attendance/fees and the platform school-creation repository remain on
their prior migration status and are not part of this slice.
