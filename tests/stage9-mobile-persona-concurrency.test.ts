import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

const temporaryDirectory = mkdtempSync(
  join(tmpdir(), "hig-stage9-mobile-personas-"),
);
Object.assign(process.env, {
  NODE_ENV: "test",
  HIG_REPOSITORY_BACKEND: "sqlite",
  HIG_DEMO_DB_PATH: join(temporaryDirectory, "personas.sqlite"),
  HIG_SQLITE_MIGRATIONS_PATH: resolve("drizzle"),
  HIG_SECURITY_HASH_KEY: "stage9-mobile-persona-concurrency-key",
  HIG_REDIS_NAMESPACE: `stage9-mobile-personas:${process.pid}:${Date.now()}:`,
});
after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));

const { database } = await import("#db-runtime");
const { hashPassword } = await import("../server/auth/password.ts");
const { hashMobileToken } = await import("../server/mobile-auth/tokens.ts");
const repository = await import("../server/mobile-auth/repository.ts");
const {
  authenticateMobilePassword,
  effectiveAccessForPrincipal,
  parseMobileLoginInput,
} = await import("../server/mobile-auth/service.ts");

const timestamp = "2026-08-02T12:00:00.000Z";
const tenantId = "d1000000-0000-4000-8000-000000000001";
const otherTenantId = "d1000000-0000-4000-8000-000000000002";
const campusId = "d2000000-0000-4000-8000-000000000001";
const planId = "d3000000-0000-4000-8000-000000000001";
const unrelatedPlanId = "d3000000-0000-4000-8000-000000000002";
const subscriptionId = "d4000000-0000-4000-8000-000000000001";
const studentRecordId = "d5000000-0000-4000-8000-000000000001";
const roleId = "d6000000-0000-4000-8000-000000000001";

const users = {
  school: {
    id: "d7000000-0000-4000-8000-000000000001",
    email: "persona-school@example.invalid",
    name: "Persona School User",
    identityId: null,
  },
  parent: {
    id: "d7000000-0000-4000-8000-000000000002",
    email: "persona-parent@example.invalid",
    name: "Persona Parent",
    identityId: "d8000000-0000-4000-8000-000000000001",
  },
  student: {
    id: "d7000000-0000-4000-8000-000000000003",
    email: "persona-student@example.invalid",
    name: "Persona Student",
    identityId: "d8000000-0000-4000-8000-000000000002",
  },
  transporter: {
    id: "d7000000-0000-4000-8000-000000000004",
    email: "persona-transporter@example.invalid",
    name: "Persona Transporter",
    identityId: "d8000000-0000-4000-8000-000000000003",
  },
} as const;

const password = "Stage 9 all persona password विद्यालय 2026";
const metadata = {
  deviceIdHash: "1".repeat(64),
  devicePlatform: "android",
  appVersion: "1.2.0",
  ipHash: "2".repeat(64),
  userAgentHash: "3".repeat(64),
};

function request(index: number): Request {
  return new Request("https://mobile-personas.test/api/v1/mobile", {
    headers: {
      "x-forwarded-for": `198.51.100.${100 + index}`,
      "user-agent": `HIGSchoolPersona/${index}`,
    },
  });
}

async function seed(): Promise<void> {
  for (const [id, name, slug] of [
    [tenantId, "Persona School", "persona-school"],
    [otherTenantId, "Other Persona School", "other-persona-school"],
  ] as const) {
    await database.prepare(`
      INSERT INTO tenants (
        id, name, slug, status, country_code, created_at, updated_at
      ) VALUES (?, ?, ?, 'active', 'IN', ?, ?)
    `).bind(id, name, slug, timestamp, timestamp).run();
  }

  await database.prepare(`
    INSERT INTO campuses (
      id, tenant_id, name, code, created_at, updated_at
    ) VALUES (?, ?, 'Main', 'MAIN', ?, ?)
  `).bind(campusId, tenantId, timestamp, timestamp).run();

  const passwordHash = await hashPassword(password);
  for (const user of Object.values(users)) {
    await database.prepare(`
      INSERT INTO users (
        id, email, full_name, status, mfa_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, 'active', 0, ?, ?)
    `).bind(user.id, user.email, user.name, timestamp, timestamp).run();
    await database.prepare(`
      INSERT INTO auth_credentials (
        user_id, password_hash, credential_version, must_change_password,
        password_changed_at, created_at, updated_at
      ) VALUES (?, ?, 1, 0, ?, ?, ?)
    `).bind(user.id, passwordHash, timestamp, timestamp, timestamp).run();
  }

  await database.prepare(`
    INSERT INTO memberships (
      tenant_id, user_id, role_key, campus_id, status, created_at, updated_at
    ) VALUES (?, ?, 'school_admin', ?, 'active', ?, ?)
  `).bind(tenantId, users.school.id, campusId, timestamp, timestamp).run();

  for (const [id, name] of [
    [planId, "Subscribed Plan"],
    [unrelatedPlanId, "Unrelated Plan"],
  ] as const) {
    await database.prepare(`
      INSERT INTO plans (
        id, name, monthly_price_paise, annual_price_paise,
        active, created_at, updated_at
      ) VALUES (?, ?, 100000, 1000000, 1, ?, ?)
    `).bind(id, name, timestamp, timestamp).run();
  }
  await database.prepare(`
    INSERT INTO subscriptions (
      id, tenant_id, plan_id, status, period_ends_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'active', '2027-03-31T00:00:00.000Z', ?, ?)
  `).bind(subscriptionId, tenantId, planId, timestamp, timestamp).run();

  await database.prepare(`
    INSERT INTO roles (
      id, tenant_id, name, key, system, description,
      created_by, created_at, updated_at
    ) VALUES (?, ?, 'School Admin', 'school_admin', 1, '', ?, ?, ?)
  `).bind(roleId, tenantId, users.school.id, timestamp, timestamp).run();
  await database.prepare(`
    INSERT INTO role_permissions (role_id, permission, created_at)
    VALUES (?, 'students.view', ?)
  `).bind(roleId, timestamp).run();

  for (const moduleKey of [
    "student_information",
    "attendance",
    "academics",
    "transport",
  ]) {
    await database.prepare(`
      INSERT INTO module_policies (
        tenant_id, module_key, enabled, source, updated_at, updated_by
      ) VALUES (?, ?, 1, 'plan', ?, ?)
    `).bind(tenantId, moduleKey, timestamp, users.school.id).run();
  }

  for (const [audience, featureKey] of [
    ["parent", "child_overview"],
    ["student", "attendance"],
    ["transporter", "pickup_list"],
  ] as const) {
    await database.prepare(`
      INSERT INTO plan_app_feature_policies (
        plan_id, audience, feature_key, enabled,
        configuration, updated_at, updated_by
      ) VALUES (?, ?, ?, 1, '{}', ?, ?)
    `).bind(planId, audience, featureKey, timestamp, users.school.id).run();
  }

  // These features would pass their module dependencies if an unrelated plan
  // were accidentally included in effective access.
  for (const [audience, featureKey] of [
    ["student", "homework"],
    ["transporter", "gps_tracking"],
  ] as const) {
    await database.prepare(`
      INSERT INTO plan_app_feature_policies (
        plan_id, audience, feature_key, enabled,
        configuration, updated_at, updated_by
      ) VALUES (?, ?, ?, 1, '{}', ?, ?)
    `).bind(
      unrelatedPlanId,
      audience,
      featureKey,
      timestamp,
      users.school.id,
    ).run();
  }

  await database.prepare(`
    INSERT INTO students (
      id, tenant_id, campus_id, admission_number, roll_number,
      first_name, last_name, gender, date_of_birth, admission_date,
      class_name, section_name, guardian_name, guardian_phone, status,
      created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, 'PERSONA-001', '1', 'Persona', 'Student', 'other',
      '2015-01-01', '2026-04-01', 'Class 5', 'A', 'Persona Parent',
      '+910000000000', 'active', ?, ?, ?
    )
  `).bind(
    studentRecordId,
    tenantId,
    campusId,
    users.school.id,
    timestamp,
    timestamp,
  ).run();

  for (const principalType of ["parent", "student", "transporter"] as const) {
    const user = users[principalType];
    await database.prepare(`
      INSERT INTO mobile_identities (
        id, tenant_id, user_id, audience, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'active', ?, ?)
    `).bind(
      user.identityId,
      tenantId,
      user.id,
      principalType,
      timestamp,
      timestamp,
    ).run();
    await database.prepare(`
      INSERT INTO mobile_identity_assignments (
        id, tenant_id, mobile_identity_id, resource_type, resource_id,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, 'student', ?, 'active', ?, ?)
    `).bind(
      crypto.randomUUID(),
      tenantId,
      user.identityId,
      studentRecordId,
      timestamp,
      timestamp,
    ).run();
  }
}

await seed();

async function authenticate(
  principalType: keyof typeof users,
  index: number,
) {
  return authenticateMobilePassword(
    parseMobileLoginInput({
      email: users[principalType].email,
      password,
      tenantId,
      principalType,
      deviceId: `persona-device-${principalType}`,
      devicePlatform: "android",
      appVersion: "1.2.0",
    }),
    request(index),
  );
}

test("School, Parent, Student, and Transporter mobile principals authenticate", async () => {
  for (const [index, principalType] of (
    ["school", "parent", "student", "transporter"] as const
  ).entries()) {
    const result = await authenticate(principalType, index);
    assert.equal(result.status, "authenticated");
    if (result.status !== "authenticated") {
      throw new Error(`${principalType} did not authenticate`);
    }
    assert.equal(result.session.tenantId, tenantId);
    assert.equal(result.session.principalType, principalType);
    assert.equal(
      result.session.mobileIdentityId,
      users[principalType].identityId,
    );
  }
});

test("persona access uses only the subscribed plan and server assignments", async () => {
  for (const [index, expected] of [
    ["parent", ["child_overview"]],
    ["student", ["attendance"]],
    ["transporter", ["pickup_list"]],
  ] as const) {
    const result = await authenticate(index, expected.length + 10);
    assert.equal(result.status, "authenticated");
    if (result.status !== "authenticated") throw new Error("Login failed");
    const principal = await repository.resolveMobileAccessToken(
      result.session.accessToken,
    );
    assert.ok(principal);
    const access = await effectiveAccessForPrincipal(principal);
    assert.deepEqual(
      access.features.map((feature) => feature.key),
      [...expected],
    );
    assert.deepEqual(
      access.assignments.map((assignment) => assignment.resourceId),
      [studentRecordId],
    );
  }
});

test("a rotated access token cannot revoke the replacement session", async () => {
  const login = await repository.findMobileLoginRecord({
    email: users.parent.email,
    tenantId,
    principalType: "parent",
  });
  assert.ok(login);
  const original = await repository.createMobileSession({ login, metadata });
  const rotated = await repository.rotateMobileRefreshToken(
    original.refreshToken,
    metadata,
  );
  assert.equal(rotated.status, "rotated");
  if (rotated.status !== "rotated") throw new Error("Refresh did not rotate");

  await repository.revokeMobileSessionByAccessToken(
    original.accessToken,
    "logout",
  );

  const replacement = await repository.resolveMobileAccessToken(
    rotated.session.accessToken,
  );
  assert.ok(replacement);
  assert.equal(replacement.sessionId, original.sessionId);
});

test("duplicate concurrent refresh permits one rotation then revokes the replayed family", async () => {
  const login = await repository.findMobileLoginRecord({
    email: users.parent.email,
    tenantId,
    principalType: "parent",
  });
  assert.ok(login);
  const session = await repository.createMobileSession({ login, metadata });
  const results = await Promise.all([
    repository.rotateMobileRefreshToken(session.refreshToken, metadata),
    repository.rotateMobileRefreshToken(session.refreshToken, metadata),
  ]);
  assert.deepEqual(
    results.map((result) => result.status).sort(),
    ["replay", "rotated"],
  );
  const rotated = results.find((result) => result.status === "rotated");
  assert.ok(rotated && rotated.status === "rotated");
  assert.equal(
    await repository.resolveMobileAccessToken(rotated.session.accessToken),
    null,
  );
  const active = await database.prepare(`
    SELECT COUNT(*) AS count
    FROM mobile_token_locators
    WHERE refresh_family_id = ? AND state = 'active'
  `).bind(session.refreshFamilyId).first<{ count: number }>();
  assert.equal(Number(active?.count ?? -1), 0);
});


test("expired access tokens can still use a valid refresh token", async () => {
  const login = await repository.findMobileLoginRecord({
    email: users.student.email,
    tenantId,
    principalType: "student",
  });
  assert.ok(login);
  const session = await repository.createMobileSession({
    login,
    metadata,
    issuedAt: new Date(Date.now() - 20 * 60_000),
  });

  assert.equal(
    await repository.resolveMobileAccessToken(session.accessToken),
    null,
  );
  const locator = await database.prepare(`
    SELECT state FROM mobile_token_locators
    WHERE token_hash = ? AND token_kind = 'access'
  `).bind(hashMobileToken(session.accessToken))
    .first<{ state: string }>();
  assert.equal(locator?.state, "expired");

  const refreshed = await repository.rotateMobileRefreshToken(
    session.refreshToken,
    metadata,
  );
  assert.equal(refreshed.status, "rotated");
});

test("expired mobile sessions cannot resolve or refresh", async () => {
  const login = await repository.findMobileLoginRecord({
    email: users.student.email,
    tenantId,
    principalType: "student",
  });
  assert.ok(login);
  const session = await repository.createMobileSession({
    login,
    metadata,
    issuedAt: new Date("2025-01-01T00:00:00.000Z"),
  });
  assert.equal(await repository.resolveMobileAccessToken(session.accessToken), null);
  assert.deepEqual(
    await repository.rotateMobileRefreshToken(session.refreshToken, metadata),
    { status: "invalid" },
  );
});

test("SQLite rejects partial or metadata-only token rotation", async () => {
  const login = await repository.findMobileLoginRecord({
    email: users.transporter.email,
    tenantId,
    principalType: "transporter",
  });
  assert.ok(login);
  const session = await repository.createMobileSession({ login, metadata });

  await assert.rejects(
    database.prepare(`
      UPDATE mobile_sessions
         SET access_token_hash = ?
       WHERE id = ?
    `).bind("4".repeat(64), session.sessionId).run(),
    /rotation must remain atomic/i,
  );
  await assert.rejects(
    database.prepare(`
      UPDATE mobile_sessions
         SET refresh_rotation = refresh_rotation + 1
       WHERE id = ?
    `).bind(session.sessionId).run(),
    /rotation must remain atomic/i,
  );
  await assert.rejects(
    database.prepare(`
      UPDATE mobile_sessions
         SET access_token_hash = ?,
             refresh_token_hash = ?,
             refresh_rotation = refresh_rotation + 2
       WHERE id = ?
    `).bind(
      "5".repeat(64),
      "6".repeat(64),
      session.sessionId,
    ).run(),
    /rotation must remain atomic/i,
  );
  await assert.rejects(
    database.prepare(`
      UPDATE mobile_sessions
         SET access_token_hash = ?,
             refresh_token_hash = ?,
             refresh_rotation = refresh_rotation + 1,
             refresh_family_id = ?
       WHERE id = ?
    `).bind(
      "7".repeat(64),
      "8".repeat(64),
      crypto.randomUUID(),
      session.sessionId,
    ).run(),
    /rotation must remain atomic/i,
  );
});
