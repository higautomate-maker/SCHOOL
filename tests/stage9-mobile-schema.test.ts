import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "drizzle-postgres/0008_mobile_identity_api.sql";

const migration = readFileSync(
  migrationPath,
  "utf8",
);

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
  }>;
};

const journal = JSON.parse(
  readFileSync(
    "drizzle-postgres/meta/_journal.json",
    "utf8",
  ),
) as {
  entries: Array<{
    idx: number;
    tag: string;
  }>;
};

function escaped(value: string): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
}

test("PostgreSQL migration journal includes Stage 9 migration 0008", () => {
  const finalEntry = journal.entries.at(-1);

  assert.deepEqual(
    {
      idx: finalEntry?.idx,
      tag: finalEntry?.tag,
    },
    {
      idx: 8,
      tag: "0008_mobile_identity_api",
    },
  );
});

test("Stage 9 migration creates every contracted mobile table", () => {
  assert.deepEqual(
    contract.tables.map(({ name }) => name),
    [
      "mobile_identities",
      "mobile_identity_assignments",
      "mobile_sessions",
      "mobile_refresh_token_uses",
    ],
  );

  for (const table of contract.tables) {
    assert.match(
      migration,
      new RegExp(
        `CREATE TABLE "${escaped(table.name)}"`,
      ),
    );
  }
});

test("every mobile table enables and forces row-level security", () => {
  for (const table of contract.tables) {
    assert.equal(table.tenantScoped, true);
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
});

test("mobile RLS requires both service and exact tenant context", () => {
  assert.match(
    migration,
    /app_mobile_auth_service_enabled\(\)/,
  );

  assert.match(
    migration,
    /current_setting\('app\.mobile_auth_service', true\)/,
  );

  for (const table of contract.tables) {
    assert.equal(
      table.authenticationServicePolicyRequired,
      true,
    );

    assert.match(
      migration,
      new RegExp(
        `CREATE POLICY "${escaped(table.name)}_mobile_auth_service"`,
      ),
    );
  }

  assert.match(
    migration,
    /"tenant_id"\s*=\s*app_current_tenant_id\(\)/,
  );
});

test("mobile bearer and refresh tokens are persisted only as hashes", () => {
  assert.match(
    migration,
    /"access_token_hash" text NOT NULL/,
  );

  assert.match(
    migration,
    /"refresh_token_hash" text NOT NULL/,
  );

  assert.match(
    migration,
    /"token_hash" text NOT NULL/,
  );

  assert.doesNotMatch(
    migration,
    /"access_token"\s+text/,
  );

  assert.doesNotMatch(
    migration,
    /"refresh_token"\s+text/,
  );
});

test("refresh rotation and replay evidence have database constraints", () => {
  assert.match(
    migration,
    /"refresh_family_id" uuid NOT NULL/,
  );

  assert.match(
    migration,
    /"refresh_rotation" bigint DEFAULT 0 NOT NULL/,
  );

  assert.match(
    migration,
    /"replay_detected_at" timestamp with time zone/,
  );

  assert.match(
    migration,
    /UNIQUE \("session_id", "rotation"\)/,
  );

  assert.match(
    migration,
    /UNIQUE \("token_hash"\)/,
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

  assert.match(
    migration,
    /Active School membership is required/,
  );

  assert.match(
    migration,
    /Active mobile relationship is required/,
  );

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

  assert.match(
    migration,
    /NEW\."resource_type" <> 'student'/,
  );

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

test("migration never disables or bypasses row-level security", () => {
  assert.doesNotMatch(
    migration,
    /DISABLE ROW LEVEL SECURITY/i,
  );

  assert.doesNotMatch(
    migration,
    /BYPASSRLS/i,
  );
});

test("migration remains additive to accepted browser authentication", () => {
  assert.doesNotMatch(
    migration,
    /ALTER TABLE "auth_sessions"/,
  );

  assert.doesNotMatch(
    migration,
    /DROP TABLE|DROP TYPE|DROP POLICY/i,
  );

  assert.doesNotMatch(
    migration,
    /\/api\/v1\/demo/,
  );
});
