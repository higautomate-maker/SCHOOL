import assert from "node:assert/strict";
import {
  readFileSync,
  readdirSync,
} from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const sqliteMigrationPath =
  "drizzle/0010_mobile_identity_api.sql";

const postgresMigrationPath =
  "drizzle-postgres/0008_mobile_identity_api.sql";

const sqliteMigration = readFileSync(
  sqliteMigrationPath,
  "utf8",
);

const postgresMigration = readFileSync(
  postgresMigrationPath,
  "utf8",
);

function applySqliteMigrations(
  database: DatabaseSync,
): void {
  database.exec("PRAGMA foreign_keys = ON");

  const migrations = readdirSync("drizzle")
    .filter((name) => name.endsWith(".sql"))
    .sort();

  assert.equal(
    migrations.at(-1),
    "0011_mobile_refresh_rotation_guard.sql",
  );

  for (const migration of migrations) {
    const source = readFileSync(
      `drizzle/${migration}`,
      "utf8",
    ).replaceAll("--> statement-breakpoint", "");

    database.exec("BEGIN IMMEDIATE");

    try {
      database.exec(source);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");

      throw new Error(
        `SQLite test migration failed: ${migration}`,
        { cause: error },
      );
    }
  }
}

function insertFoundationRecords(
  database: DatabaseSync,
): {
  tenantA: string;
  tenantB: string;
  schoolUser: string;
  parentUser: string;
  transporterUser: string;
  studentA: string;
  studentB: string;
  parentIdentity: string;
  transporterIdentity: string;
} {
  const timestamp = "2026-08-02T09:30:00.000Z";

  const tenantA = "91000000-0000-4000-8000-000000000001";
  const tenantB = "91000000-0000-4000-8000-000000000002";

  const campusA = "92000000-0000-4000-8000-000000000001";
  const campusB = "92000000-0000-4000-8000-000000000002";

  const schoolUser = "93000000-0000-4000-8000-000000000001";
  const parentUser = "93000000-0000-4000-8000-000000000002";
  const transporterUser =
    "93000000-0000-4000-8000-000000000003";

  const studentA = "94000000-0000-4000-8000-000000000001";
  const studentB = "94000000-0000-4000-8000-000000000002";

  const parentIdentity =
    "95000000-0000-4000-8000-000000000001";

  const transporterIdentity =
    "95000000-0000-4000-8000-000000000002";

  const insertTenant = database.prepare(`
    INSERT INTO tenants (
      id,
      name,
      slug,
      status,
      country_code,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, 'active', 'IN', ?, ?)
  `);

  insertTenant.run(
    tenantA,
    "Stage 9 School A",
    "stage-9-school-a",
    timestamp,
    timestamp,
  );

  insertTenant.run(
    tenantB,
    "Stage 9 School B",
    "stage-9-school-b",
    timestamp,
    timestamp,
  );

  const insertUser = database.prepare(`
    INSERT INTO users (
      id,
      email,
      full_name,
      status,
      mfa_enabled,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, 'active', 0, ?, ?)
  `);

  insertUser.run(
    schoolUser,
    "stage9-school@example.invalid",
    "Stage 9 School User",
    timestamp,
    timestamp,
  );

  insertUser.run(
    parentUser,
    "stage9-parent@example.invalid",
    "Stage 9 Parent",
    timestamp,
    timestamp,
  );

  insertUser.run(
    transporterUser,
    "stage9-transporter@example.invalid",
    "Stage 9 Transporter",
    timestamp,
    timestamp,
  );

  const insertCampus = database.prepare(`
    INSERT INTO campuses (
      id,
      tenant_id,
      name,
      code,
      city,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, 'Test City', ?, ?)
  `);

  insertCampus.run(
    campusA,
    tenantA,
    "Campus A",
    "A",
    timestamp,
    timestamp,
  );

  insertCampus.run(
    campusB,
    tenantB,
    "Campus B",
    "B",
    timestamp,
    timestamp,
  );

  const insertStudent = database.prepare(`
    INSERT INTO students (
      id,
      tenant_id,
      campus_id,
      admission_number,
      roll_number,
      first_name,
      last_name,
      gender,
      date_of_birth,
      admission_date,
      class_name,
      section_name,
      guardian_name,
      guardian_phone,
      status,
      created_by,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      '',
      'other',
      '2015-01-01',
      '2026-04-01',
      'Class 5',
      'A',
      'Guardian',
      '+910000000000',
      'active',
      ?,
      ?,
      ?
    )
  `);

  insertStudent.run(
    studentA,
    tenantA,
    campusA,
    "A-001",
    "1",
    "Student A",
    schoolUser,
    timestamp,
    timestamp,
  );

  insertStudent.run(
    studentB,
    tenantB,
    campusB,
    "B-001",
    "1",
    "Student B",
    schoolUser,
    timestamp,
    timestamp,
  );

  database.prepare(`
    INSERT INTO memberships (
      tenant_id,
      user_id,
      role_key,
      campus_id,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, 'school_admin', ?, 'active', ?, ?)
  `).run(
    tenantA,
    schoolUser,
    campusA,
    timestamp,
    timestamp,
  );

  const insertIdentity = database.prepare(`
    INSERT INTO mobile_identities (
      id,
      tenant_id,
      user_id,
      audience,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `);

  insertIdentity.run(
    parentIdentity,
    tenantA,
    parentUser,
    "parent",
    timestamp,
    timestamp,
  );

  insertIdentity.run(
    transporterIdentity,
    tenantA,
    transporterUser,
    "transporter",
    timestamp,
    timestamp,
  );

  return {
    tenantA,
    tenantB,
    schoolUser,
    parentUser,
    transporterUser,
    studentA,
    studentB,
    parentIdentity,
    transporterIdentity,
  };
}

test("SQLite migrations through 0011 apply and create the mobile foundation", () => {
  const database = new DatabaseSync(":memory:");

  try {
    applySqliteMigrations(database);

    const tables = database.prepare(`
      SELECT name
        FROM sqlite_master
       WHERE type = 'table'
         AND name LIKE 'mobile_%'
       ORDER BY name
    `).all() as Array<{ name: string }>;

    assert.deepEqual(
      tables.map(({ name }) => name),
      [
        "mobile_identities",
        "mobile_identity_assignments",
        "mobile_refresh_token_uses",
        "mobile_sessions",
      ],
    );

    const triggers = database.prepare(`
      SELECT name
        FROM sqlite_master
       WHERE type = 'trigger'
         AND name LIKE 'mobile_%'
       ORDER BY name
    `).all() as Array<{ name: string }>;

    assert.deepEqual(
      triggers.map(({ name }) => name),
      [
        "mobile_identity_assignments_validate_insert",
        "mobile_identity_assignments_validate_update",
        "mobile_sessions_record_refresh_use",
        "mobile_sessions_validate_insert",
        "mobile_sessions_validate_refresh_rotation",
        "mobile_sessions_validate_update",
      ],
    );
  } finally {
    database.close();
  }
});

test("SQLite and PostgreSQL mobile schemas retain core parity", () => {
  for (const table of [
    "mobile_identities",
    "mobile_identity_assignments",
    "mobile_sessions",
    "mobile_refresh_token_uses",
  ]) {
    assert.match(
      sqliteMigration,
      new RegExp(`CREATE TABLE \`${table}\``),
    );

    assert.match(
      postgresMigration,
      new RegExp(`CREATE TABLE "${table}"`),
    );
  }

  for (const column of [
    "tenant_id",
    "user_id",
    "mobile_identity_id",
    "principal_type",
    "access_token_hash",
    "refresh_token_hash",
    "refresh_family_id",
    "refresh_rotation",
    "credential_version",
    "access_expires_at",
    "refresh_expires_at",
  ]) {
    assert.match(
      sqliteMigration,
      new RegExp(`\`${column}\``),
    );

    assert.match(
      postgresMigration,
      new RegExp(`"${column}"`),
    );
  }

  assert.doesNotMatch(
    sqliteMigration,
    /`access_token`\s+text/,
  );

  assert.doesNotMatch(
    sqliteMigration,
    /`refresh_token`\s+text/,
  );

  assert.doesNotMatch(
    sqliteMigration,
    /DISABLE ROW LEVEL SECURITY|BYPASSRLS/i,
  );
});

test("SQLite mobile assignments enforce tenant and persona boundaries", () => {
  const database = new DatabaseSync(":memory:");

  try {
    applySqliteMigrations(database);

    const records = insertFoundationRecords(database);
    const timestamp = "2026-08-02T09:30:00.000Z";

    const insertAssignment = database.prepare(`
      INSERT INTO mobile_identity_assignments (
        id,
        tenant_id,
        mobile_identity_id,
        resource_type,
        resource_id,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    `);

    assert.doesNotThrow(() => {
      insertAssignment.run(
        "96000000-0000-4000-8000-000000000001",
        records.tenantA,
        records.parentIdentity,
        "student",
        records.studentA,
        timestamp,
        timestamp,
      );
    });

    assert.throws(
      () => {
        insertAssignment.run(
          "96000000-0000-4000-8000-000000000002",
          records.tenantA,
          records.parentIdentity,
          "student",
          records.studentB,
          timestamp,
          timestamp,
        );
      },
      /Assigned Student is unavailable in this tenant/,
    );

    assert.throws(
      () => {
        insertAssignment.run(
          "96000000-0000-4000-8000-000000000003",
          records.tenantA,
          records.parentIdentity,
          "vehicle",
          "vehicle-not-enabled",
          timestamp,
          timestamp,
        );
      },
      /Parent and Student identities require a Student assignment/,
    );

    assert.throws(
      () => {
        insertAssignment.run(
          "96000000-0000-4000-8000-000000000004",
          records.tenantA,
          records.transporterIdentity,
          "vehicle",
          "vehicle-not-enabled",
          timestamp,
          timestamp,
        );
      },
      /Transport resource assignment is not enabled yet/,
    );
  } finally {
    database.close();
  }
});

test("SQLite mobile sessions enforce School and persona relationships", () => {
  const database = new DatabaseSync(":memory:");

  try {
    applySqliteMigrations(database);

    const records = insertFoundationRecords(database);

    const issuedAt = "2026-08-02T09:30:00.000Z";
    const accessExpiresAt = "2026-08-02T09:45:00.000Z";
    const refreshExpiresAt = "2026-09-01T09:30:00.000Z";

    const insertSession = database.prepare(`
      INSERT INTO mobile_sessions (
        id,
        tenant_id,
        user_id,
        mobile_identity_id,
        principal_type,
        access_token_hash,
        refresh_token_hash,
        refresh_family_id,
        refresh_rotation,
        credential_version,
        issued_at,
        last_seen_at,
        access_expires_at,
        refresh_expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?)
    `);

    assert.doesNotThrow(() => {
      insertSession.run(
        "97000000-0000-4000-8000-000000000001",
        records.tenantA,
        records.schoolUser,
        null,
        "school",
        "a".repeat(64),
        "b".repeat(64),
        "98000000-0000-4000-8000-000000000001",
        issuedAt,
        issuedAt,
        accessExpiresAt,
        refreshExpiresAt,
      );
    });

    assert.doesNotThrow(() => {
      insertSession.run(
        "97000000-0000-4000-8000-000000000002",
        records.tenantA,
        records.parentUser,
        records.parentIdentity,
        "parent",
        "c".repeat(64),
        "d".repeat(64),
        "98000000-0000-4000-8000-000000000002",
        issuedAt,
        issuedAt,
        accessExpiresAt,
        refreshExpiresAt,
      );
    });

    assert.throws(
      () => {
        insertSession.run(
          "97000000-0000-4000-8000-000000000003",
          records.tenantA,
          records.transporterUser,
          null,
          "school",
          "e".repeat(64),
          "f".repeat(64),
          "98000000-0000-4000-8000-000000000003",
          issuedAt,
          issuedAt,
          accessExpiresAt,
          refreshExpiresAt,
        );
      },
      /Active School membership is required/,
    );

    assert.throws(
      () => {
        insertSession.run(
          "97000000-0000-4000-8000-000000000004",
          records.tenantA,
          records.parentUser,
          records.parentIdentity,
          "student",
          "1".repeat(64),
          "2".repeat(64),
          "98000000-0000-4000-8000-000000000004",
          issuedAt,
          issuedAt,
          accessExpiresAt,
          refreshExpiresAt,
        );
      },
      /Mobile principal does not match the relationship/,
    );
  } finally {
    database.close();
  }
});
