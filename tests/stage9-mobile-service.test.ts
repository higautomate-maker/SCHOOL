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
  join(tmpdir(), "hig-stage9-mobile-service-"),
);

const databasePath = join(
  temporaryDirectory,
  "mobile-service.sqlite",
);

Object.assign(process.env, {
  NODE_ENV: "test",
  HIG_REPOSITORY_BACKEND: "sqlite",
  HIG_DEMO_DB_PATH: databasePath,
  HIG_SQLITE_MIGRATIONS_PATH: resolve("drizzle"),
  HIG_SECURITY_HASH_KEY:
    "stage9-mobile-service-test-hash-key",
  HIG_REDIS_NAMESPACE:
    `stage9-mobile-service:${process.pid}:${Date.now()}:`,
});

after(() => {
  rmSync(temporaryDirectory, {
    recursive: true,
    force: true,
  });
});

const { database } = await import("#db-runtime");

const {
  hashPassword,
} = await import(
  "../server/auth/password.ts"
);

const {
  activeAssignmentsForPrincipal,
  authenticateMobilePassword,
  authenticatedMobilePrincipal,
  effectiveAccessForPrincipal,
  logoutMobileSession,
  mobileLoginInputSchema,
  mobileRefreshInputSchema,
  mobileRequestMetadata,
  parseMobileLoginInput,
  parseMobileRefreshInput,
  refreshMobileSession,
} = await import(
  "../server/mobile-auth/service.ts"
);

const { POST: mobileLoginRoute } = await import(
  "../app/api/v1/mobile/auth/login/route.ts"
);
const { POST: mobileRefreshRoute } = await import(
  "../app/api/v1/mobile/auth/refresh/route.ts"
);
const { POST: mobileLogoutRoute } = await import(
  "../app/api/v1/mobile/auth/logout/route.ts"
);
const { GET: mobileSessionRoute } = await import(
  "../app/api/v1/mobile/session/route.ts"
);
const { GET: mobileAccessRoute } = await import(
  "../app/api/v1/mobile/access/route.ts"
);

const timestamp = "2026-08-02T10:30:00.000Z";

const tenantId =
  "b1000000-0000-4000-8000-000000000001";

const otherTenantId =
  "b1000000-0000-4000-8000-000000000002";

const campusId =
  "b2000000-0000-4000-8000-000000000001";

const schoolUserId =
  "b3000000-0000-4000-8000-000000000001";

const parentUserId =
  "b3000000-0000-4000-8000-000000000002";

const studentId =
  "b4000000-0000-4000-8000-000000000001";

const parentIdentityId =
  "b5000000-0000-4000-8000-000000000001";

const assignmentId =
  "b6000000-0000-4000-8000-000000000001";

const planId =
  "b7000000-0000-4000-8000-000000000001";
const subscriptionId =
  "b8000000-0000-4000-8000-000000000001";
const schoolRoleId =
  "b9000000-0000-4000-8000-000000000001";

const parentPassword =
  "Stage 9 Parent passphrase विद्यालय 2026";

const deviceId =
  "stage9-test-device-raw-identifier";

const ipAddress = "198.51.100.91";

const userAgent =
  "HIGSchoolParent/1.0 Android";

function request(
  authorization?: string,
): Request {
  const headers = new Headers({
    "x-forwarded-for": ipAddress,
    "user-agent": userAgent,
    "x-hig-device-platform": "android",
    "x-hig-app-version": "1.0.0",
    "x-hig-device-id": deviceId,
  });

  if (authorization) {
    headers.set(
      "authorization",
      authorization,
    );
  }

  return new Request(
    "https://mobile-service.test/api/v1/mobile",
    { headers },
  );
}

async function seed(): Promise<void> {
  const parentHash =
    await hashPassword(parentPassword);

  const schoolHash = await hashPassword(
    "Stage 9 School passphrase विद्यालय 2026",
  );

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
    "Stage 9 Mobile Service School",
    "stage-9-mobile-service-school",
    timestamp,
    timestamp,
  ).run();

  await insertTenant.bind(
    otherTenantId,
    "Other Stage 9 Mobile School",
    "other-stage-9-mobile-school",
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
    VALUES (
      ?,
      ?,
      'Main Campus',
      'MAIN',
      'Test City',
      ?,
      ?
    )
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
    "mobile-service-school@example.invalid",
    "Mobile Service School User",
    timestamp,
    timestamp,
  ).run();

  await insertUser.bind(
    parentUserId,
    "mobile-service-parent@example.invalid",
    "Mobile Service Parent",
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
    schoolHash,
    timestamp,
    timestamp,
    timestamp,
  ).run();

  await insertCredential.bind(
    parentUserId,
    parentHash,
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
    INSERT INTO plans (
      id, name, monthly_price_paise, annual_price_paise,
      active, created_at, updated_at
    ) VALUES (?, 'Stage 9 Mobile Plan', 100000, 1000000, 1, ?, ?)
  `).bind(planId, timestamp, timestamp).run();

  await database.prepare(`
    INSERT INTO subscriptions (
      id, tenant_id, plan_id, status, period_ends_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, 'active', '2027-03-31T00:00:00.000Z', ?, ?)
  `).bind(
    subscriptionId,
    tenantId,
    planId,
    timestamp,
    timestamp,
  ).run();

  await database.prepare(`
    INSERT INTO roles (
      id, tenant_id, name, key, system, description,
      created_by, created_at, updated_at
    ) VALUES (?, ?, 'School Admin', 'school_admin', 1, '', ?, ?, ?)
  `).bind(
    schoolRoleId,
    tenantId,
    schoolUserId,
    timestamp,
    timestamp,
  ).run();

  await database.prepare(`
    INSERT INTO role_permissions (role_id, permission, created_at)
    VALUES (?, 'students.view', ?)
  `).bind(schoolRoleId, timestamp).run();

  for (const moduleKey of ['student_information', 'attendance']) {
    await database.prepare(`
      INSERT INTO module_policies (
        tenant_id, module_key, enabled, source, updated_at, updated_by
      ) VALUES (?, ?, 1, 'plan', ?, ?)
    `).bind(tenantId, moduleKey, timestamp, schoolUserId).run();
  }

  for (const featureKey of ['child_overview', 'attendance', 'homework']) {
    await database.prepare(`
      INSERT INTO plan_app_feature_policies (
        plan_id, audience, feature_key, enabled,
        configuration, updated_at, updated_by
      ) VALUES (?, 'parent', ?, 1, '{}', ?, ?)
    `).bind(planId, featureKey, timestamp, schoolUserId).run();
  }

  await database.prepare(`
    INSERT INTO tenant_app_feature_policies (
      tenant_id, audience, feature_key, enabled, source,
      configuration, updated_at, updated_by
    ) VALUES (?, 'parent', 'attendance', 0, 'override', '{}', ?, ?)
  `).bind(tenantId, timestamp, schoolUserId).run();

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
      'SERVICE-001',
      '1',
      'Mobile',
      'Student',
      'other',
      '2015-01-01',
      '2026-04-01',
      'Class 5',
      'A',
      'Mobile Service Parent',
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
    VALUES (
      ?,
      ?,
      ?,
      'parent',
      'active',
      ?,
      ?
    )
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

test("mobile service schemas are strict and preserve approved principals", () => {
  assert.equal(
    mobileLoginInputSchema.safeParse({
      email: "parent@example.invalid",
      password: "password",
      tenantId,
      principalType: "parent",
      devicePlatform: "android",
      appVersion: "1.0.0",
      deviceId,
    }).success,
    true,
  );

  assert.equal(
    mobileLoginInputSchema.safeParse({
      email: "parent@example.invalid",
      password: "password",
      tenantId,
      principalType: "parent",
    }).success,
    true,
  );

  assert.equal(
    mobileRefreshInputSchema.safeParse({
      refreshToken: "a".repeat(43),
    }).success,
    true,
  );

  for (const principalType of [
    "platform",
    "admin",
    "driver",
  ]) {
    assert.equal(
      mobileLoginInputSchema.safeParse({
        email: "parent@example.invalid",
        password: "password",
        tenantId,
        principalType,
        devicePlatform: "android",
        appVersion: "1.0.0",
      }).success,
      false,
    );
  }

  assert.equal(
    mobileLoginInputSchema.safeParse({
      email: "parent@example.invalid",
      password: "password",
      tenantId,
      principalType: "parent",
      devicePlatform: "web",
      appVersion: "1.0.0",
    }).success,
    false,
  );

  assert.equal(
    mobileLoginInputSchema.safeParse({
      email: "parent@example.invalid",
      password: "password",
      tenantId,
      principalType: "parent",
      devicePlatform: "android",
      appVersion: "1.0.0",
      arbitraryTenantOverride: otherTenantId,
    }).success,
    false,
  );

  assert.equal(
    mobileRefreshInputSchema.safeParse({
      refreshToken: "not-a-token",
      devicePlatform: "android",
      appVersion: "1.0.0",
    }).success,
    false,
  );
});

test("mobile request metadata hashes sensitive device and network values", () => {
  const metadata = mobileRequestMetadata(
    request(),
    {
      deviceId,
      devicePlatform: "android",
      appVersion: "1.0.0",
    },
  );

  assert.match(
    metadata.deviceIdHash ?? "",
    /^[a-f0-9]{64}$/,
  );

  assert.match(
    metadata.ipHash ?? "",
    /^[a-f0-9]{64}$/,
  );

  assert.match(
    metadata.userAgentHash ?? "",
    /^[a-f0-9]{64}$/,
  );

  assert.notEqual(metadata.deviceIdHash, deviceId);
  assert.notEqual(metadata.ipHash, ipAddress);
  assert.notEqual(
    metadata.userAgentHash,
    userAgent,
  );
});

test("mobile service authenticates, refreshes, resolves, and logs out", async () => {
  const loginInput = parseMobileLoginInput({
    email:
      " MOBILE-SERVICE-PARENT@example.invalid ",
    password: parentPassword,
    tenantId,
    principalType: "parent",
    deviceId,
    devicePlatform: "android",
    appVersion: "1.0.0",
  });

  const login = await authenticateMobilePassword(
    loginInput,
    request(),
  );

  assert.equal(login.status, "authenticated");

  if (login.status !== "authenticated") {
    throw new Error("Mobile login did not authenticate");
  }

  const principal =
    await authenticatedMobilePrincipal(
      request(
        `Bearer ${login.session.accessToken}`,
      ),
    );

  assert.ok(principal);
  assert.equal(principal.userId, parentUserId);
  assert.equal(principal.tenantId, tenantId);
  assert.equal(principal.principalType, "parent");
  assert.equal(
    principal.mobileIdentityId,
    parentIdentityId,
  );

  const assignments =
    await activeAssignmentsForPrincipal(principal);

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


  const access = await effectiveAccessForPrincipal(principal);
  assert.equal(access.tenantId, tenantId);
  assert.equal(access.principalType, "parent");
  assert.deepEqual(
    access.features.map((feature) => feature.key),
    ["child_overview"],
  );
  assert.deepEqual(
    access.assignments.map((assignment) => assignment.resourceId),
    [studentId],
  );

  const refreshInput = parseMobileRefreshInput({
    refreshToken: login.session.refreshToken,
    deviceId,
    devicePlatform: "android",
    appVersion: "1.0.1",
  });

  const refreshed = await refreshMobileSession(
    refreshInput,
    request(),
  );

  assert.equal(refreshed.status, "rotated");

  if (refreshed.status !== "rotated") {
    throw new Error("Mobile refresh did not rotate");
  }

  assert.equal(
    await authenticatedMobilePrincipal(
      request(
        `Bearer ${login.session.accessToken}`,
      ),
    ),
    null,
  );

  assert.ok(
    await authenticatedMobilePrincipal(
      request(
        `Bearer ${refreshed.session.accessToken}`,
      ),
    ),
  );

  assert.equal(
    await logoutMobileSession(
      request(
        `Bearer ${refreshed.session.accessToken}`,
      ),
    ),
    true,
  );

  assert.equal(
    await authenticatedMobilePrincipal(
      request(
        `Bearer ${refreshed.session.accessToken}`,
      ),
    ),
    null,
  );

  assert.equal(
    await logoutMobileSession(request()),
    false,
  );

  const lifecycleEvents = await database.prepare(`
    SELECT action
    FROM audit_events
    WHERE resource_id = ?
      AND action LIKE 'mobile.auth.%'
  `).bind(login.session.sessionId).all<{ action: string }>();

  assert.deepEqual(
    lifecycleEvents.results
      .map((event) => event.action)
      .sort(),
    [
      "mobile.auth.login.success",
      "mobile.auth.logout",
      "mobile.auth.refresh.success",
    ],
  );
});

test("mobile refresh replay revokes the complete token family", async () => {
  const login = await authenticateMobilePassword(
    parseMobileLoginInput({
      email:
        "mobile-service-parent@example.invalid",
      password: parentPassword,
      tenantId,
      principalType: "parent",
      deviceId,
      devicePlatform: "android",
      appVersion: "1.0.0",
    }),
    request(),
  );

  assert.equal(login.status, "authenticated");

  if (login.status !== "authenticated") {
    throw new Error("Replay test login failed");
  }

  const refreshInput = parseMobileRefreshInput({
    refreshToken: login.session.refreshToken,
    deviceId,
    devicePlatform: "android",
    appVersion: "1.0.1",
  });

  const rotated = await refreshMobileSession(
    refreshInput,
    request(),
  );

  assert.equal(rotated.status, "rotated");

  if (rotated.status !== "rotated") {
    throw new Error("Replay test rotation failed");
  }

  const replay = await refreshMobileSession(
    refreshInput,
    request(),
  );

  assert.equal(replay.status, "replay");

  assert.equal(
    await authenticatedMobilePrincipal(
      request(
        `Bearer ${rotated.session.accessToken}`,
      ),
    ),
    null,
  );

  const replayEvents = await database.prepare(`
    SELECT action
    FROM audit_events
    WHERE resource_id = ?
      AND action LIKE 'mobile.auth.%'
  `).bind(login.session.sessionId).all<{ action: string }>();

  const replayActions = new Set(
    replayEvents.results.map((event) => event.action),
  );
  assert.equal(
    replayActions.has("mobile.auth.refresh.replay"),
    true,
  );
  assert.equal(
    replayActions.has("mobile.auth.session.revoked"),
    true,
  );
});

test("five mobile routes use bearer tokens, no cookies, and server-derived access", async () => {
  const loginResponse = await mobileLoginRoute(new Request(
    "https://mobile-service.test/api/v1/mobile/auth/login",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.92",
        "user-agent": userAgent,
      },
      body: JSON.stringify({
        email: "mobile-service-parent@example.invalid",
        password: parentPassword,
        tenantId,
        principalType: "parent",
        deviceId,
        devicePlatform: "android",
        appVersion: "1.0.0",
      }),
    },
  ));
  assert.equal(loginResponse.status, 200);
  assert.equal(loginResponse.headers.has("set-cookie"), false);
  const loginBody = await loginResponse.json() as {
    session: { accessToken: string; refreshToken: string };
  };
  assert.match(loginBody.session.accessToken, /^[A-Za-z0-9_-]{43}$/);
  assert.match(loginBody.session.refreshToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal("accessTokenHash" in loginBody.session, false);
  assert.equal("refreshTokenHash" in loginBody.session, false);
  assert.equal("credentialVersion" in loginBody.session, false);

  const bearerHeaders = {
    authorization: `Bearer ${loginBody.session.accessToken}`,
    "x-forwarded-for": "198.51.100.92",
    "user-agent": userAgent,
  };
  const sessionResponse = await mobileSessionRoute(new Request(
    "https://mobile-service.test/api/v1/mobile/session",
    { headers: bearerHeaders },
  ));
  assert.equal(sessionResponse.status, 200);
  assert.equal(sessionResponse.headers.has("set-cookie"), false);
  const sessionBody = await sessionResponse.json() as {
    session: Record<string, unknown> & {
      sessionMetadata?: Record<string, unknown>;
    };
  };
  assert.equal("credentialVersion" in sessionBody.session, false);
  assert.equal("accessTokenHash" in sessionBody.session, false);
  assert.equal("refreshTokenHash" in sessionBody.session, false);
  assert.equal(
    sessionBody.session.sessionMetadata?.devicePlatform,
    "android",
  );
  assert.equal(
    sessionBody.session.sessionMetadata?.appVersion,
    "1.0.0",
  );
  for (const key of ["issuedAt", "lastSeenAt"] as const) {
    assert.match(
      String(sessionBody.session.sessionMetadata?.[key]),
      /^\d{4}-\d{2}-\d{2}T/,
    );
  }
  assert.equal(
    "deviceIdHash" in (sessionBody.session.sessionMetadata ?? {}),
    false,
  );
  assert.equal(
    "ipHash" in (sessionBody.session.sessionMetadata ?? {}),
    false,
  );
  assert.equal(
    "userAgentHash" in (sessionBody.session.sessionMetadata ?? {}),
    false,
  );

  const accessResponse = await mobileAccessRoute(new Request(
    `https://mobile-service.test/api/v1/mobile/access?tenantId=${otherTenantId}&audience=student`,
    { headers: bearerHeaders },
  ));
  assert.equal(accessResponse.status, 200);
  const accessBody = await accessResponse.json() as {
    access: {
      tenantId: string;
      principalType: string;
      features: Array<{ key: string }>;
    };
  };
  assert.equal(accessBody.access.tenantId, tenantId);
  assert.equal(accessBody.access.principalType, "parent");
  assert.deepEqual(
    accessBody.access.features.map((feature) => feature.key),
    ["child_overview"],
  );

  const refreshResponse = await mobileRefreshRoute(new Request(
    "https://mobile-service.test/api/v1/mobile/auth/refresh",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.92",
        "user-agent": userAgent,
      },
      body: JSON.stringify({
        refreshToken: loginBody.session.refreshToken,
        deviceId,
        devicePlatform: "android",
        appVersion: "1.0.1",
      }),
    },
  ));
  assert.equal(refreshResponse.status, 200);
  assert.equal(refreshResponse.headers.has("set-cookie"), false);
  const refreshBody = await refreshResponse.json() as {
    session: { accessToken: string };
  };

  const logoutRequest = () => new Request(
    "https://mobile-service.test/api/v1/mobile/auth/logout",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${refreshBody.session.accessToken}`,
        "x-forwarded-for": "198.51.100.92",
        "user-agent": userAgent,
        "x-hig-device-platform": "android",
        "x-hig-app-version": "1.0.1",
      },
    },
  );
  const logoutResponse = await mobileLogoutRoute(logoutRequest());
  assert.equal(logoutResponse.status, 200);
  assert.equal(logoutResponse.headers.has("set-cookie"), false);
  const repeatedLogout = await mobileLogoutRoute(logoutRequest());
  assert.equal(repeatedLogout.status, 200);
});

test("mobile login failures remain generic and audit no raw secrets", async () => {
  const wrongPassword =
    "Incorrect raw mobile password 2026";

  const result = await authenticateMobilePassword(
    parseMobileLoginInput({
      email:
        "mobile-service-parent@example.invalid",
      password: wrongPassword,
      tenantId,
      principalType: "parent",
      deviceId,
      devicePlatform: "android",
      appVersion: "1.0.0",
    }),
    request(),
  );

  assert.deepEqual(result, {
    status: "invalid",
  });

  const events = await database.prepare(`
    SELECT
      action,
      reason AS outcome,
      ip_hash,
      metadata_json
    FROM audit_events
    WHERE action LIKE 'mobile.auth.%'
    ORDER BY occurred_at
  `).all<Record<string, unknown>>();

  const serialized = JSON.stringify(events.results);

  assert.match(serialized, /mobile\.auth\.login/);
  assert.match(serialized, /mobile\.auth\.refresh/);
  assert.match(serialized, /mobile\.auth\.logout/);

  for (const rawValue of [
    parentPassword,
    wrongPassword,
    deviceId,
    ipAddress,
    userAgent,
  ]) {
    assert.equal(
      serialized.includes(rawValue),
      false,
    );
  }

  const sessions = await database.prepare(`
    SELECT
      access_token_hash,
      refresh_token_hash
    FROM mobile_sessions
  `).all<Record<string, unknown>>();

  const storedSessions =
    JSON.stringify(sessions.results);

  assert.doesNotMatch(
    storedSessions,
    /Stage 9 Parent passphrase/,
  );
});
