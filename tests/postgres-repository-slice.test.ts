import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repositoryPairs = [
  ["server/schools/management-repository.ts", "server/schools/management-postgres-repository.ts"],
  ["server/configuration/repository.ts", "server/configuration/postgres-repository.ts"],
  ["server/foundation/repository.ts", "server/foundation/postgres-repository.ts"],
  ["server/access/repository.ts", "server/access/postgres-repository.ts"],
  ["server/students/repository.ts", "server/students/postgres-repository.ts"],
  ["server/workspace/repository.ts", "server/workspace/postgres-repository.ts"],
  ["server/operations/repository.ts", "server/operations/postgres-repository.ts"],
] as const;

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("every migrated repository keeps SQLite and routes PostgreSQL explicitly", () => {
  for (const [sqlitePath, postgresPath] of repositoryPairs) {
    const sqlite = read(sqlitePath);
    const postgres = read(postgresPath);
    assert.match(sqlite, /repositoryBackend\(\)\s*===\s*"postgres"/, sqlitePath);
    assert.match(sqlite, /@db-runtime/, sqlitePath);
    assert.doesNotMatch(postgres, /@db-runtime/, postgresPath);
    assert.match(postgres, /withTenantDatabase\(/, postgresPath);
  }
});

test("migrated PostgreSQL queries retain explicit tenant predicates", () => {
  for (const [, postgresPath] of repositoryPairs) {
    const postgres = read(postgresPath);
    assert.match(
      postgres,
      /tenant_id = \$1|t\.id = \$1/,
      `${postgresPath} has no explicit tenant predicate`,
    );
  }
});

test("practical SQLite reads schedule PostgreSQL shadow comparisons", () => {
  for (const path of [
    "server/schools/management-repository.ts",
    "server/configuration/repository.ts",
    "server/foundation/repository.ts",
    "server/students/repository.ts",
    "server/workspace/repository.ts",
    "server/operations/repository.ts",
  ]) {
    assert.match(read(path), /schedulePostgresShadowRead\(/, path);
  }
});

test("live repository gate covers replay, rollback, and cross-tenant isolation", () => {
  const integration = read("scripts/test-postgres-repositories.ts");
  const management = read("server/schools/management-postgres-repository.ts");
  assert.match(integration, /performPostgresSchoolAction/);
  assert.match(integration, /action: "set_module"/);
  assert.match(integration, /typeof student\.dateOfBirth, "string"/);
  assert.match(integration, /typeof student\.admissionDate, "string"/);
  assert.match(integration, /findPostgresStudentReplay/);
  assert.match(integration, /intentional rollback/);
  assert.match(integration, /Cross-tenant write must fail/);
  assert.match(integration, /readCount: 0, writeCount: 0/);
  assert.match(integration, /stage4-attendance-create/);
  assert.match(integration, /stage4-payment-concurrent-a/);
  assert.match(integration, /stage4-school-create/);
  assert.match(integration, /stage4-school-rollback/);
  assert.match(
    management,
    /\$1::uuid, \$2::uuid, \$3::text, 'tenant', \$4::text/,
  );
  assert.doesNotMatch(management, /'tenant', \$1::text/);
});

test("financial operations use exact paise, row locking, replay, and outbox writes", () => {
  const operations = read("server/operations/postgres-repository.ts");
  assert.match(operations, /FOR UPDATE/);
  assert.match(operations, /\$5::bigint/);
  assert.match(operations, /attendance_date::text AS "attendanceDate"/);
  assert.match(operations, /due_date::text AS "dueDate"/);
  assert.match(operations, /paid_on::date::text AS "paidOn"/);
  assert.match(operations, /Number\.isSafeInteger/);
  assert.match(operations, /INSERT INTO outbox_events/);
  assert.match(operations, /INSERT INTO idempotency_records/);
  assert.match(operations, /pg_advisory_xact_lock/);
});

test("platform school creation uses only its dedicated transaction context", () => {
  const schools = read("server/schools/postgres-repository.ts");
  const runtime = read("server/runtime/postgres.ts");
  const rls = read("drizzle-postgres/0003_milky_juggernaut.sql");
  assert.match(schools, /withPlatformSchoolCreationDatabase/);
  assert.match(schools, /pg_advisory_xact_lock/);
  assert.match(schools, /findPostgresSchoolCreationReplay/);
  assert.match(runtime, /set_config\('app\.platform_create', 'true', true\)/);
  for (const table of [
    "tenants",
    "campuses",
    "subscriptions",
    "memberships",
    "module_policies",
    "school_invitations",
    "audit_events",
    "idempotency_records",
  ]) {
    assert.match(rls, new RegExp(`${table}_platform_create`));
  }
  assert.match(rls, /idempotency_key_uq/);
});

test("production repository backend remains SQLite by default", () => {
  assert.match(read(".env.example"), /^HIG_REPOSITORY_BACKEND=sqlite$/m);
  assert.match(
    read("server/runtime/repository-backend.ts"),
    /HIG_REPOSITORY_BACKEND \?\? "sqlite"/,
  );
});
