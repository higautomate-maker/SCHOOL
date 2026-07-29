import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  postgresShadowReadsEnabled,
  repositoryBackend,
} from "../server/runtime/repository-backend.ts";

test("repository backend defaults to accepted SQLite and explicitly enables PostgreSQL", () => {
  assert.equal(repositoryBackend({}), "sqlite");
  assert.equal(repositoryBackend({ HIG_REPOSITORY_BACKEND: "postgres" }), "postgres");
  assert.throws(() => repositoryBackend({ HIG_REPOSITORY_BACKEND: "d1" }));
  assert.equal(postgresShadowReadsEnabled({ HIG_POSTGRES_SHADOW_READS: "true" }), true);
  assert.equal(postgresShadowReadsEnabled({ HIG_POSTGRES_SHADOW_READS: "TRUE" }), false);
});

test("platform school reader uses bounded pagination and transaction-scoped RLS", () => {
  const repository = readFileSync(
    new URL("../server/schools/postgres-repository.ts", import.meta.url),
    "utf8",
  );
  const runtime = readFileSync(
    new URL("../server/runtime/postgres.ts", import.meta.url),
    "utf8",
  );
  const rls = readFileSync(
    new URL("../drizzle-postgres/0002_platform_read_rls.sql", import.meta.url),
    "utf8",
  );

  assert.match(repository, /Math\.min\(Math\.max\(options\.limit \?\? 50, 1\), 100\)/);
  assert.match(repository, /LIMIT \$\{limit \+ 1\}/);
  assert.match(repository, /withPlatformReadDatabase/);
  assert.match(runtime, /set_config\('app\.platform_read', 'true', true\)/);
  for (const table of ["tenants", "campuses", "subscriptions", "school_invitations", "students"]) {
    assert.match(rls, new RegExp(`CREATE POLICY "${table}_platform_read"`));
  }
  assert.match(rls, /FOR SELECT USING \(app_platform_read_enabled\(\)\)/);
});

test("legacy school reader supports shadow comparison and explicit cutover", () => {
  const source = readFileSync(
    new URL("../server/schools/repository.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /repositoryBackend\(\) === "postgres"/);
  assert.match(source, /postgresShadowReadsEnabled\(\)/);
  assert.match(source, /PostgreSQL school shadow-read mismatch/);
});
