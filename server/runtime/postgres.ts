import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import * as schema from "../../db/postgres/schema.ts";

const postgresEnvironmentSchema = z.object({
  DATABASE_URL: z.string().url().refine(
    (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
    "DATABASE_URL must use the postgresql:// or postgres:// protocol",
  ),
  PG_POOL_MAX: z.coerce.number().int().min(1).max(20).default(10),
  PG_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  PG_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
  PG_SSL: z.enum(["require", "disable"]).default("require"),
});

export type PostgresEnvironment = z.infer<typeof postgresEnvironmentSchema>;

export function readPostgresEnvironment(
  environment: Record<string, string | undefined> = process.env,
): PostgresEnvironment {
  return postgresEnvironmentSchema.parse(environment);
}

export type PostgresPoolOptions = {
  connectionString: string;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  ssl: false | { rejectUnauthorized: true };
  allowExitOnIdle: boolean;
};

export function postgresPoolOptions(environment: PostgresEnvironment): PostgresPoolOptions {
  return {
    connectionString: environment.DATABASE_URL,
    max: environment.PG_POOL_MAX,
    idleTimeoutMillis: environment.PG_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: environment.PG_CONNECTION_TIMEOUT_MS,
    ssl: environment.PG_SSL === "require" ? { rejectUnauthorized: true } : false,
    allowExitOnIdle: false,
  };
}

export type HigPostgresDatabase = NodePgDatabase<typeof schema>;

const poolKey = Symbol.for("hig-school.postgres-pool.v1");
type PostgresGlobal = typeof globalThis & { [poolKey]?: Pool };

export function getPostgresPool(
  environment: Record<string, string | undefined> = process.env,
): Pool {
  const target = globalThis as PostgresGlobal;
  if (target[poolKey]) return target[poolKey];
  target[poolKey] = new Pool(postgresPoolOptions(readPostgresEnvironment(environment)));
  target[poolKey].on("error", (error) => {
    console.error("Unexpected idle PostgreSQL client error", error.message);
  });
  return target[poolKey];
}

export function postgresDatabase(client: PoolClient): HigPostgresDatabase {
  return drizzle(client, { schema });
}

export interface TenantTransactionClient {
  query(text: string, values?: readonly unknown[]): Promise<unknown>;
  release(): void;
}

export interface TenantTransactionPool {
  connect(): Promise<TenantTransactionClient>;
}

async function inDatabaseTransaction<Result>(
  configure: (client: PoolClient) => Promise<void>,
  operation: (database: HigPostgresDatabase, client: PoolClient) => Promise<Result>,
): Promise<Result> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await configure(client);
    const result = await operation(postgresDatabase(client), client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function withTenantDatabase<Result>(
  tenantId: string,
  operation: (database: HigPostgresDatabase, client: PoolClient) => Promise<Result>,
): Promise<Result> {
  assertTenantUuid(tenantId);
  return inDatabaseTransaction(
    async (client) => {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    },
    operation,
  );
}

export function withPlatformReadDatabase<Result>(
  operation: (database: HigPostgresDatabase, client: PoolClient) => Promise<Result>,
): Promise<Result> {
  return inDatabaseTransaction(
    async (client) => {
      await client.query("SELECT set_config('app.platform_read', 'true', true)");
    },
    operation,
  );
}

export function withPlatformSchoolCreationDatabase<Result>(
  operation: (database: HigPostgresDatabase, client: PoolClient) => Promise<Result>,
): Promise<Result> {
  return inDatabaseTransaction(
    async (client) => {
      await client.query("SELECT set_config('app.platform_create', 'true', true)");
    },
    operation,
  );
}

function assertTenantUuid(tenantId: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new Error("tenantId must be a valid UUID");
  }
}

export async function withTenantTransaction<Result>(
  pool: TenantTransactionPool,
  tenantId: string,
  operation: (client: TenantTransactionClient) => Promise<Result>,
): Promise<Result> {
  assertTenantUuid(tenantId);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
