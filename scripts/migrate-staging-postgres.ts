import { spawnSync } from "node:child_process";
import pg from "pg";
import { validateStagingEnvironment } from "../server/runtime/staging-environment.ts";

const { Client } = pg;

try {
  if (process.env.HIG_PRODUCTION_CUTOVER_APPROVED) {
    throw new Error(
      "Production cutover flags are not accepted by the staging migration command",
    );
  }
  const staging = validateStagingEnvironment(process.env);
  const client = new Client({
    connectionString: staging.databaseUrl.toString(),
    ssl: process.env.PG_SSL === "disable" ? false : { rejectUnauthorized: true },
  });
  await client.connect();
  try {
    const identity = await client.query<{
      database: string;
      user: string;
    }>(
      `SELECT current_database() AS database, current_user AS user`,
    );
    const target = `${identity.rows[0]?.database}/${identity.rows[0]?.user}`
      .toLowerCase().replaceAll("_", "-");
    if (!target.includes(staging.name.toLowerCase().replaceAll("_", "-"))) {
      throw new Error("Connected PostgreSQL identity is not staging-scoped");
    }
  } finally {
    await client.end();
  }

  runMigration([]);
  runMigration(["--check"]);

  const verification = new Client({
    connectionString: staging.databaseUrl.toString(),
    ssl: process.env.PG_SSL === "disable" ? false : { rejectUnauthorized: true },
  });
  await verification.connect();
  try {
    const result = await verification.query<{
      migrations: string;
      tenants: string;
      users: string;
      plans: string;
      demoTenants: string;
      demoUsers: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM hig_schema_migrations) AS migrations,
         (SELECT count(*)::text FROM tenants) AS tenants,
         (SELECT count(*)::text FROM users) AS users,
         (SELECT count(*)::text FROM plans) AS plans,
         (SELECT count(*)::text FROM tenants WHERE name = 'HIG Model School') AS "demoTenants",
         (SELECT count(*)::text FROM users WHERE email = 'company.demo@higschool.test') AS "demoUsers"`,
    );
    const counts = result.rows[0];
    if (!counts || Number(counts.migrations) === 0) {
      throw new Error("Staging PostgreSQL migration ledger is empty");
    }
    if (counts.demoTenants !== "0" || counts.demoUsers !== "0") {
      throw new Error("Production-prohibited demo seed data was detected");
    }
    if (
      staging.requireEmpty
      && (counts.tenants !== "0" || counts.users !== "0" || counts.plans !== "0")
    ) {
      throw new Error("Greenfield staging target is not empty");
    }
  } finally {
    await verification.end();
  }
  console.log(
    `Staging PostgreSQL migrations and checksums are current; no demo seed ran: ${staging.name}.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Staging migration failed");
  process.exitCode = 1;
}

function runMigration(arguments_: string[]): void {
  const result = spawnSync(
    process.execPath,
    ["scripts/migrate-postgres.mjs", ...arguments_],
    { stdio: "inherit", env: process.env },
  );
  if (result.status !== 0) {
    throw new Error(
      arguments_.includes("--check")
        ? "Staging migration checksum verification failed"
        : "Staging PostgreSQL migration failed",
    );
  }
}
