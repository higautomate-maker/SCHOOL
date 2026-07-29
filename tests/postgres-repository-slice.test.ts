import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repositoryPairs = [
  ["server/schools/management-repository.ts", "server/schools/management-postgres-repository.ts"],
  ["server/configuration/repository.ts", "server/configuration/postgres-repository.ts"],
  ["server/foundation/repository.ts", "server/foundation/postgres-repository.ts"],
  ["server/access/repository.ts", "server/access/postgres-repository.ts"],
  ["server/students/repository.ts", "server/students/postgres-repository.ts"],
  ["server/workspace/repository.ts", "server/workspace/postgres-repository.ts"],
] as const;

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("every migrated repository keeps SQLite and routes PostgreSQL explicitly", () => {
  for (const [sqlitePath, postgresPath] of repositoryPairs) {
    const sqlite = read(sqlitePath);
    const postgres = read(postgresPath);
    assert.match(sqlite, /repositoryBackend\(\)\s*===\s*"postgres"/, sqlitePath);
    assert.match(sqlite, /@db-runtime/, sqlitePath);
    assert.doesNotMatch(postgres, /@db-runtime/, postgresPath);
    assert.match(postgres, /withTenantDatabase\(/, postgresPath);
  }
});

test("migrated PostgreSQL queries retain explicit tenant predicates", () => {
  for (const [, postgresPath] of repositoryPairs) {
    const postgres = read(postgresPath);
    assert.match(
      postgres,
      /tenant_id = \$1|t\.id = \$1/,
      `${postgresPath} has no explicit tenant predicate`,
    );
  }
});

test("practical SQLite reads schedule PostgreSQL shadow comparisons", () => {
  for (const path of [
    "server/schools/management-repository.ts",
    "server/configuration/repository.ts",
    "server/foundation/repository.ts",
    "server/students/repository.ts",
    "server/workspace/repository.ts",
  ]) {
    assert.match(read(path), /schedulePostgresShadowRead\(/, path);
  }
});

test("live repository gate covers replay, rollback, and cross-tenant isolation", () => {
  const integration = read("scripts/test-postgres-repositories.ts");
  assert.match(integration, /findPostgresStudentReplay/);
  assert.match(integration, /intentional rollback/);
  assert.match(integration, /Cross-tenant write must fail/);
  assert.match(integration, /readCount: 0, writeCount: 0/);
});

test("production repository backend remains SQLite by default", () => {
  assert.match(read(".env.example"), /^HIG_REPOSITORY_BACKEND=sqlite$/m);
  assert.match(
    read("server/runtime/repository-backend.ts"),
    /HIG_REPOSITORY_BACKEND \?\? "sqlite"/,
  );
});
