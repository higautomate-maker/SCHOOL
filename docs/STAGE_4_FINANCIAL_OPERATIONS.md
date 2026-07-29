# Stage 4 PostgreSQL attendance, fees, and school onboarding

Status: implemented behind the repository selector; production cutover remains
disabled pending acceptance.

## Migrated operations

- Attendance reads plus atomic attendance creation and update.
- Fee invoice reads and atomic invoice creation.
- Fee payment reads and atomic payment collection.
- Invoice balance and status updates protected by `SELECT ... FOR UPDATE`.
- Transactional audit, outbox, and idempotency writes for each operation.
- Platform school creation across tenant, campus, subscription, membership,
  module entitlement, invitation, audit, and replay records.
- Platform school-creation replay lookup and concurrent-key serialization.

All tenant-owned operations use `withTenantDatabase`, forced PostgreSQL RLS, and
explicit tenant predicates. Platform onboarding uses the separate
`withPlatformSchoolCreationDatabase` context. The platform-create RLS policies
grant only the INSERT and replay SELECT access needed by onboarding; they do not
turn tenant operations into platform operations.

## Contract preservation

- PostgreSQL `date` values return the existing `YYYY-MM-DD` string contract.
- PostgreSQL timestamps return ISO strings.
- Money remains integer paise. Database `bigint` values are checked with
  `Number.isSafeInteger` before entering the existing API DTO.
- SQLite implementations remain available and are still selected by default.
- Existing callers may omit an operation idempotency header; the API generates
  a one-use key for backward compatibility. Current web clients send a key.

## Concurrency and failure behavior

- Advisory transaction locks serialize repeated idempotency keys.
- Repeated committed keys return their original stored response.
- Fee payments lock their invoice row before reading or updating the balance.
- Concurrent payments cannot overpay an invoice.
- Audit, outbox, balance, payment, and replay writes share one transaction.
- The disposable integration test injects a failure on the final onboarding
  replay write and confirms every earlier onboarding write is rolled back.

## Runtime flags

```env
HIG_REPOSITORY_BACKEND=sqlite
HIG_POSTGRES_SHADOW_READS=false
```

Do not enable PostgreSQL in production yet.

## Remaining SQLite-only repositories

No production `/api/v1/schools` repository family remains SQLite-only after
this slice. The SQLite implementations remain the required fallback and
production default. `server/demo-store.ts` remains intentionally SQLite-only
because it is the isolated sales-demo persistence engine, not a production
repository cutover target.

## Acceptance gates

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run build:hostinger
npm run check:hostinger-bundle
npm run test:integration:infra
npm run test:integration:hostinger
git diff --check
```
