import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateProductionEnvironment } from "../server/runtime/production-environment.ts";

const read = (path: string) => readFileSync(path, "utf8");
const compose = read("deploy/hostinger-production.compose.yml");
const migration = read("scripts/migrate-production-postgres.ts");
const roles = read("server/runtime/production-database-roles.ts");
const runtimeEnvironment = read(".env.production.example");
const operatorEnvironment = read(".env.production.operator.example");
const privateCompose = read("deploy/hostinger-production-postgres.compose.yml");
const postgresInit = read("deploy/postgres/initdb/10-production-roles.sh");
const postgresEnvironment = read(".env.production.postgres.example");

test("production Compose isolates runtime, worker and operator credentials", () => {
  assert.match(compose, /name: production-school/);
  assert.match(compose, /target: production-operator/);
  assert.match(compose, /\.env\.production\.operator/);
  assert.match(compose, /profiles:\s*\n\s*- operator/);
  assert.match(compose, /PRODUCTION_IMAGE_TAG:\?Set PRODUCTION_IMAGE_TAG/);
  assert.match(compose, /PRODUCTION_HOSTNAME:\?Set PRODUCTION_HOSTNAME/);
  assert.match(compose, /127\.0\.0\.1:\$\{PRODUCTION_HOST_PORT:-3200\}:3000/);
  const appSection = compose.slice(compose.indexOf("  app:"), compose.indexOf("  worker:"));
  const workerSection = compose.slice(compose.indexOf("  worker:"), compose.indexOf("  operator:"));
  assert.doesNotMatch(appSection, /\.env\.production\.operator/);
  assert.doesNotMatch(workerSection, /\.env\.production\.operator/);
});

test("production Compose provides an isolated authenticated Redis and shared heartbeat", () => {
  assert.match(compose, /redis:7\.4\.11-alpine3\.21/);
  assert.match(compose, /--requirepass "\$\$HIG_REDIS_PASSWORD"/);
  assert.match(compose, /production_school_redis:\/data/);
  assert.doesNotMatch(
    compose.slice(compose.indexOf("  redis:"), compose.indexOf("  app:")),
    /ports:/,
  );
  assert.match(compose, /condition: service_healthy/);
  assert.match(compose, /production_school_logs:\/logs\/hig-school-production:ro/);
  assert.match(runtimeEnvironment, /HIG_REDIS_PASSWORD=/);
  assert.match(runtimeEnvironment, /REDIS_URL=redis:\/\/:.+@redis:6379/);
});

test("production migration is explicit, greenfield-only and never seeds", () => {
  assert.match(migration, /GREENFIELD_POSTGRES_CUTOVER/);
  assert.match(migration, /assertGreenfieldTarget/);
  assert.match(migration, /Production migration refuses a nonempty target/);
  assert.match(migration, /runMigration\(\[\], initial\.migrationDatabaseUrl\)/);
  assert.match(migration, /runMigration\(\["--check"\]/);
  assert.match(migration, /demo seed data was detected/);
  assert.doesNotMatch(migration, /seed-demo|db:seed/);
});

test("production database roles remain separate and production scoped", () => {
  assert.match(roles, /Runtime database role must be NOSUPERUSER and NOBYPASSRLS/);
  assert.match(roles, /Runtime database role must not own application tables/);
  assert.match(roles, /same production database/);
  assert.match(roles, /identity is not production-scoped/);
  assert.match(roles, /identity is not production-isolated/);
  assert.match(roles, /HIG_POSTGRES_SHADOW_READS !== "false"/);
  assert.match(roles, /HIG_SALES_DEMO !== "false"/);
});

test("production templates keep migration ownership outside runtime", () => {
  assert.match(runtimeEnvironment, /HIG_DEPLOYMENT_ENV=production/);
  assert.match(runtimeEnvironment, /HIG_REPOSITORY_BACKEND=postgres/);
  assert.match(runtimeEnvironment, /HIG_POSTGRES_SHADOW_READS=false/);
  assert.match(runtimeEnvironment, /HIG_SALES_DEMO=false/);
  assert.doesNotMatch(runtimeEnvironment, /MIGRATION_DATABASE_URL/);
  assert.match(operatorEnvironment, /MIGRATION_DATABASE_URL=/);
  assert.match(operatorEnvironment, /HIG_PRODUCTION_CUTOVER_APPROVED=GREENFIELD_POSTGRES_CUTOVER/);
});

test("private PostgreSQL overlay has no published database port and isolates secrets", () => {
  assert.match(privateCompose, /internal: true/);
  assert.match(privateCompose, /production_school_postgres:\/var\/lib\/postgresql\/data/);
  assert.match(privateCompose, /\.env\.production\.postgres/);
  const databaseService = privateCompose.slice(privateCompose.indexOf("  postgres:"), privateCompose.indexOf("  app:"));
  assert.doesNotMatch(databaseService, /\n\s+ports:/);
  assert.match(databaseService, /networks:\s*\n\s*- database/);
  assert.match(postgresInit, /CREATE ROLE hig_school_production_owner LOGIN NOSUPERUSER NOBYPASSRLS/);
  assert.match(postgresInit, /CREATE ROLE hig_school_production_app LOGIN NOSUPERUSER NOBYPASSRLS/);
  assert.match(postgresInit, /ALTER DEFAULT PRIVILEGES FOR ROLE hig_school_production_owner/);
  assert.match(postgresEnvironment, /HIG_PRODUCTION_APP_PASSWORD=/);
  assert.match(postgresEnvironment, /HIG_PRODUCTION_OWNER_PASSWORD=/);
  assert.doesNotMatch(runtimeEnvironment, /POSTGRES_PASSWORD=/);
});

test("unencrypted production PostgreSQL is allowed only on the private Compose hostname", () => {
  const environment = {
    HIG_REPOSITORY_BACKEND: "postgres",
    HIG_POSTGRES_SHADOW_READS: "false",
    DATABASE_URL: "postgresql://hig_school_production_app:secret@postgres:5432/hig_school_production?sslmode=disable",
    PG_SSL: "disable",
    HIG_PRIVATE_POSTGRES: "true",
    APP_URL: "https://school.higaai.com",
    SESSION_SECRET: "a".repeat(32),
    REDIS_URL: "redis://:secret@redis:6379",
    HIG_QUEUE_MODE: "redis",
    HIG_KEY_PROVIDER: "environment",
    HIG_ENCRYPTION_KEY: "b".repeat(32),
  };
  assert.ok(validateProductionEnvironment(environment));
  assert.throws(
    () => validateProductionEnvironment({ ...environment, HIG_PRIVATE_POSTGRES: "false" }),
    /private Compose database network/,
  );
  assert.throws(
    () => validateProductionEnvironment({ ...environment, DATABASE_URL: environment.DATABASE_URL.replace("@postgres:", "@public.example:") }),
    /private Compose database network/,
  );
  assert.throws(
    () => validateProductionEnvironment({ ...environment, DATABASE_URL: environment.DATABASE_URL.replace("sslmode=disable", "sslmode=require") }),
    /private Compose database network/,
  );
  assert.throws(
    () => validateProductionEnvironment({ ...environment, DATABASE_URL: environment.DATABASE_URL.replace("hig_school_production_app", "postgres") }),
    /private Compose database network/,
  );
  assert.throws(
    () => validateProductionEnvironment({ ...environment, DATABASE_URL: `${environment.DATABASE_URL}&host=public.example` }),
    /private Compose database network/,
  );
});
