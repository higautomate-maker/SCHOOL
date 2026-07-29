import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  postgresPoolOptions,
  readPostgresEnvironment,
  type TenantTransactionClient,
  withTenantTransaction,
} from "../server/runtime/postgres.ts";

const baseline = readFileSync(new URL("../drizzle-postgres/0000_messy_blade.sql", import.meta.url), "utf8");
const rls = readFileSync(new URL("../drizzle-postgres/0001_tenant_rls.sql", import.meta.url), "utf8");
const seed = readFileSync(new URL("../db/postgres/seed-demo.sql", import.meta.url), "utf8");

test("PostgreSQL baseline uses native durable types", () => {
  assert.match(baseline, /timestamp with time zone/i);
  assert.match(baseline, /jsonb/i);
  assert.match(baseline, /bigint/i);
  assert.match(baseline, /boolean/i);
  assert.match(baseline, /date NOT NULL/i);
  assert.doesNotMatch(baseline, /payload_json|metadata_json|response_json/);
});

test("PostgreSQL baseline has no duplicate-column tenant unique constraint", () => {
  assert.doesNotMatch(baseline, /tenants_tenant_id_uq/);
  assert.doesNotMatch(baseline, /UNIQUE\("id","id"\)/);
});

test("every tenant-owned table has forced RLS and an isolation policy", () => {
  const tables = [
    "tenants", "campuses", "academic_sessions", "school_classes", "class_sections",
    "subjects", "school_settings", "school_configurations", "memberships", "subscriptions",
    "module_policies", "audit_events", "school_invitations", "idempotency_records", "roles",
    "role_permissions", "students", "student_attendance", "fee_invoices", "fee_payments",
    "module_records", "outbox_events",
  ];

  for (const table of tables) {
    assert.match(rls, new RegExp(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`));
    assert.match(rls, new RegExp(`CREATE POLICY "${table}_isolation"`));
  }
  assert.match(rls, /current_setting\('app\.tenant_id', true\)/);
});

test("PostgreSQL environment is validated and pool size is bounded", () => {
  const environment = readPostgresEnvironment({
    DATABASE_URL: "postgresql://app:secret@db.internal:5432/hig",
    PG_POOL_MAX: "12",
    PG_SSL: "require",
  });
  assert.deepEqual(postgresPoolOptions(environment), {
    connectionString: environment.DATABASE_URL,
    max: 12,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: true },
    allowExitOnIdle: false,
  });
  assert.throws(() => readPostgresEnvironment({
    DATABASE_URL: "https://not-a-database.example",
    PG_POOL_MAX: "100",
  }));
});

test("tenant context is transaction-scoped and commits", async () => {
  const calls: Array<[string, readonly unknown[] | undefined]> = [];
  let released = false;
  const client: TenantTransactionClient = {
    async query(text, values) {
      calls.push([text, values]);
      return undefined;
    },
    release() {
      released = true;
    },
  };

  const result = await withTenantTransaction(
    { async connect() { return client; } },
    "30000000-0000-4000-8000-000000000001",
    async (transaction) => {
      await transaction.query("SELECT * FROM students");
      return "done";
    },
  );

  assert.equal(result, "done");
  assert.deepEqual(calls.map(([query]) => query), [
    "BEGIN",
    "SELECT set_config('app.tenant_id', $1, true)",
    "SELECT * FROM students",
    "COMMIT",
  ]);
  assert.equal(released, true);
});

test("tenant transaction rolls back and releases on failure", async () => {
  const calls: string[] = [];
  let released = false;
  const client: TenantTransactionClient = {
    async query(text) {
      calls.push(text);
      return undefined;
    },
    release() {
      released = true;
    },
  };

  await assert.rejects(() => withTenantTransaction(
    { async connect() { return client; } },
    "30000000-0000-4000-8000-000000000001",
    async () => {
      throw new Error("failure");
    },
  ), /failure/);

  assert.equal(calls.at(-1), "ROLLBACK");
  assert.equal(released, true);
});

test("demo seed is deterministic and explicitly non-production", () => {
  assert.match(seed, /Never run against a production database/);
  assert.match(seed, /HIG Model School/);
  assert.match(seed, /company\.demo@higschool\.test/);
  assert.match(seed, /teacher\.demo@higschool\.test/);
  assert.match(seed, /parent\.demo@higschool\.test/);
  assert.match(seed, /set_config\('app\.tenant_id'/);
});
