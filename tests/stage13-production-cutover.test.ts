import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const compose = read("deploy/hostinger-production.compose.yml");
const migration = read("scripts/migrate-production-postgres.ts");
const roles = read("server/runtime/production-database-roles.ts");
const runtimeEnvironment = read(".env.production.example");
const operatorEnvironment = read(".env.production.operator.example");

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
