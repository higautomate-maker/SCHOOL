import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const compose = ["compose", "-f", "tests/integration/compose.yaml"];
const timings = {};

function measured(label, operation) {
  const started = performance.now();
  const result = operation();
  timings[label] = Math.round((performance.now() - started) * 100) / 100;
  console.log(`Stage 5 timing ${label}: ${timings[label]} ms`);
  return result;
}
const availability = spawnSync("docker", ["compose", "version"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

if (availability.error?.code === "ENOENT") {
  console.error("Docker is required for the disposable PostgreSQL/Redis integration test.");
  process.exit(2);
}
if (availability.status !== 0) {
  console.error("Docker Compose is unavailable or the Docker daemon is not running.");
  process.exit(2);
}

function docker(args, options = {}) {
  const result = spawnSync("docker", [...compose, ...args], {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : options.input ? ["pipe", "inherit", "inherit"] : "inherit",
    input: options.input,
  });
  if (result.status !== 0) {
    const detail = options.capture ? `${result.stdout}\n${result.stderr}`.trim() : "";
    throw new Error(`docker ${[...compose, ...args].join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }
  return result.stdout?.trim() ?? "";
}

function runRepositoryIntegration() {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/test-postgres-repositories.ts"],
    {
      encoding: "utf8",
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: "postgresql://hig_school_app:hig_school_app@127.0.0.1:55432/hig_school_test",
        PG_SSL: "disable",
        PG_POOL_MAX: "2",
        HIG_REPOSITORY_BACKEND: "postgres",
        HIG_POSTGRES_SHADOW_READS: "false",
        NODE_ENV: "test",
        HIG_EMAIL_ADAPTER: "capture",
        APP_URL: "https://repository.integration.test",
      },
    },
  );
  if (result.status !== 0) {
    throw new Error("PostgreSQL repository integration checks failed");
  }
}

function runAuthenticationIntegration() {
  runNpm(
    "test:integration:auth",
    {
      DATABASE_URL: "postgresql://hig_school_app:hig_school_app@127.0.0.1:55432/hig_school_test",
      PG_SSL: "disable",
      PG_POOL_MAX: "2",
      REDIS_URL: "redis://127.0.0.1:56379",
      HIG_REDIS_NAMESPACE: `stage7-auth-${process.pid}:`,
      HIG_REPOSITORY_BACKEND: "postgres",
      HIG_POSTGRES_SHADOW_READS: "false",
      NODE_ENV: "test",
      HIG_EMAIL_ADAPTER: "capture",
      APP_URL: "https://auth.integration.test",
    },
    "PostgreSQL authentication integration checks failed",
  );
}

function runGreenfieldIntegration(databaseUrl) {
  runNode(
    ["--experimental-strip-types", "scripts/test-greenfield-postgres.ts"],
    {
      DATABASE_URL: databaseUrl,
      PG_SSL: "disable",
      PG_POOL_MAX: "2",
      HIG_REPOSITORY_BACKEND: "postgres",
      HIG_POSTGRES_SHADOW_READS: "false",
      HIG_GREENFIELD_ROLLBACK_TRIGGER_READY: "true",
      NODE_ENV: "test",
      HIG_EMAIL_ADAPTER: "capture",
      APP_URL: "https://greenfield.integration.test",
    },
    "Greenfield PostgreSQL integration checks failed",
  );
}

function runNode(args, environment, failureMessage) {
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    stdio: "inherit",
    env: { ...process.env, ...environment },
  });
  if (result.status !== 0) throw new Error(failureMessage);
}

function runNpm(script, environment, failureMessage) {
  const result = spawnSync("npm", ["run", script], {
    encoding: "utf8",
    stdio: "inherit",
    env: { ...process.env, ...environment },
  });
  if (result.status !== 0) throw new Error(failureMessage);
}

function runPostgresMigrations(databaseUrl) {
  const result = spawnSync(
    process.execPath,
    ["scripts/migrate-postgres.mjs"],
    {
      encoding: "utf8",
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: databaseUrl, PG_SSL: "disable" },
    },
  );
  if (result.status !== 0) throw new Error("Safe PostgreSQL migration command failed");
}

function checkPostgresMigrations(databaseUrl) {
  const result = spawnSync(
    process.execPath,
    ["scripts/migrate-postgres.mjs", "--check"],
    {
      encoding: "utf8",
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: databaseUrl, PG_SSL: "disable" },
    },
  );
  if (result.status !== 0) throw new Error("PostgreSQL migration ordering/checksum check failed");
}

let started = false;

try {
  docker(["up", "-d", "--wait"]);
  started = true;
  const postgres = docker(
    ["exec", "-T", "postgres", "psql", "-U", "hig_school_test", "-d", "hig_school_test", "-Atc", "SELECT current_database()"],
    { capture: true },
  );
  if (postgres !== "hig_school_test") throw new Error(`Unexpected PostgreSQL response: ${postgres}`);

  const redis = docker(["exec", "-T", "redis", "redis-cli", "PING"], { capture: true });
  if (redis !== "PONG") throw new Error(`Unexpected Redis response: ${redis}`);

  const psql = ["exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", "hig_school_test", "-d", "hig_school_test"];
  measured(
    "postgresqlSchemaMigration",
    () => runPostgresMigrations("postgresql://hig_school_test:hig_school_test@127.0.0.1:55432/hig_school_test"),
  );
  runPostgresMigrations("postgresql://hig_school_test:hig_school_test@127.0.0.1:55432/hig_school_test");

  const seed = readFileSync("db/postgres/seed-demo.sql", "utf8");
  docker(psql, { input: seed });
  docker(psql, { input: seed });
  docker(psql, {
    input: `
      CREATE OR REPLACE FUNCTION stage4_fail_school_idempotency()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.operation = 'school.create' AND NEW.key = 'stage4-school-rollback' THEN
          RAISE EXCEPTION 'intentional school onboarding rollback';
        END IF;
        RETURN NEW;
      END
      $$;
      CREATE TRIGGER stage4_school_idempotency_failure
      BEFORE INSERT ON idempotency_records
      FOR EACH ROW EXECUTE FUNCTION stage4_fail_school_idempotency();
    `,
  });
  docker([
    ...psql,
    "-c",
    "INSERT INTO tenants (id, name, slug, status, country_code) VALUES ('30000000-0000-4000-8000-000000000099', 'Isolation School', 'isolation-school', 'active', 'IN');",
  ]);
  docker([
    ...psql,
    "-c",
    "CREATE ROLE hig_school_app LOGIN PASSWORD 'hig_school_app' NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO hig_school_app; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hig_school_app; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hig_school_app;",
  ]);

  const visibleTenant = docker([
    ...psql,
    "-Atc",
    "BEGIN; SET LOCAL ROLE hig_school_app; SELECT set_config('app.tenant_id','30000000-0000-4000-8000-000000000001',true); SELECT count(*) FROM tenants; ROLLBACK;",
  ], { capture: true }).split("\n").filter((line) => /^\d+$/.test(line)).at(-1);
  if (visibleTenant !== "1") throw new Error(`Expected seeded tenant through RLS, received: ${visibleTenant}`);

  const isolatedTenant = docker([
    ...psql,
    "-Atc",
    "BEGIN; SET LOCAL ROLE hig_school_app; SELECT set_config('app.tenant_id','30000000-0000-4000-8000-000000000098',true); SELECT count(*) FROM tenants; ROLLBACK;",
  ], { capture: true }).split("\n").filter((line) => /^\d+$/.test(line)).at(-1);
  if (isolatedTenant !== "0") throw new Error(`RLS exposed another tenant: ${isolatedTenant}`);

  const platformTenant = docker([
    ...psql,
    "-Atc",
    "BEGIN; SET LOCAL ROLE hig_school_app; SELECT set_config('app.platform_read','true',true); SELECT count(*) FROM tenants; ROLLBACK;",
  ], { capture: true }).split("\n").filter((line) => /^\d+$/.test(line)).at(-1);
  if (platformTenant !== "2") throw new Error(`Platform reader could not list schools: ${platformTenant}`);

  measured("repositorySmokeTests", runRepositoryIntegration);
  measured("authenticationIntegration", runAuthenticationIntegration);

  measured("productionReadiness", () => runNpm(
    "test:readiness:production",
    {
      DATABASE_URL: "postgresql://hig_school_app:hig_school_app@127.0.0.1:55432/hig_school_test",
      PG_SSL: "disable",
      PG_POOL_MAX: "4",
      PG_IDLE_TIMEOUT_MS: "10000",
      PG_CONNECTION_TIMEOUT_MS: "5000",
      HIG_REPOSITORY_BACKEND: "postgres",
      APP_URL: "https://stage5.integration.higschool.test",
      SESSION_SECRET: "stage5-integration-session-secret-32-bytes",
      REDIS_URL: "redis://127.0.0.1:56379",
      HIG_QUEUE_MODE: "redis",
      HIG_KEY_PROVIDER: "environment",
      HIG_ENCRYPTION_KEY: "stage5-integration-encryption-key-32-bytes",
    },
    "Stage 5 production readiness checks failed",
  ));
  measured("boundedLoadAndConcurrency", () => runNpm(
    "test:load:postgres",
    {
      DATABASE_URL: "postgresql://hig_school_app:hig_school_app@127.0.0.1:55432/hig_school_test",
      PG_SSL: "disable",
      PG_POOL_MAX: "4",
      HIG_REPOSITORY_BACKEND: "postgres",
    },
    "Bounded PostgreSQL load check failed",
  ));

  const migrationDatabase = "hig_school_greenfield_test";
  docker([
    "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1",
    "-U", "hig_school_test", "-d", "hig_school_test",
    "-c", `CREATE DATABASE ${migrationDatabase}`,
  ]);
  const migrationUrl =
    `postgresql://hig_school_test:hig_school_test@127.0.0.1:55432/${migrationDatabase}`;
  measured("greenfieldSchemaMigration", () => runPostgresMigrations(migrationUrl));
  checkPostgresMigrations(migrationUrl);
  const migrationLedger = docker([
    "exec", "-T", "postgres", "psql", "-U", "hig_school_test",
    "-d", migrationDatabase, "-Atc",
    `SELECT string_agg(migration_name || ':' || checksum_sha256, ',' ORDER BY migration_name)
     FROM hig_schema_migrations`,
  ], { capture: true });
  const expectedMigrations = readFileSync("drizzle-postgres/meta/_journal.json", "utf8");
  const expectedMigrationCount = (JSON.parse(expectedMigrations).entries ?? []).length;
  if (migrationLedger.split(",").filter(Boolean).length !== expectedMigrationCount) {
    throw new Error(`Greenfield migration ledger is incomplete: ${migrationLedger}`);
  }

  const emptySource = "/tmp/hig-stage5-empty-production-repository.sqlite";
  runNode(
    [
      "--experimental-strip-types",
      "scripts/create-stage5-migration-fixture.ts",
      emptySource,
      "--empty",
    ],
    {},
    "Empty Stage 5 SQLite production-repository schema creation failed",
  );
  measured("greenfieldEmptyPreflight", () => runNode(
    ["--experimental-strip-types", "scripts/migrate-sqlite-to-postgres.ts"],
    {
      HIG_SQLITE_SOURCE_PATH: emptySource,
      HIG_MIGRATION_REPORT_PATH: "/tmp/hig-stage5-greenfield-empty-dry-run.json",
    },
    "Greenfield empty-source dry run failed",
  ));
  measured("greenfieldEmptyImport", () => runNode(
    ["--experimental-strip-types", "scripts/migrate-sqlite-to-postgres.ts", "--execute"],
    {
      DATABASE_URL: migrationUrl,
      PG_SSL: "disable",
      HIG_SQLITE_SOURCE_PATH: emptySource,
      HIG_MIGRATION_REPORT_PATH: "/tmp/hig-stage5-greenfield-empty-execute.json",
    },
    "Greenfield empty-source controlled migration failed",
  ));
  measured("greenfieldEmptyReconciliation", () => runNode(
    ["--experimental-strip-types", "scripts/reconcile-sqlite-postgres.ts"],
    {
      DATABASE_URL: migrationUrl,
      PG_SSL: "disable",
      HIG_SQLITE_SOURCE_PATH: emptySource,
      HIG_RECONCILIATION_REPORT_PATH: "/tmp/hig-stage5-greenfield-empty-reconciliation.json",
    },
    "Greenfield empty SQLite/PostgreSQL reconciliation failed",
  ));

  const greenfieldPsql = [
    "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1",
    "-U", "hig_school_test", "-d", migrationDatabase,
  ];
  docker([
    ...greenfieldPsql,
    "-c",
    "GRANT USAGE ON SCHEMA public TO hig_school_app; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hig_school_app; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hig_school_app;",
  ]);
  docker(greenfieldPsql, {
    input: `
      CREATE OR REPLACE FUNCTION greenfield_fail_school_idempotency()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.operation = 'school.create' AND NEW.key = 'greenfield-school-rollback' THEN
          RAISE EXCEPTION 'intentional greenfield onboarding rollback';
        END IF;
        RETURN NEW;
      END
      $$;
      CREATE TRIGGER greenfield_school_idempotency_failure
      BEFORE INSERT ON idempotency_records
      FOR EACH ROW EXECUTE FUNCTION greenfield_fail_school_idempotency();
    `,
  });
  measured(
    "greenfieldFirstSchoolAndBusinessFlow",
    () => runGreenfieldIntegration(
      `postgresql://hig_school_app:hig_school_app@127.0.0.1:55432/${migrationDatabase}`,
    ),
  );

  measured("postgresqlBackup", () => docker([
    "exec", "-T", "postgres", "pg_dump", "-U", "hig_school_test",
    "-d", migrationDatabase, "--format=custom", "--no-owner", "--no-acl",
    "--file=/tmp/hig-stage5-backup.dump",
  ]));
  const postgresContainer = docker(["ps", "-q", "postgres"], { capture: true });
  runNode(
    [
      "scripts/validate-postgres-backup.mjs",
      "--docker-container", postgresContainer,
      "--file", "/tmp/hig-stage5-backup.dump",
    ],
    {},
    "PostgreSQL backup validation failed",
  );
  const restoredVerification = measured("postgresqlRestore", () => {
    docker([
      "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1",
      "-U", "hig_school_test", "-d", "hig_school_test",
      "-c", "CREATE DATABASE hig_school_restore_test",
    ]);
    docker([
      "exec", "-T", "postgres", "pg_restore", "--exit-on-error",
      "--single-transaction", "--no-owner", "--no-acl",
      "-U", "hig_school_test", "-d", "hig_school_restore_test",
      "/tmp/hig-stage5-backup.dump",
    ]);
    return docker([
      "exec", "-T", "postgres", "psql", "-U", "hig_school_test",
      "-d", "hig_school_restore_test", "-Atc",
      `SELECT
         count(*)::text || '|' ||
         (SELECT count(*)::text FROM students) || '|' ||
         (SELECT coalesce(sum(amount_paise), 0)::text FROM fee_invoices) || '|' ||
         (SELECT coalesce(sum(paid_paise), 0)::text FROM fee_invoices) || '|' ||
         (SELECT coalesce(sum(amount_paise), 0)::text FROM fee_payments) || '|' ||
         (SELECT coalesce(sum(amount_paise - paid_paise), 0)::text FROM fee_invoices)
       FROM tenants`,
    ], { capture: true });
  });
  if (restoredVerification !== "2|1|100001|40001|40001|60000") {
    throw new Error(
      `Restored greenfield row/tenant/financial verification failed: ${restoredVerification}`,
    );
  }
  console.log("Greenfield empty-source migration and zero-row reconciliation checks passed.");
  console.log("Greenfield PostgreSQL backup archive, restore, row-count, tenant, and financial checks passed.");
  console.log("Disposable PostgreSQL migration, deterministic seed, tenant/platform RLS, and Redis checks passed.");
  writeFileSync(
    "/tmp/hig-stage5-infra-timings.json",
    `${JSON.stringify(timings, null, 2)}\n`,
    { mode: 0o600 },
  );
} finally {
  if (started) {
    try {
      docker(["down", "-v", "--remove-orphans"]);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  }
}
