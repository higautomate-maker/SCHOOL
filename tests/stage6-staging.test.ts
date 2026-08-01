import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateStagingEnvironment } from "../server/runtime/staging-environment.ts";

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

test("accepts an isolated local staging environment", () => {
  const result = validateStagingEnvironment(valid);
  assert.equal(result.name, "staging-school");
  assert.equal(result.requireEmpty, true);
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
    /staging identifier|production/,
  );
  assert.throws(
    () => validateStagingEnvironment({
      ...valid,
      APP_URL: "https://staging-school.example.com",
      DATABASE_URL: "postgresql://app:secret@database.example.com:5432/live",
      PG_SSL: "require",
      REDIS_URL: "rediss://staging-school:secret@staging-redis.example.com:6380",
    }),
    /staging identifier|production/,
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

test("staging migration has no production bypass and never invokes the demo seed", () => {
  const source = readFileSync(
    new URL("../scripts/migrate-staging-postgres.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /validateStagingEnvironment/);
  assert.match(source, /Production cutover flags are not accepted/);
  assert.doesNotMatch(source, /--force|legacy-peer-deps|seed-demo\.sql/);
  assert.match(source, /company\.demo@higschool\.test/);
  assert.match(source, /HIG Model School/);
});

test("Stage 6 commands cover smoke, isolation, load, restore, and rollback", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { scripts: Record<string, string> };
  for (const command of [
    "staging:validate",
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
