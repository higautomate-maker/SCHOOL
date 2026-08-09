import { spawnSync } from "node:child_process";
import pg from "pg";
import { validateProductionDatabaseRoles } from "../server/runtime/production-database-roles.ts";

const { Client } = pg;

try {
  if (process.env.HIG_PRODUCTION_CUTOVER_APPROVED !== "GREENFIELD_POSTGRES_CUTOVER") {
    throw new Error("Explicit greenfield production cutover confirmation is required");
  }

  const initial = await validateProductionDatabaseRoles(process.env);
  await assertGreenfieldTarget(initial.migrationDatabaseUrl);

  runMigration([], initial.migrationDatabaseUrl);
  runMigration(["--check"], initial.migrationDatabaseUrl);

  const verified = await validateProductionDatabaseRoles(process.env);
  const client = new Client({
    connectionString: verified.databaseUrl.toString(),
    ssl: { rejectUnauthorized: true },
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.platform_read', 'true', true)");
    const result = await client.query<{
      migrations: string;
      tenants: string;
      users: string;
      plans: string;
      demoTenants: string;
      demoUsers: string;
    }>(`
      SELECT
        (SELECT count(*)::text FROM hig_schema_migrations) AS migrations,
        (SELECT count(*)::text FROM tenants) AS tenants,
        (SELECT count(*)::text FROM users) AS users,
        (SELECT count(*)::text FROM plans) AS plans,
        (SELECT count(*)::text FROM tenants WHERE name = 'HIG Model School') AS "demoTenants",
        (SELECT count(*)::text FROM users WHERE email = 'company.demo@higschool.test') AS "demoUsers"
    `);
    const counts = result.rows[0];
    if (!counts || Number(counts.migrations) === 0) {
      throw new Error("Production PostgreSQL migration ledger is empty");
    }
    if (counts.demoTenants !== "0" || counts.demoUsers !== "0") {
      throw new Error("Production-prohibited demo seed data was detected");
    }
    if (counts.tenants !== "0" || counts.users !== "0" || counts.plans !== "0") {
      throw new Error("Greenfield production target is not empty after migration");
    }
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }

  console.log(
    "Production PostgreSQL migrations and checksums are current; roles are separated; target remains greenfield; no demo seed ran.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Production migration failed");
  process.exitCode = 1;
}

async function assertGreenfieldTarget(databaseUrl: URL): Promise<void> {
  const client = new Client({
    connectionString: databaseUrl.toString(),
    ssl: { rejectUnauthorized: true },
  });
  await client.connect();
  try {
    const schema = await client.query<{ tenants: string | null }>(
      "SELECT to_regclass('public.tenants')::text AS tenants",
    );
    if (!schema.rows[0]?.tenants) return;
    const result = await client.query<{
      tenants: string;
      users: string;
      plans: string;
    }>(`
      SELECT
        (SELECT count(*)::text FROM tenants) AS tenants,
        (SELECT count(*)::text FROM users) AS users,
        (SELECT count(*)::text FROM plans) AS plans
    `);
    const counts = result.rows[0];
    if (!counts || counts.tenants !== "0" || counts.users !== "0" || counts.plans !== "0") {
      throw new Error("Production migration refuses a nonempty target");
    }
  } finally {
    await client.end();
  }
}

function runMigration(arguments_: string[], migrationDatabaseUrl: URL): void {
  const result = spawnSync(
    process.execPath,
    ["scripts/migrate-postgres.mjs", ...arguments_],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        MIGRATION_DATABASE_URL: migrationDatabaseUrl.toString(),
      },
    },
  );
  if (result.status !== 0) {
    throw new Error(
      arguments_.includes("--check")
        ? "Production migration checksum verification failed"
        : "Production PostgreSQL migration failed",
    );
  }
}
