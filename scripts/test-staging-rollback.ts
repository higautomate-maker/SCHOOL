import assert from "node:assert/strict";
import pg from "pg";
import { validateStagingEnvironment } from "../server/runtime/staging-environment.ts";

const { Client } = pg;
const staging = validateStagingEnvironment(process.env);
if (process.env.HIG_STAGING_ROLLBACK_CONFIRMATION !== "PREVIOUS_DEPLOYMENT_ACTIVE") {
  throw new Error(
    "Run only after manual Hostinger rollback and set HIG_STAGING_ROLLBACK_CONFIRMATION=PREVIOUS_DEPLOYMENT_ACTIVE",
  );
}

const baseUrl = staging.appUrl.toString().replace(/\/$/, "");
const health = await fetch(`${baseUrl}/api/v1/health`, { redirect: "manual" });
assert.equal(health.status, 200);
const unauthenticated = await fetch(`${baseUrl}/api/v1/schools`, {
  redirect: "manual",
});
assert.equal(unauthenticated.status, 401);

const client = new Client({
  connectionString: staging.databaseUrl.toString(),
  ssl: process.env.PG_SSL === "disable" ? false : { rejectUnauthorized: true },
});
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.platform_read', 'true', true)");
  const result = await client.query<{ tenants: number; migrations: number }>(
    `SELECT
       (SELECT count(*)::int FROM tenants) AS tenants,
       (SELECT count(*)::int FROM hig_schema_migrations) AS migrations`,
  );
  assert.ok((result.rows[0]?.tenants ?? 0) >= 2);
  assert.ok((result.rows[0]?.migrations ?? 0) > 0);
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
console.log(
  "Staging previous-deployment health, authentication denial, PostgreSQL persistence, and migration-state rollback checks passed.",
);
console.log(
  "PostgreSQL writes made after activation remain PostgreSQL-only and cannot be merged automatically into SQLite.",
);
