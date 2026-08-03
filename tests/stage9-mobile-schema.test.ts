import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = [
  "drizzle-postgres/0008_mobile_identity_api.sql",
  "drizzle-postgres/0009_mobile_token_locators.sql",
  "drizzle-postgres/0010_mobile_app_completion.sql",
].map((path) => readFileSync(path, "utf8")).join("\n");

const contract = JSON.parse(
  readFileSync(
    "tests/contracts/mobile-auth.contract.json",
    "utf8",
  ),
) as {
  tables: Array<{
    name: string;
    tenantScoped: boolean;
    forceRls: boolean;
    authenticationServicePolicyRequired: boolean;
    purpose?: string;
  }>;
};

const journal = JSON.parse(
  readFileSync(
    "drizzle-postgres/meta/_journal.json",
    "utf8",
  ),
) as {
  entries: Array<{ idx: number; tag: string }>;
};

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("PostgreSQL migration journal includes Stage 9 migrations through 0010", () => {
  const finalEntry = journal.entries.at(-1);
  assert.deepEqual(
    { idx: finalEntry?.idx, tag: finalEntry?.tag },
    { idx: 10, tag: "0010_mobile_app_completion" },
  );
});

test("Stage 9 migrations create every contracted mobile table", () => {
  assert.deepEqual(
    contract.tables.map(({ name }) => name),
    [
      "mobile_identities",
      "mobile_identity_assignments",
      "mobile_sessions",
      "mobile_refresh_token_uses",
      "mobile_token_locators",
      "mobile_device_registrations",
      "mobile_transport_events",
    ],
  );

  for (const table of contract.tables) {
    assert.match(
      migration,
      new RegExp(`CREATE TABLE "${escaped(table.name)}"`),
    );
  }
});

test("every mobile table enables and forces row-level security", () => {
  for (const table of contract.tables) {
    assert.equal(table.forceRls, true);
    assert.match(
      migration,
      new RegExp(
        `ALTER TABLE "${escaped(table.name)}"\\s+ENABLE ROW LEVEL SECURITY`,
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `ALTER TABLE "${escaped(table.name)}"\\s+FORCE ROW LEVEL SECURITY`,
      ),
    );
  }

  for (const table of contract.tables.slice(0, 4)) {
    assert.equal(table.tenantScoped, true);
  }
  assert.equal(contract.tables.find(({ name }) => name === "mobile_token_locators")?.tenantScoped, false);
});

test("tenant mobile RLS requires service and exact tenant context", () => {
  assert.match(migration, /app_mobile_auth_service_enabled\(\)/);
  assert.match(
    migration,
    /current_setting\('app\.mobile_auth_service', true\)/,
  );

  for (const table of contract.tables) {
    assert.equal(table.authenticationServicePolicyRequired, true);
    assert.match(
      migration,
      new RegExp(
        `CREATE POLICY "${escaped(table.name)}_mobile_auth_service"`,
      ),
    );
  }

  for (const table of contract.tables.slice(0, 4)) {
    const marker = `CREATE POLICY "${table.name}_mobile_auth_service"`;
    const start = migration.indexOf(marker);
    assert.ok(start >= 0);
    assert.match(
      migration.slice(start, start + 650),
      /"tenant_id"\s*=\s*app_current_tenant_id\(\)/,
    );
  }

  const locatorMarker =
    'CREATE POLICY "mobile_token_locators_mobile_auth_service"';
  const locatorStart = migration.indexOf(locatorMarker);
  assert.ok(locatorStart >= 0);
  const locatorPolicy = migration.slice(
    locatorStart,
    locatorStart + 350,
  );
  assert.match(locatorPolicy, /app_mobile_auth_service_enabled\(\)/);
  assert.doesNotMatch(locatorPolicy, /app_current_tenant_id/);
});


test("mobile session revocation disables registered push devices", () => {
  assert.match(migration, /mobile_sessions_revoke_device_registrations/);
  assert.match(
    migration,
    /UPDATE "mobile_device_registrations"[\s\S]*"status" = 'revoked'/,
  );
});

test("mobile bearer and refresh tokens are persisted only as hashes", () => {
  assert.match(migration, /"access_token_hash" text NOT NULL/);
  assert.match(migration, /"refresh_token_hash" text NOT NULL/);
  assert.match(migration, /"token_hash" text (?:PRIMARY KEY )?NOT NULL/);
  assert.doesNotMatch(migration, /"access_token"\s+text/);
  assert.doesNotMatch(migration, /"refresh_token"\s+text/);
});

test("refresh rotation and replay evidence have database constraints", () => {
  assert.match(migration, /"refresh_family_id" uuid NOT NULL/);
  assert.match(
    migration,
    /"refresh_rotation" bigint DEFAULT 0 NOT NULL/,
  );
  assert.match(
    migration,
    /"replay_detected_at" timestamp with time zone/,
  );
  assert.match(migration, /UNIQUE \("session_id", "rotation"\)/);
  assert.match(migration, /UNIQUE \("token_hash"\)/);
  assert.match(migration, /Invalid mobile refresh-token rotation/);
  assert.match(
    migration,
    /Mobile access and refresh tokens must rotate together/,
  );
  assert.match(
    migration,
    /Mobile refresh metadata cannot change without token rotation/,
  );
});

test("mobile session mutations create atomic security audit events", () => {
  for (const action of [
    "mobile.auth.login.success",
    "mobile.auth.refresh.success",
    "mobile.auth.logout",
    "mobile.auth.session.revoked",
  ]) {
    assert.match(migration, new RegExp(action.replaceAll(".", "\\.")));
  }
  assert.match(
    migration,
    /CREATE TRIGGER "mobile_sessions_maintain_token_locators"/,
  );
});

test("School and persona sessions have separate relationship rules", () => {
  assert.match(
    migration,
    /"principal_type" = 'school'[\s\S]*"mobile_identity_id" IS NULL/,
  );
  assert.match(
    migration,
    /"principal_type" <> 'school'[\s\S]*"mobile_identity_id" IS NOT NULL/,
  );
  assert.match(migration, /Active School membership is required/);
  assert.match(migration, /Active mobile relationship is required/);
  assert.match(
    migration,
    /Mobile principal does not match the relationship/,
  );
});

test("Parent and Student assignments require same-tenant students", () => {
  assert.match(
    migration,
    /identity_audience IN \('parent', 'student'\)/,
  );
  assert.match(migration, /NEW\."resource_type" <> 'student'/);
  assert.match(
    migration,
    /FROM "students"[\s\S]*"tenant_id" = NEW\."tenant_id"[\s\S]*"id" = NEW\."resource_id"/,
  );
});

test("future transport resources remain fail-closed", () => {
  assert.match(
    migration,
    /Transport resource assignment is not enabled yet/,
  );
});

test("global token locator stores hashes only and cannot authorize by itself", () => {
  assert.match(migration, /CREATE TABLE "mobile_token_locators"/);
  assert.match(
    migration,
    /"token_hash" text PRIMARY KEY NOT NULL/,
  );
  assert.match(
    migration,
    /"token_kind" IN \('access', 'refresh'\)/,
  );
  assert.match(
    migration,
    /"state" IN \('active', 'used', 'revoked', 'expired'\)/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON "mobile_token_locators" FROM PUBLIC/,
  );
  assert.match(migration, /authoritative mobile session/i);
});

test("migration never disables or bypasses row-level security", () => {
  assert.doesNotMatch(migration, /DISABLE ROW LEVEL SECURITY/i);
  assert.doesNotMatch(migration, /BYPASSRLS/i);
  assert.doesNotMatch(migration, /SECURITY DEFINER/i);
});

test("migration remains additive to accepted browser authentication", () => {
  assert.doesNotMatch(migration, /ALTER TABLE "auth_sessions"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP TYPE|DROP POLICY/i);
  assert.doesNotMatch(migration, /\/api\/v1\/demo/);
});
