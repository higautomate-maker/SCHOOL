import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateStagingMigrationEnvironment } from "../server/runtime/staging-environment.ts";

const environment = {
  NODE_ENV: "production",
  HIG_RUNTIME: "node",
  HIG_DEPLOYMENT_ENV: "staging",
  HIG_STAGING_NAME: "staging-school",
  HIG_STAGING_PROTECTION: "STAGING_ONLY",
  HIG_STAGING_REQUIRE_EMPTY: "true",
  HIG_REPOSITORY_BACKEND: "postgres",
  HIG_POSTGRES_SHADOW_READS: "false",
  HIG_SALES_DEMO: "false",
  APP_URL: "http://staging-school.localhost:3000",
  SESSION_SECRET: "stage9-session-secret-is-long-and-unique",
  HIG_SECURITY_HASH_KEY: "stage9-security-hash-key-is-long-and-unique",
  HIG_ENCRYPTION_KEY: "stage9-encryption-key-is-long-and-unique",
  DATABASE_URL: "postgresql://staging_school_app:runtime-secret@localhost:5432/staging_school",
  MIGRATION_DATABASE_URL:
    "postgresql://staging_school_owner:owner-secret@localhost:5432/staging_school",
  PG_SSL: "disable",
  PG_POOL_MAX: "4",
  PG_IDLE_TIMEOUT_MS: "30000",
  PG_CONNECTION_TIMEOUT_MS: "10000",
  REDIS_URL: "redis://localhost:6379",
  HIG_REDIS_NAMESPACE: "staging-school:",
  HIG_QUEUE_MODE: "redis",
  HIG_KEY_PROVIDER: "environment",
  HIG_EMAIL_ADAPTER: "smtp",
  SMTP_URL: "smtps://staging-user:secret@localhost:2465",
  SMTP_FROM: "security-staging@example.com",
  HIG_STAGING_STORAGE_PATH: "/tmp/staging-school/data",
  HIG_STAGING_LOG_PATH: "/tmp/staging-school/logs",
  HIG_STAGING_BACKUP_PATH: "/tmp/staging-school/backups",
};

test("Stage 9 staging requires separate runtime and migration database roles", () => {
  const result = validateStagingMigrationEnvironment(environment);
  assert.equal(result.databaseUrl.username, "staging_school_app");
  assert.equal(result.migrationDatabaseUrl.username, "staging_school_owner");
  assert.throws(
    () => validateStagingMigrationEnvironment({
      ...environment,
      MIGRATION_DATABASE_URL: environment.DATABASE_URL,
    }),
    /different database role/,
  );
});

test("migration-owner credentials are operator-only and excluded from Docker layers", () => {
  const compose = readFileSync(
    new URL("../deploy/hostinger-staging.compose.yml", import.meta.url),
    "utf8",
  );
  const dockerIgnore = readFileSync(
    new URL("../.dockerignore", import.meta.url),
    "utf8",
  );
  assert.equal(compose.match(/\.env\.staging\.operator/g)?.length, 1);
  assert.match(compose, /operator:[\s\S]*\.env\.staging\.operator/);
  assert.match(dockerIgnore, /^\.env\*$/m);
});

test("Stage 9 migrations use the owner URL and verify through the runtime URL", () => {
  const genericMigration = readFileSync(
    new URL("../scripts/migrate-postgres.mjs", import.meta.url),
    "utf8",
  );
  const stagingMigration = readFileSync(
    new URL("../scripts/migrate-staging-postgres.ts", import.meta.url),
    "utf8",
  );
  const roleValidation = readFileSync(
    new URL("../server/runtime/staging-database-roles.ts", import.meta.url),
    "utf8",
  );
  assert.match(genericMigration, /MIGRATION_DATABASE_URL \|\| process\.env\.DATABASE_URL/);
  assert.match(stagingMigration, /staging\.migrationDatabaseUrl/);
  assert.match(stagingMigration, /connectionString: staging\.databaseUrl\.toString\(\)/);
  assert.match(stagingMigration, /relation\.relowner/);
  assert.match(roleValidation, /NOSUPERUSER and NOBYPASSRLS/);
});
