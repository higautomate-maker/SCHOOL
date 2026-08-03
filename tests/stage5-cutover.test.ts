import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { readSqliteMigrationSnapshot } from "../scripts/sqlite-postgres-migration.ts";
import { validateProductionEnvironment } from "../server/runtime/production-environment.ts";

test("production remains SQLite by default without requiring cutover secrets", () => {
  assert.equal(validateProductionEnvironment({}), null);
});

test("safe migration command is ordered, checksummed, locked, and never seeds production", () => {
  const source = readFileSync(
    new URL("../scripts/migrate-postgres.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /\.filter\(\(name\) => name\.endsWith\("\.sql"\)\)\s*\.sort\(\)/);
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /pg_advisory_lock/);
  assert.match(source, /migration ledger is not an ordered prefix/);
  assert.match(source, /Applied migration checksum mismatch/);
  assert.match(source, /MIGRATION_DATABASE_URL \|\| process\.env\.DATABASE_URL/);
  assert.doesNotMatch(source, /seed-demo|db:seed/);
});

test("greenfield acceptance starts empty and covers onboarding, replay, rollback, and restore", () => {
  const infrastructure = readFileSync(
    new URL("../scripts/test-integration-infra.mjs", import.meta.url),
    "utf8",
  );
  const greenfield = readFileSync(
    new URL("../scripts/test-greenfield-postgres.ts", import.meta.url),
    "utf8",
  );
  assert.match(infrastructure, /hig_school_greenfield_test/);
  assert.match(infrastructure, /create-stage5-migration-fixture\.ts[\s\S]*--empty/);
  assert.match(infrastructure, /checkPostgresMigrations\(migrationUrl\)/);
  assert.match(infrastructure, /runGreenfieldIntegration/);
  assert.match(infrastructure, /hig_school_restore_test/);
  assert.match(greenfield, /users: "0", plans: "0", tenants: "0"/);
  assert.match(greenfield, /createPostgresSchool/);
  assert.match(greenfield, /greenfield-school-rollback/);
  assert.match(greenfield, /findPostgresSchoolCreationReplay/);
  assert.match(greenfield, /role\.key === "school_admin"/);
  assert.match(greenfield, /persistedSchoolAdmin\.system, true/);
  assert.match(greenfield, /persistedTeacher\.system, false/);
  assert.match(greenfield, /\["attendance\.manage", "students\.view"\]/);
  assert.match(greenfield, /new Set\(persistedRoles\.map\(\(role\) => role\.key\)\)\.size, 2/);
  assert.match(greenfield, /exceeds the outstanding balance/);
  assert.match(greenfield, /outbox/);
});

test("SQLite dry run blocks incompatible identifiers, timestamps, and statuses", () => {
  const directory = mkdtempSync(join(tmpdir(), "hig-stage5-invalid-"));
  const path = join(directory, "source.sqlite");
  const database = new DatabaseSync(path);
  try {
    database.exec(`
      CREATE TABLE users (
        id text PRIMARY KEY NOT NULL,
        email text NOT NULL,
        full_name text NOT NULL,
        status text NOT NULL,
        mfa_enabled integer NOT NULL,
        created_at text NOT NULL,
        updated_at text NOT NULL
      );
      INSERT INTO users VALUES (
        'usr_legacy', 'invalid@example.test', 'Invalid Fixture',
        'unexpected', 1, 'not-a-timestamp', '2026-07-30T12:00:00.000Z'
      );
    `);
  } finally {
    database.close();
  }
  try {
    const kinds = readSqliteMigrationSnapshot(path).issues.map((issue) => issue.kind);
    assert.ok(kinds.includes("incompatible_identifier"));
    assert.ok(kinds.includes("invalid_timestamp"));
    assert.ok(kinds.includes("invalid_status"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
