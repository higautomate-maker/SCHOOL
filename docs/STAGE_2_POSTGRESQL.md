# Stage 2 PostgreSQL foundation

Status: implementation complete; `pg` 8.16.3 is installed and the Node PostgreSQL runtime is wired. The disposable Docker gate remains the required live-database acceptance check.

## Outcome

Stage 2 adds an independent PostgreSQL 17 schema and migration history while leaving the current D1 runtime untouched as the rollback path. The new foundation has:

- UUID primary keys;
- `date` for calendar dates and `timestamp with time zone` for instants;
- native booleans;
- `bigint` for paise amounts;
- `jsonb` for structured configuration, metadata, responses, and events;
- database enums and numeric/date checks;
- composite tenant-aware foreign keys for school-owned relationships;
- Company-controlled module entitlements in `module_policies`;
- School-controlled role permissions in `roles` and `role_permissions`;
- a transactional outbox for attendance, fee, notice, homework, and transport propagation;
- forced PostgreSQL row-level security on all tenant-owned tables;
- transaction-scoped tenant context through `set_config('app.tenant_id', ..., true)`;
- a deterministic, repeatable, non-production school seed.

Auth.js session, MFA recovery, login-attempt, consent, and device-token tables are intentionally deferred to the approved authentication design in Stage 6. This avoids freezing an authentication schema before its lifecycle is specified.

## Exact SQLite-to-PostgreSQL mapping

The legacy source remains `db/schema.ts`; the PostgreSQL target is `db/postgres/schema.ts`.

| SQLite table | PostgreSQL result | Material mapping |
|---|---|---|
| `tenants` | `tenants` | text ID → UUID; status → enum; timestamps → timestamptz |
| `campuses` | `campuses` | UUIDs; composite `(tenant_id,id)` identity for tenant-safe references |
| `academic_sessions` | `academic_sessions` | dates → native date; status → enum; end/start check |
| `school_classes` | `school_classes` | boolean → native boolean; tenant composite identity |
| `class_sections` | `class_sections` | tenant/class composite FK; positive capacity check |
| `subjects` | `subjects` | type → enum; boolean → native boolean |
| `users` | `users` | UUID; native boolean MFA flag; case-insensitive unique email index |
| `school_settings` | `school_settings` | timestamptz update instant; otherwise unchanged |
| `school_configurations` | `school_configurations` | `payload_json` text → `payload` jsonb |
| `memberships` | `memberships` | tenant/campus composite FK |
| `plans` | `plans` | paise integer → bigint; non-negative price checks |
| `subscriptions` | `subscriptions` | status → enum; period end → timestamptz |
| `module_policies` | `module_policies` | retained as Company → School entitlement source; configuration jsonb added |
| `audit_events` | `audit_events` | `metadata_json` text → `metadata` jsonb; event instant → timestamptz |
| `school_invitations` | `school_invitations` | status → enum; expiry/acceptance → timestamptz |
| `idempotency_records` | `idempotency_records` | key becomes tenant-scoped; request hash added; response text → jsonb |
| `roles` | `roles` | tenant composite identity; native boolean system flag |
| `role_permissions` | `role_permissions` | tenant ID added; tenant/role composite FK |
| `students` | `students` | calendar fields → date; status/gender → enums; tenant-safe campus/session FKs |
| `student_attendance` | `student_attendance` | date → native date; status → enum; tenant-safe student/session FKs |
| `fee_invoices` | `fee_invoices` | paise → bigint; due date → date; amount consistency check |
| `fee_payments` | `fee_payments` | paise → bigint; payment instant → timestamptz; positive amount check |
| `module_records` | `module_records` | dates → date; paise → bigint; metadata text → jsonb; status/priority → enums |
| none | `outbox_events` | approved transactional event propagation for linked web/mobile experiences |

## Authorization boundary

The data model enforces the approved order:

1. Company entitlement: `module_policies(tenant_id,module_key)`.
2. School role permission: `roles` and `role_permissions`.
3. Resource assignment: implemented by domain repositories/tables as those domains move in Stages 3–5.
4. Tenant containment: composite foreign keys plus RLS.

An enabled module never grants user access by itself. The application must still require role permission and resource assignment.

## Runtime boundary

`server/runtime/postgres.ts` validates `DATABASE_URL`, a per-task pool maximum of 1–20 connections (default 10), timeouts, and TLS mode.

It provides a bounded singleton `pg.Pool`, Drizzle's Node PostgreSQL adapter, tenant-scoped transactions, and platform read-only transactions. Every scoped operation sets its RLS context with transaction-local `set_config`, then commits or rolls back and releases its pooled client.

## Migration and verification

- PostgreSQL Drizzle config: `drizzle.postgres.config.ts`
- Clean baseline: `drizzle-postgres/0000_messy_blade.sql`
- RLS migration: `drizzle-postgres/0001_tenant_rls.sql`
- Non-production seed: `db/postgres/seed-demo.sql`
- Offline contracts: `tests/postgres-foundation.test.ts`
- Container gate: `scripts/test-integration-infra.mjs`

The container gate creates a fresh PostgreSQL 17 database, applies all ordered PostgreSQL migrations, applies the seed twice, creates a non-superuser application role, proves the selected tenant is visible, proves a different tenant is invisible, proves the platform reader can list tenants, and checks Redis.

Run `npm run test:integration:infra` on a Docker-enabled host. The Codex sandbox cannot access the workstation Docker socket, so this gate is also enforced in CI.
