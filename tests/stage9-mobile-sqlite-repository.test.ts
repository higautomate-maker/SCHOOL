import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import {
  tmpdir,
} from "node:os";
import {
  join,
  resolve,
} from "node:path";
import {
  after,
  test,
} from "node:test";

const temporaryDirectory = mkdtempSync(
  join(tmpdir(), "hig-stage9-mobile-repository-"),
);

const databasePath = join(
  temporaryDirectory,
  "mobile-repository.sqlite",
);

Object.assign(process.env, { NODE_ENV: "test" });
process.env.HIG_REPOSITORY_BACKEND = "sqlite";
process.env.HIG_DEMO_DB_PATH = databasePath;
process.env.HIG_SQLITE_MIGRATIONS_PATH =
  resolve("drizzle");

after(() => {
  rmSync(temporaryDirectory, {
    recursive: true,
    force: true,
  });
});

const { database } = await import("#db-runtime");
const repository = await import(
  "../server/mobile-auth/repository.ts"
);

const timestamp = "2026-08-02T10:00:00.000Z";

const tenantId =
  "a1000000-0000-4000-8000-000000000001";

const otherTenantId =
  "a1000000-0000-4000-8000-000000000002";

const campusId =
  "a2000000-0000-4000-8000-000000000001";

const schoolUserId =
  "a3000000-0000-4000-8000-000000000001";

const parentUserId =
  "a3000000-0000-4000-8000-000000000002";

const studentId =
  "a4000000-0000-4000-8000-000000000001";

const parentIdentityId =
  "a5000000-0000-4000-8000-000000000001";

const assignmentId =
  "a6000000-0000-4000-8000-000000000001";

const metadata = {
  deviceIdHash: "device-hash",
  devicePlatform: "android",
  appVersion: "1.0.0",
  ipHash: "ip-hash",
  userAgentHash: "agent-hash",
};

async function seed(): Promise<void> {
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

  await insertTenant.bind(
    tenantId,
    "Stage 9 Repository School",
    "stage-9-repository-school",
    timestamp,
    timestamp,
  ).run();

  await insertTenant.bind(
    otherTenantId,
    "Other Stage 9 School",
    "other-stage-9-school",
    timestamp,
    timestamp,
  ).run();

  await database.prepare(`
    INSERT INTO campuses (
      id,
      tenant_id,
      name,
      code,
      city,
      created_at,
      updated_at
    )
    VALUES (?, ?, 'Main Campus', 'MAIN', 'Test City', ?, ?)
  `).bind(
    campusId,
    tenantId,
    timestamp,
    timestamp,
  ).run();

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

  await insertUser.bind(
    schoolUserId,
    "mobile-school@example.invalid",
    "Mobile School User",
    timestamp,
    timestamp,
  ).run();

  await insertUser.bind(
    parentUserId,
    "mobile-parent@example.invalid",
    "Mobile Parent User",
    timestamp,
    timestamp,
  ).run();

  const insertCredential = database.prepare(`
    INSERT INTO auth_credentials (
      user_id,
      password_hash,
      credential_version,
      must_change_password,
      password_changed_at,
      created_at,
      updated_at
    )
    VALUES (?, ?, 1, 0, ?, ?, ?)
  `);

  await insertCredential.bind(
    schoolUserId,
    "school-password-hash-not-a-secret",
    timestamp,
    timestamp,
    timestamp,
  ).run();

  await insertCredential.bind(
    parentUserId,
    "parent-password-hash-not-a-secret",
    timestamp,
    timestamp,
    timestamp,
  ).run();

  await database.prepare(`
    INSERT INTO memberships (
      tenant_id,
      user_id,
      role_key,
      campus_id,
      status,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      ?,
      'school_admin',
      ?,
      'active',
      ?,
      ?
    )
  `).bind(
    tenantId,
    schoolUserId,
    campusId,
    timestamp,
    timestamp,
  ).run();

  await database.prepare(`
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
      'STAGE9-001',
      '1',
      'Repository',
      'Student',
      'other',
      '2015-01-01',
      '2026-04-01',
      'Class 5',
      'A',
      'Mobile Parent User',
      '+910000000000',
      'active',
      ?,
      ?,
      ?
    )
  `).bind(
    studentId,
    tenantId,
    campusId,
    schoolUserId,
    timestamp,
    timestamp,
  ).run();

  await database.prepare(`
    INSERT INTO mobile_identities (
      id,
      tenant_id,
      user_id,
      audience,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, 'parent', 'active', ?, ?)
  `).bind(
    parentIdentityId,
    tenantId,
    parentUserId,
    timestamp,
    timestamp,
  ).run();

  await database.prepare(`
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
    VALUES (
      ?,
      ?,
      ?,
      'student',
      ?,
      'active',
      ?,
      ?
    )
  `).bind(
    assignmentId,
    tenantId,
    parentIdentityId,
    studentId,
    timestamp,
    timestamp,
  ).run();
}

await seed();

test("SQLite mobile repository resolves approved login relationships", async () => {
  const school = await repository.findMobileLoginRecord({
    email: " MOBILE-SCHOOL@example.invalid ",
    tenantId,
    principalType: "school",
  });

  assert.ok(school);
  assert.equal(school.userId, schoolUserId);
  assert.equal(school.relationshipStatus, "active");
  assert.equal(school.roleKey, "school_admin");
  assert.equal(school.mobileIdentityId, null);

  const parent = await repository.findMobileLoginRecord({
    email: "mobile-parent@example.invalid",
    tenantId,
    principalType: "parent",
  });

  assert.ok(parent);
  assert.equal(parent.userId, parentUserId);
  assert.equal(parent.relationshipStatus, "active");
  assert.equal(
    parent.mobileIdentityId,
    parentIdentityId,
  );
  assert.equal(parent.roleKey, null);

  const wrongTenant = await repository.findMobileLoginRecord({
    email: "mobile-parent@example.invalid",
    tenantId: otherTenantId,
    principalType: "parent",
  });

  assert.ok(wrongTenant);
  assert.equal(wrongTenant.relationshipStatus, null);
  assert.equal(wrongTenant.mobileIdentityId, null);

  const wrongPersona = await repository.findMobileLoginRecord({
    email: "mobile-parent@example.invalid",
    tenantId,
    principalType: "student",
  });

  assert.ok(wrongPersona);
  assert.equal(wrongPersona.relationshipStatus, null);
  assert.equal(wrongPersona.mobileIdentityId, null);
});

test("SQLite mobile sessions store hashes and resolve access tokens", async () => {
  const schoolLogin =
    await repository.findMobileLoginRecord({
      email: "mobile-school@example.invalid",
      tenantId,
      principalType: "school",
    });

  const parentLogin =
    await repository.findMobileLoginRecord({
      email: "mobile-parent@example.invalid",
      tenantId,
      principalType: "parent",
    });

  assert.ok(schoolLogin);
  assert.ok(parentLogin);

  const schoolSession =
    await repository.createMobileSession({
      login: schoolLogin,
      metadata,
    });

  const parentSession =
    await repository.createMobileSession({
      login: parentLogin,
      metadata,
    });

  const stored = await database.prepare(`
    SELECT
      access_token_hash,
      refresh_token_hash
    FROM mobile_sessions
    ORDER BY issued_at
  `).all<Record<string, unknown>>();

  const serialized = JSON.stringify(stored.results);

  for (const rawToken of [
    schoolSession.accessToken,
    schoolSession.refreshToken,
    parentSession.accessToken,
    parentSession.refreshToken,
  ]) {
    assert.equal(serialized.includes(rawToken), false);
  }

  const locators = await database.prepare(`
    SELECT token_hash AS tokenHash, token_kind AS tokenKind,
           tenant_id AS tenantId, session_id AS sessionId, state
    FROM mobile_token_locators
    ORDER BY session_id, token_kind
  `).all<{
    tokenHash: string;
    tokenKind: string;
    tenantId: string;
    sessionId: string;
    state: string;
  }>();

  assert.equal(locators.results.length, 4);
  assert.ok(locators.results.every((locator) =>
    /^[a-f0-9]{64}$/.test(locator.tokenHash)
      && locator.tenantId === tenantId
      && locator.state === "active"
  ));
  const locatorSerialized = JSON.stringify(locators.results);
  for (const rawToken of [
    schoolSession.accessToken,
    schoolSession.refreshToken,
    parentSession.accessToken,
    parentSession.refreshToken,
  ]) {
    assert.equal(locatorSerialized.includes(rawToken), false);
  }

  const schoolActor =
    await repository.resolveMobileAccessToken(
      schoolSession.accessToken,
    );

  assert.ok(schoolActor);
  assert.equal(schoolActor.userId, schoolUserId);
  assert.equal(schoolActor.tenantId, tenantId);
  assert.equal(schoolActor.principalType, "school");
  assert.equal(schoolActor.mobileIdentityId, null);

  const parentActor =
    await repository.resolveMobileAccessToken(
      parentSession.accessToken,
    );

  assert.ok(parentActor);
  assert.equal(parentActor.userId, parentUserId);
  assert.equal(parentActor.principalType, "parent");
  assert.equal(
    parentActor.mobileIdentityId,
    parentIdentityId,
  );

  const assignments =
    await repository.listActiveMobileAssignments(
      tenantId,
      parentIdentityId,
    );

  assert.deepEqual(
    assignments.map((assignment) => ({
      resourceType: assignment.resourceType,
      resourceId: assignment.resourceId,
    })),
    [{
      resourceType: "student",
      resourceId: studentId,
    }],
  );

  const rotated =
    await repository.rotateMobileRefreshToken(
      parentSession.refreshToken,
      {
        ...metadata,
        appVersion: "1.0.1",
      },
    );

  assert.equal(rotated.status, "rotated");

  if (rotated.status !== "rotated") {
    throw new Error("Parent refresh did not rotate");
  }

  assert.notEqual(
    rotated.session.accessToken,
    parentSession.accessToken,
  );

  assert.notEqual(
    rotated.session.refreshToken,
    parentSession.refreshToken,
  );

  assert.equal(
    rotated.session.refreshFamilyId,
    parentSession.refreshFamilyId,
  );

  assert.equal(
    await repository.resolveMobileAccessToken(
      parentSession.accessToken,
    ),
    null,
  );

  const rotatedActor =
    await repository.resolveMobileAccessToken(
      rotated.session.accessToken,
    );

  assert.ok(rotatedActor);
  assert.equal(rotatedActor.userId, parentUserId);

  const recordedUse = await database.prepare(`
    SELECT
      token_hash AS tokenHash,
      rotation
    FROM mobile_refresh_token_uses
    WHERE session_id = ?
  `).bind(
    parentSession.sessionId,
  ).first<{
    tokenHash: string;
    rotation: number;
  }>();

  assert.ok(recordedUse);
  assert.equal(recordedUse.rotation, 0);
  assert.match(recordedUse.tokenHash, /^[a-f0-9]{64}$/);


  const locatorStates = await database.prepare(`
    SELECT token_hash AS tokenHash, token_kind AS tokenKind, state
    FROM mobile_token_locators
    WHERE session_id = ?
    ORDER BY created_at, token_kind
  `).bind(parentSession.sessionId).all<{
    tokenHash: string;
    tokenKind: string;
    state: string;
  }>();

  assert.deepEqual(
    locatorStates.results.map(({ tokenKind, state }) => ({ tokenKind, state })),
    [
      { tokenKind: "access", state: "revoked" },
      { tokenKind: "refresh", state: "used" },
      { tokenKind: "access", state: "active" },
      { tokenKind: "refresh", state: "active" },
    ],
  );

  const replay =
    await repository.rotateMobileRefreshToken(
      parentSession.refreshToken,
      metadata,
    );

  assert.equal(replay.status, "replay");

  assert.equal(
    await repository.resolveMobileAccessToken(
      rotated.session.accessToken,
    ),
    null,
  );

  const replayState = await database.prepare(`
    SELECT
      revoked_at AS revokedAt,
      revoke_reason AS revokeReason
    FROM mobile_sessions
    WHERE id = ?
  `).bind(
    parentSession.sessionId,
  ).first<{
    revokedAt: string | null;
    revokeReason: string | null;
  }>();

  assert.ok(replayState?.revokedAt);
  assert.equal(
    replayState.revokeReason,
    "refresh_replay",
  );


  const activeLocatorsAfterReplay = await database.prepare(`
    SELECT COUNT(*) AS count
    FROM mobile_token_locators
    WHERE refresh_family_id = ? AND state = 'active'
  `).bind(parentSession.refreshFamilyId).first<{ count: number }>();
  assert.equal(Number(activeLocatorsAfterReplay?.count ?? -1), 0);

  await database.prepare(`
    UPDATE auth_credentials
       SET credential_version = credential_version + 1
     WHERE user_id = ?
  `).bind(
    schoolUserId,
  ).run();

  assert.equal(
    await repository.resolveMobileAccessToken(
      schoolSession.accessToken,
    ),
    null,
  );

  const schoolRevocation = await database.prepare(`
    SELECT revoke_reason AS revokeReason
    FROM mobile_sessions
    WHERE id = ?
  `).bind(
    schoolSession.sessionId,
  ).first<{
    revokeReason: string | null;
  }>();

  assert.equal(
    schoolRevocation?.revokeReason,
    "invalid_or_expired",
  );
});

test("SQLite mobile revocation and relationship invalidation are fail-closed", async () => {
  const parentLogin =
    await repository.findMobileLoginRecord({
      email: "mobile-parent@example.invalid",
      tenantId,
      principalType: "parent",
    });

  assert.ok(parentLogin);

  const relationshipSession =
    await repository.createMobileSession({
      login: parentLogin,
      metadata,
    });

  await database.prepare(`
    UPDATE mobile_identities
       SET status = 'suspended',
           updated_at = ?
     WHERE id = ?
  `).bind(
    new Date().toISOString(),
    parentIdentityId,
  ).run();

  assert.equal(
    await repository.resolveMobileAccessToken(
      relationshipSession.accessToken,
    ),
    null,
  );

  await repository.revokeMobileSession(
    tenantId,
    relationshipSession.sessionId,
    "logout",
  );

  await repository.revokeMobileSession(
    tenantId,
    relationshipSession.sessionId,
    "logout",
  );

  await repository.revokeMobileSessionByAccessToken(
    "not-a-valid-token",
    "logout",
  );

  await repository.revokeMobileUserSessions(
    parentUserId,
    "account_suspended",
  );

  const activeSessions = await database.prepare(`
    SELECT COUNT(*) AS count
    FROM mobile_sessions
    WHERE user_id = ?
      AND revoked_at IS NULL
  `).bind(
    parentUserId,
  ).first<{ count: number }>();

  assert.equal(Number(activeSessions?.count ?? -1), 0);
});

test("PostgreSQL mobile repository dispatch is implemented and locator-bound", async () => {
  const { readFile } = await import("node:fs/promises");
  const dispatch = await readFile(
    "server/mobile-auth/repository.ts",
    "utf8",
  );
  const postgres = await readFile(
    "server/mobile-auth/postgres-repository.ts",
    "utf8",
  );

  assert.match(dispatch, /import\("\.\/postgres-repository\.ts"\)/);
  assert.doesNotMatch(
    dispatch,
    /Mobile PostgreSQL repository is not implemented/,
  );
  assert.match(postgres, /FROM mobile_token_locators/);
  assert.match(postgres, /FOR UPDATE/);
  assert.match(
    postgres,
    /set_config\('app\.tenant_id', \$1::text, true\)/,
  );
  assert.match(
    postgres,
    /set_config\('app\.mobile_auth_service', 'true', true\)/,
  );
  assert.doesNotMatch(postgres, /BYPASSRLS|SECURITY DEFINER/i);
});
