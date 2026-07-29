# Stage 3 PostgreSQL repository migration

Status: in progress — sub-stage 1, platform school listing, is implemented and offline-verified.

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

Port tenant detail, configuration, foundation, and role reads. Each query must
retain an explicit tenant predicate in addition to RLS. Mutations remain on the
accepted SQLite adapter until their PostgreSQL transaction and idempotency
contracts are active.
