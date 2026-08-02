import { z } from "zod";
import { readPostgresEnvironment } from "./postgres-environment.ts";

const stagingName = z.string().regex(
  /^[a-z][a-z0-9-]{2,39}$/,
  "must be a lowercase staging identifier",
);
const protectedPath = z.string().min(4);
const secret = z.string().min(32).refine(
  (value) => !/replace|change-me|example|placeholder/i.test(value),
  "must not be a placeholder",
);
const postgresConnectionUrl = z.string().url().refine(
  (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
  "must use the postgresql:// or postgres:// protocol",
).refine(
  (value) => {
    const url = new URL(value);
    return Boolean(url.username && url.password);
  },
  "must include a database username and password",
).refine(
  (value) => {
    const url = new URL(value);
    return !/replace|change-me|example|placeholder/i.test(
      `${url.username}:${url.password}`,
    );
  },
  "must not contain placeholder credentials",
);

export type StagingEnvironment = {
  name: string;
  appUrl: URL;
  databaseUrl: URL;
  redisUrl: URL;
  redisNamespace: string;
  storagePath: string;
  logPath: string;
  backupPath: string;
  requireEmpty: boolean;
};

export type StagingMigrationEnvironment = StagingEnvironment & {
  migrationDatabaseUrl: URL;
};

export function validateStagingEnvironment(
  environment: Record<string, string | undefined> = process.env,
): StagingEnvironment {
  const parsed = z.object({
    NODE_ENV: z.literal("production"),
    HIG_RUNTIME: z.literal("node"),
    HIG_DEPLOYMENT_ENV: z.literal("staging"),
    HIG_STAGING_NAME: stagingName,
    HIG_STAGING_PROTECTION: z.literal("STAGING_ONLY"),
    HIG_REPOSITORY_BACKEND: z.literal("postgres"),
    HIG_POSTGRES_SHADOW_READS: z.literal("false"),
    HIG_SALES_DEMO: z.literal("false"),
    APP_URL: z.string().url(),
    DATABASE_URL: postgresConnectionUrl,
    PG_SSL: z.enum(["require", "disable"]),
    REDIS_URL: z.string().url(),
    HIG_REDIS_NAMESPACE: z.string().min(4),
    HIG_QUEUE_MODE: z.literal("redis"),
    HIG_KEY_PROVIDER: z.literal("environment"),
    SESSION_SECRET: secret,
    HIG_SECURITY_HASH_KEY: secret,
    HIG_ENCRYPTION_KEY: secret,
    HIG_EMAIL_ADAPTER: z.literal("smtp"),
    SMTP_URL: z.string().url().refine((value) => value.startsWith("smtps://"), "must use smtps://"),
    SMTP_FROM: z.string().email().or(z.string().regex(/^[^\r\n<>]+<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>$/)),
    HIG_STAGING_STORAGE_PATH: protectedPath,
    HIG_STAGING_LOG_PATH: protectedPath,
    HIG_STAGING_BACKUP_PATH: protectedPath,
    HIG_STAGING_REQUIRE_EMPTY: z.enum(["true", "false"]).default("true"),
  }).parse(environment);

  if (new Set([parsed.SESSION_SECRET, parsed.HIG_SECURITY_HASH_KEY, parsed.HIG_ENCRYPTION_KEY]).size !== 3) {
    throw new Error("Staging session, security-hash, and encryption secrets must be different");
  }
  readPostgresEnvironment(environment);
  const appUrl = new URL(parsed.APP_URL);
  const databaseUrl = new URL(parsed.DATABASE_URL);
  const redisUrl = new URL(parsed.REDIS_URL);
  const local = isLoopback(appUrl.hostname)
    && isLoopback(databaseUrl.hostname)
    && isLoopback(redisUrl.hostname);
  if (appUrl.protocol !== "https:" && !local) {
    throw new Error("Staging APP_URL must use HTTPS");
  }
  if (parsed.PG_SSL !== "require" && !local) {
    throw new Error("Remote staging PostgreSQL must require TLS");
  }
  if (redisUrl.protocol !== "rediss:" && !local) {
    throw new Error("Remote staging Redis must use TLS");
  }

  const nameToken = parsed.HIG_STAGING_NAME.replaceAll("-", "_");
  requireStagingMarker("APP_URL", appUrl.hostname, parsed.HIG_STAGING_NAME);
  requireStagingMarker(
    "DATABASE_URL database/user",
    `${databaseUrl.pathname}/${databaseUrl.username}`,
    nameToken,
  );
  requireStagingMarker(
    "HIG_REDIS_NAMESPACE",
    parsed.HIG_REDIS_NAMESPACE,
    parsed.HIG_STAGING_NAME,
  );
  for (const [name, value] of [
    ["HIG_STAGING_STORAGE_PATH", parsed.HIG_STAGING_STORAGE_PATH],
    ["HIG_STAGING_LOG_PATH", parsed.HIG_STAGING_LOG_PATH],
    ["HIG_STAGING_BACKUP_PATH", parsed.HIG_STAGING_BACKUP_PATH],
  ]) {
    requireStagingMarker(name, value, parsed.HIG_STAGING_NAME);
  }
  rejectProductionTarget("APP_URL", appUrl);
  rejectProductionTarget("DATABASE_URL", databaseUrl);
  rejectProductionTarget("REDIS_URL", redisUrl);

  return {
    name: parsed.HIG_STAGING_NAME,
    appUrl,
    databaseUrl,
    redisUrl,
    redisNamespace: parsed.HIG_REDIS_NAMESPACE,
    storagePath: parsed.HIG_STAGING_STORAGE_PATH,
    logPath: parsed.HIG_STAGING_LOG_PATH,
    backupPath: parsed.HIG_STAGING_BACKUP_PATH,
    requireEmpty: parsed.HIG_STAGING_REQUIRE_EMPTY === "true",
  };
}

export function validateStagingMigrationEnvironment(
  environment: Record<string, string | undefined> = process.env,
): StagingMigrationEnvironment {
  const staging = validateStagingEnvironment(environment);
  const parsed = z.object({
    MIGRATION_DATABASE_URL: postgresConnectionUrl,
  }).parse(environment);
  const migrationDatabaseUrl = new URL(parsed.MIGRATION_DATABASE_URL);
  const nameToken = staging.name.replaceAll("-", "_");

  requireStagingMarker(
    "MIGRATION_DATABASE_URL database/user",
    `${migrationDatabaseUrl.pathname}/${migrationDatabaseUrl.username}`,
    nameToken,
  );
  rejectProductionTarget("MIGRATION_DATABASE_URL", migrationDatabaseUrl);

  if (!sameDatabaseTarget(staging.databaseUrl, migrationDatabaseUrl)) {
    throw new Error(
      "MIGRATION_DATABASE_URL must target the same host, port, and database as DATABASE_URL",
    );
  }
  if (staging.databaseUrl.username === migrationDatabaseUrl.username) {
    throw new Error(
      "MIGRATION_DATABASE_URL must use a different database role from DATABASE_URL",
    );
  }

  return { ...staging, migrationDatabaseUrl };
}

function requireStagingMarker(name: string, value: string, marker: string): void {
  const normalizedValue = value.toLowerCase().replaceAll("_", "-");
  const normalizedMarker = marker.toLowerCase().replaceAll("_", "-");
  if (!normalizedValue.includes(normalizedMarker)) {
    throw new Error(`${name} must contain the staging identifier ${marker}`);
  }
}

function rejectProductionTarget(name: string, url: URL): void {
  const value = `${url.hostname}${url.pathname}${url.username}`;
  if (/(^|[._/-])(prod|production|live)([._/-]|$)/i.test(value)) {
    throw new Error(`${name} appears to target production`);
  }
}

function sameDatabaseTarget(first: URL, second: URL): boolean {
  return first.hostname.toLowerCase() === second.hostname.toLowerCase()
    && normalizedPort(first) === normalizedPort(second)
    && first.pathname === second.pathname;
}

function normalizedPort(url: URL): string {
  return url.port || "5432";
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname === "127.0.0.1"
    || hostname === "::1";
}
