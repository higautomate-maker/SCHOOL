import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const compose = ["compose", "-f", "tests/integration/compose.yaml"];
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

  const migration = readdirSync("drizzle-postgres")
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(`drizzle-postgres/${name}`, "utf8").replaceAll("--> statement-breakpoint", ""))
    .join("\n");
  const psql = ["exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", "hig_school_test", "-d", "hig_school_test"];
  docker(psql, { input: migration });

  const seed = readFileSync("db/postgres/seed-demo.sql", "utf8");
  docker(psql, { input: seed });
  docker(psql, { input: seed });
  docker([
    ...psql,
    "-c",
    "CREATE ROLE hig_school_app NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO hig_school_app; GRANT SELECT ON ALL TABLES IN SCHEMA public TO hig_school_app;",
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
    "BEGIN; SET LOCAL ROLE hig_school_app; SELECT set_config('app.tenant_id','30000000-0000-4000-8000-000000000099',true); SELECT count(*) FROM tenants; ROLLBACK;",
  ], { capture: true }).split("\n").filter((line) => /^\d+$/.test(line)).at(-1);
  if (isolatedTenant !== "0") throw new Error(`RLS exposed another tenant: ${isolatedTenant}`);

  const platformTenant = docker([
    ...psql,
    "-Atc",
    "BEGIN; SET LOCAL ROLE hig_school_app; SELECT set_config('app.platform_read','true',true); SELECT count(*) FROM tenants; ROLLBACK;",
  ], { capture: true }).split("\n").filter((line) => /^\d+$/.test(line)).at(-1);
  if (platformTenant !== "1") throw new Error(`Platform reader could not list schools: ${platformTenant}`);

  console.log("Disposable PostgreSQL migration, deterministic seed, tenant/platform RLS, and Redis checks passed.");
} finally {
  if (started) {
    try {
      docker(["down", "-v", "--remove-orphans"]);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  }
}
