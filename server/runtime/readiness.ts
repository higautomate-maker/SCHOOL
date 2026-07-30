import { getPostgresPool } from "./postgres.ts";
import { POSTGRES_MIGRATION_NAMES } from "./postgres-migrations.ts";
import {
  sanitizedConfigurationError,
  validateProductionEnvironment,
} from "./production-environment.ts";
import { repositoryBackend } from "./repository-backend.ts";
import { pingRedis } from "./redis.ts";

export type ReadinessResult = {
  ready: boolean;
  internalReason?: "configuration" | "postgres" | "redis" | "migration";
};

export type ReadinessDependencies = {
  postgres?: () => Promise<void>;
  redis?: (url: string) => Promise<void>;
  migrations?: () => Promise<void>;
};

export async function evaluateReadiness(
  environment: Record<string, string | undefined> = process.env,
  dependencies: ReadinessDependencies = {},
): Promise<ReadinessResult> {
  if (repositoryBackend(environment) === "sqlite") return { ready: true };
  let configuration;
  try {
    configuration = validateProductionEnvironment(environment);
  } catch (error) {
    void sanitizedConfigurationError(error);
    return { ready: false, internalReason: "configuration" };
  }
  if (!configuration) return { ready: false, internalReason: "configuration" };

  try {
    await (dependencies.postgres ?? checkPostgres)();
  } catch {
    return { ready: false, internalReason: "postgres" };
  }
  try {
    await (dependencies.migrations ?? checkMigrationState)();
  } catch {
    return { ready: false, internalReason: "migration" };
  }
  try {
    await (dependencies.redis ?? pingRedis)(configuration.redisUrl);
  } catch {
    return { ready: false, internalReason: "redis" };
  }
  return { ready: true };
}

export function publicReadinessBody(ready: boolean, now = new Date()) {
  return {
    status: ready ? "ready" : "not_ready",
    checks: {
      application: ready ? "ok" : "error",
      tenantGuard: ready ? "ok" : "error",
    },
    timestamp: now.toISOString(),
  };
}

async function checkPostgres(): Promise<void> {
  await getPostgresPool().query("SELECT 1");
}

async function checkMigrationState(): Promise<void> {
  const expected = [...POSTGRES_MIGRATION_NAMES];
  const result = await getPostgresPool().query<{ migration_name: string }>(
    `SELECT migration_name
     FROM hig_schema_migrations
     ORDER BY migration_name`,
  );
  const applied = result.rows.map((row) => row.migration_name);
  if (JSON.stringify(applied) !== JSON.stringify(expected)) {
    throw new Error("PostgreSQL migration state is not current");
  }
}
