import { spawnSync } from "node:child_process";
import pg from "pg";
import { validateStagingDatabaseRoles } from "../server/runtime/staging-database-roles.ts";

const { Client } = pg;

try {
  if (process.env.HIG_PRODUCTION_CUTOVER_APPROVED) {
    throw new Error(
      "Production cutover flags are not accepted by the staging migration command",
    );
  }

  const { staging } = await validateStagingDatabaseRoles(process.env);

  runMigration([], staging.migrationDatabaseUrl);
  runMigration(["--check"], staging.migrationDatabaseUrl);

  const verification = new Client({
    connectionString: staging.databaseUrl.toString(),
    ssl: process.env.PG_SSL === "disable" ? false : { rejectUnauthorized: true },
  });
  await verification.connect();
  try {
    await verification.query("BEGIN");
    await verification.query(
      "SELECT set_config('app.platform_read', 'true', true)",
    );
    const result = await verification.query<{
      migrations: string;
      tenants: string;
      users: string;
      plans: string;
      demoTenants: string;
      demoUsers: string;
      ownedTables: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM hig_schema_migrations) AS migrations,
         (SELECT count(*)::text FROM tenants) AS tenants,
         (SELECT count(*)::text FROM users) AS users,
         (SELECT count(*)::text FROM plans) AS plans,
         (SELECT count(*)::text FROM tenants WHERE name = 'HIG Model School') AS "demoTenants",
         (SELECT count(*)::text FROM users WHERE email = 'company.demo@higschool.test') AS "demoUsers",
         (SELECT count(*)::text
            FROM pg_class AS relation
            JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
           WHERE namespace.nspname = 'public'
             AND relation.relkind IN ('r', 'p')
             AND relation.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
         ) AS "ownedTables"`,
    );
    const counts = result.rows[0];
    if (!counts || Number(counts.migrations) === 0) {
      throw new Error("Staging PostgreSQL migration ledger is empty");
    }
    if (counts.demoTenants !== "0" || counts.demoUsers !== "0") {
      throw new Error("Production-prohibited demo seed data was detected");
    }
    if (counts.ownedTables !== "0") {
      throw new Error("Runtime database role must not own application tables");
    }
    if (
      staging.requireEmpty
      && (counts.tenants !== "0" || counts.users !== "0" || counts.plans !== "0")
    ) {
      throw new Error("Greenfield staging target is not empty");
    }
    await verification.query("ROLLBACK");
  } catch (error) {
    await verification.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await verification.end();
  }

  console.log(
    `Staging PostgreSQL migrations and checksums are current; runtime and migration roles are separate; no demo seed ran: ${staging.name}.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Staging migration failed");
  process.exitCode = 1;
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
        ? "Staging migration checksum verification failed"
        : "Staging PostgreSQL migration failed",
    );
  }
}
