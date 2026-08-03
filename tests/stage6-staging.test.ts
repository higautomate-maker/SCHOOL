import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  validateStagingEnvironment,
  validateStagingMigrationEnvironment,
} from "../server/runtime/staging-environment.ts";

const valid = {
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
  SESSION_SECRET: "stage6-session-secret-is-long-and-unique",
  HIG_SECURITY_HASH_KEY: "stage7-security-hash-key-is-unique-and-long",
  DATABASE_URL: "postgresql://staging_school_app:secret@localhost:5432/staging_school",
  PG_SSL: "disable",
  PG_POOL_MAX: "4",
  PG_IDLE_TIMEOUT_MS: "30000",
  PG_CONNECTION_TIMEOUT_MS: "10000",
  REDIS_URL: "redis://localhost:6379",
  HIG_REDIS_NAMESPACE: "staging-school:",
  HIG_QUEUE_MODE: "redis",
  HIG_KEY_PROVIDER: "environment",
  HIG_ENCRYPTION_KEY: "stage6-encryption-key-is-different-and-long",
  HIG_EMAIL_ADAPTER: "smtp",
  SMTP_URL: "smtps://staging-user:secret@localhost:2465",
  SMTP_FROM: "security-staging@example.com",
  HIG_STAGING_STORAGE_PATH: "/tmp/staging-school/data",
  HIG_STAGING_LOG_PATH: "/tmp/staging-school/logs",
  HIG_STAGING_BACKUP_PATH: "/tmp/staging-school/backups",
};

const migrationValid = {
  ...valid,
  MIGRATION_DATABASE_URL:
    "postgresql://staging_school_owner:owner-secret@localhost:5432/staging_school",
};

test("accepts an isolated local staging runtime environment", () => {
  const result = validateStagingEnvironment(valid);
  assert.equal(result.name, "staging-school");
  assert.equal(result.requireEmpty, true);
});

test("accepts a separate staging migration-owner connection", () => {
  const result = validateStagingMigrationEnvironment(migrationValid);
  assert.equal(result.databaseUrl.username, "staging_school_app");
  assert.equal(result.migrationDatabaseUrl.username, "staging_school_owner");
});

test("staging validation rejects production-like and shared resources", () => {
  assert.throws(
    () => validateStagingEnvironment({
      ...valid,
      APP_URL: "https://production.example.com",
      DATABASE_URL: "postgresql://staging_school_app:secret@staging-postgres.example.com:5432/staging_school",
      PG_SSL: "require",
      REDIS_URL: "rediss://staging-school:secret@staging-redis.example.com:6380",
    }),
    /staging identifier|production|placeholder/,
  );
  assert.throws(
    () => validateStagingEnvironment({
      ...valid,
      APP_URL: "https://staging-school.example.com",
      DATABASE_URL: "postgresql://app:secret@database.example.com:5432/live",
      PG_SSL: "require",
      REDIS_URL: "rediss://staging-school:secret@staging-redis.example.com:6380",
    }),
    /staging identifier|production|placeholder/,
  );
  assert.throws(
    () => validateStagingEnvironment({
      ...valid,
      HIG_REPOSITORY_BACKEND: "sqlite",
    }),
  );
  assert.throws(
    () => validateStagingEnvironment({
      ...valid,
      HIG_POSTGRES_SHADOW_READS: "true",
    }),
  );
  assert.throws(
    () => validateStagingEnvironment({
      ...valid,
      SESSION_SECRET: valid.HIG_ENCRYPTION_KEY,
    }),
    /must be different/,
  );
});

test("staging migration validation requires the same database and a different role", () => {
  assert.throws(
    () => validateStagingMigrationEnvironment({
      ...migrationValid,
      MIGRATION_DATABASE_URL: valid.DATABASE_URL,
    }),
    /different database role/,
  );
  assert.throws(
    () => validateStagingMigrationEnvironment({
      ...migrationValid,
      MIGRATION_DATABASE_URL:
        "postgresql://staging_school_owner:owner-secret@localhost:5432/staging_school_other",
    }),
    /same host, port, and database/,
  );
  assert.throws(
    () => validateStagingMigrationEnvironment({
      ...migrationValid,
      MIGRATION_DATABASE_URL:
        "postgresql://staging_school_owner:replace-me@localhost:5432/staging_school",
    }),
    /placeholder/,
  );
});

test("staging migration has no production bypass and uses isolated database roles", () => {
  const migrationSource = readFileSync(
    new URL("../scripts/migrate-staging-postgres.ts", import.meta.url),
    "utf8",
  );
  const roleSource = readFileSync(
    new URL("../server/runtime/staging-database-roles.ts", import.meta.url),
    "utf8",
  );
  assert.match(migrationSource, /validateStagingDatabaseRoles/);
  assert.match(migrationSource, /migrationDatabaseUrl/);
  assert.match(migrationSource, /app\.platform_read/);
  assert.match(migrationSource, /relation\.relowner/);
  assert.match(migrationSource, /Production cutover flags are not accepted/);
  assert.doesNotMatch(migrationSource, /--force|legacy-peer-deps|seed-demo\.sql/);
  assert.match(migrationSource, /company\.demo@higschool\.test/);
  assert.match(migrationSource, /HIG Model School/);
  assert.match(roleSource, /rolsuper/);
  assert.match(roleSource, /rolbypassrls/);
  assert.match(roleSource, /NOSUPERUSER and NOBYPASSRLS/);
});

test("operator credentials are excluded from app containers and Docker build layers", () => {
  const compose = readFileSync(
    new URL("../deploy/hostinger-staging.compose.yml", import.meta.url),
    "utf8",
  );
  const dockerIgnore = readFileSync(
    new URL("../.dockerignore", import.meta.url),
    "utf8",
  );
  assert.equal(
    compose.match(/\.env\.staging\.operator/g)?.length,
    1,
    "operator environment file must be attached only to the operator service",
  );
  assert.match(compose, /operator:[\s\S]*\.env\.staging\.operator/);
  assert.match(dockerIgnore, /^\.env\*$/m);
});

test("Stage 6 commands cover role validation, smoke, isolation, load, restore, and rollback", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { scripts: Record<string, string> };
  for (const command of [
    "staging:validate",
    "staging:database-roles",
    "staging:migrate",
    "staging:initialize",
    "staging:smoke",
    "staging:isolation",
    "staging:load",
    "staging:backup:restore",
    "staging:rollback:verify",
    "staging:audit",
  ]) {
    assert.ok(packageJson.scripts[command], `${command} is missing`);
  }
});
