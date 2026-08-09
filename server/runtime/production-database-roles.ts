import pg from "pg";
import { z } from "zod";
import { validateProductionEnvironment } from "./production-environment.ts";

const { Client } = pg;

type DatabaseRoleIdentity = {
  database: string;
  user: string;
  superuser: boolean;
  bypassRls: boolean;
  canLogin: boolean;
  ownedTables: number;
};

export type ProductionDatabaseRoleValidation = {
  databaseUrl: URL;
  migrationDatabaseUrl: URL;
  runtime: DatabaseRoleIdentity;
  migration: DatabaseRoleIdentity;
};

const postgresUrl = z.string().url().refine(
  (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
  "must use postgresql:// or postgres://",
);

export async function validateProductionDatabaseRoles(
  environment: Record<string, string | undefined> = process.env,
): Promise<ProductionDatabaseRoleValidation> {
  if (!validateProductionEnvironment(environment)) {
    throw new Error("Production PostgreSQL backend must be enabled");
  }
  if (environment.NODE_ENV !== "production" || environment.HIG_DEPLOYMENT_ENV !== "production") {
    throw new Error("Production deployment markers are required");
  }
  if (environment.HIG_POSTGRES_SHADOW_READS !== "false") {
    throw new Error("Production PostgreSQL shadow reads must be disabled at cutover");
  }
  if (environment.HIG_SALES_DEMO !== "false") {
    throw new Error("Sales demo must be disabled in production");
  }

  const databaseUrl = new URL(postgresUrl.parse(environment.DATABASE_URL));
  const migrationDatabaseUrl = new URL(postgresUrl.parse(
    environment.MIGRATION_DATABASE_URL,
  ));
  assertSameDatabase(databaseUrl, migrationDatabaseUrl);

  const ssl: { rejectUnauthorized: true } = { rejectUnauthorized: true };
  const [runtime, migration] = await Promise.all([
    inspectDatabaseRole(databaseUrl, ssl),
    inspectDatabaseRole(migrationDatabaseUrl, ssl),
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
  if (runtime.ownedTables !== 0) {
    throw new Error("Runtime database role must not own application tables");
  }

  for (const [label, identity] of [
    ["Runtime", runtime],
    ["Migration", migration],
  ] as const) {
    const scope = `${identity.database}/${identity.user}`.toLowerCase();
    if (!/(^|[_-])(prod|production)([_-]|$)/.test(scope)) {
      throw new Error(`${label} PostgreSQL identity is not production-scoped`);
    }
    if (/(^|[_-])(staging|stage|test|demo)([_-]|$)/.test(scope)) {
      throw new Error(`${label} PostgreSQL identity is not production-isolated`);
    }
  }

  return { databaseUrl, migrationDatabaseUrl, runtime, migration };
}

function assertSameDatabase(runtime: URL, migration: URL): void {
  const runtimeHost = runtime.hostname.replace(/-pooler(?=\.)/, "");
  const migrationHost = migration.hostname.replace(/-pooler(?=\.)/, "");
  if (
    runtimeHost !== migrationHost
    || runtime.port !== migration.port
    || runtime.pathname !== migration.pathname
  ) {
    throw new Error("Runtime and migration URLs must target the same production database");
  }
}

async function inspectDatabaseRole(
  url: URL,
  ssl: { rejectUnauthorized: true },
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
      owned_tables: string;
    }>(`
      SELECT
        current_database() AS database,
        current_user AS user,
        role.rolsuper AS superuser,
        role.rolbypassrls AS bypass_rls,
        role.rolcanlogin AS can_login,
        (SELECT count(*)::text
           FROM pg_class AS relation
           JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND relation.relkind IN ('r', 'p')
            AND relation.relowner = role.oid) AS owned_tables
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
      ownedTables: Number(row.owned_tables),
    };
  } finally {
    await client.end();
  }
}
