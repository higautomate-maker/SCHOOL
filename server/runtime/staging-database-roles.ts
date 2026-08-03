import pg from "pg";
import {
  validateStagingMigrationEnvironment,
  type StagingMigrationEnvironment,
} from "./staging-environment.ts";

const { Client } = pg;

type DatabaseRoleIdentity = {
  database: string;
  user: string;
  superuser: boolean;
  bypassRls: boolean;
  canLogin: boolean;
};

export type StagingDatabaseRoleValidation = {
  staging: StagingMigrationEnvironment;
  runtime: DatabaseRoleIdentity;
  migration: DatabaseRoleIdentity;
};

export async function validateStagingDatabaseRoles(
  environment: Record<string, string | undefined> = process.env,
): Promise<StagingDatabaseRoleValidation> {
  const staging = validateStagingMigrationEnvironment(environment);
  const ssl: false | { rejectUnauthorized: true } = environment.PG_SSL === "disable"
    ? false
    : { rejectUnauthorized: true };

  const [runtime, migration] = await Promise.all([
    inspectDatabaseRole(staging.databaseUrl, ssl),
    inspectDatabaseRole(staging.migrationDatabaseUrl, ssl),
  ]);

  if (runtime.database !== migration.database) {
    throw new Error("Runtime and migration roles resolved to different databases");
  }
  if (runtime.user === migration.user) {
    throw new Error("Runtime and migration connections resolved to the same database role");
  }
  if (runtime.superuser || runtime.bypassRls) {
    throw new Error("Runtime database role must be NOSUPERUSER and NOBYPASSRLS");
  }
  if (!runtime.canLogin || !migration.canLogin) {
    throw new Error("Runtime and migration database roles must both allow login");
  }

  const marker = staging.name.toLowerCase().replaceAll("_", "-");
  for (const [label, identity] of [
    ["Runtime", runtime],
    ["Migration", migration],
  ] as const) {
    const target = `${identity.database}/${identity.user}`
      .toLowerCase().replaceAll("_", "-");
    if (!target.includes(marker)) {
      throw new Error(`${label} PostgreSQL identity is not staging-scoped`);
    }
  }

  return { staging, runtime, migration };
}

async function inspectDatabaseRole(
  url: URL,
  ssl: false | { rejectUnauthorized: true },
): Promise<DatabaseRoleIdentity> {
  const client = new Client({ connectionString: url.toString(), ssl });
  await client.connect();
  try {
    const result = await client.query<{
      database: string;
      user: string;
      superuser: boolean;
      bypass_rls: boolean;
      can_login: boolean;
    }>(`
      SELECT
        current_database() AS database,
        current_user AS user,
        role.rolsuper AS superuser,
        role.rolbypassrls AS bypass_rls,
        role.rolcanlogin AS can_login
      FROM pg_roles AS role
      WHERE role.rolname = current_user
    `);
    const row = result.rows[0];
    if (!row) throw new Error("Unable to resolve the connected PostgreSQL role");
    return {
      database: row.database,
      user: row.user,
      superuser: row.superuser,
      bypassRls: row.bypass_rls,
      canLogin: row.can_login,
    };
  } finally {
    await client.end();
  }
}
