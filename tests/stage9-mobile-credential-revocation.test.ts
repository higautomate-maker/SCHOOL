import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

const temporaryDirectory = mkdtempSync(
  join(tmpdir(), "hig-stage9-mobile-credentials-"),
);
Object.assign(process.env, {
  NODE_ENV: "test",
  HIG_REPOSITORY_BACKEND: "sqlite",
  HIG_DEMO_DB_PATH: join(temporaryDirectory, "credentials.sqlite"),
  HIG_SQLITE_MIGRATIONS_PATH: resolve("drizzle"),
  HIG_SECURITY_HASH_KEY: "stage9-mobile-credential-test-key",
});
after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));

const { database } = await import("#db-runtime");
const { hashPassword } = await import("../server/auth/password.ts");
const {
  acceptInvitation,
  consumeReset,
  createReset,
  replacePassword,
} = await import("../server/auth/repository.ts");
const mobile = await import("../server/mobile-auth/sqlite-repository.ts");
const { sha256 } = await import("../server/auth/crypto.ts");

const timestamp = "2026-08-02T11:00:00.000Z";
const tenantId = "c1000000-0000-4000-8000-000000000001";
const campusId = "c2000000-0000-4000-8000-000000000001";
const inviterId = "c3000000-0000-4000-8000-000000000001";
const userId = "c3000000-0000-4000-8000-000000000002";
const identityId = "c4000000-0000-4000-8000-000000000001";
const email = "credential-parent@example.invalid";

await database.prepare(`
  INSERT INTO tenants (
    id, name, slug, status, country_code, created_at, updated_at
  ) VALUES (?, 'Credential School', 'credential-school', 'active', 'IN', ?, ?)
`).bind(tenantId, timestamp, timestamp).run();
await database.prepare(`
  INSERT INTO campuses (
    id, tenant_id, name, code, created_at, updated_at
  ) VALUES (?, ?, 'Main', 'MAIN', ?, ?)
`).bind(campusId, tenantId, timestamp, timestamp).run();
for (const [id, userEmail, name] of [
  [inviterId, "credential-inviter@example.invalid", "Inviter"],
  [userId, email, "Credential Parent"],
] as const) {
  await database.prepare(`
    INSERT INTO users (
      id, email, full_name, status, mfa_enabled, created_at, updated_at
    ) VALUES (?, ?, ?, 'active', 0, ?, ?)
  `).bind(id, userEmail, name, timestamp, timestamp).run();
}
for (const [id, password] of [
  [inviterId, "Stage 9 inviter password विद्यालय 2026"],
  [userId, "Stage 9 initial password विद्यालय 2026"],
] as const) {
  await database.prepare(`
    INSERT INTO auth_credentials (
      user_id, password_hash, credential_version, must_change_password,
      password_changed_at, created_at, updated_at
    ) VALUES (?, ?, 1, 0, ?, ?, ?)
  `).bind(
    id,
    await hashPassword(password),
    timestamp,
    timestamp,
    timestamp,
  ).run();
}
await database.prepare(`
  INSERT INTO memberships (
    tenant_id, user_id, role_key, campus_id, status, created_at, updated_at
  ) VALUES (?, ?, 'school_admin', ?, 'active', ?, ?)
`).bind(tenantId, inviterId, campusId, timestamp, timestamp).run();
await database.prepare(`
  INSERT INTO memberships (
    tenant_id, user_id, role_key, campus_id, status, created_at, updated_at
  ) VALUES (?, ?, 'parent_portal', ?, 'active', ?, ?)
`).bind(tenantId, userId, campusId, timestamp, timestamp).run();
await database.prepare(`
  INSERT INTO mobile_identities (
    id, tenant_id, user_id, audience, status, created_at, updated_at
  ) VALUES (?, ?, ?, 'parent', 'active', ?, ?)
`).bind(identityId, tenantId, userId, timestamp, timestamp).run();

const metadata = {
  deviceIdHash: "a".repeat(64),
  devicePlatform: "android",
  appVersion: "1.0.0",
  ipHash: "b".repeat(64),
  userAgentHash: "c".repeat(64),
};

async function createParentSession() {
  const login = await mobile.findMobileLoginRecord({
    email,
    tenantId,
    principalType: "parent",
  });
  assert.ok(login);
  return mobile.createMobileSession({ login, metadata });
}

async function assertRevoked(sessionId: string, reason: string) {
  const session = await database.prepare(`
    SELECT revoke_reason AS reason, revoked_at AS revokedAt
    FROM mobile_sessions WHERE id = ?
  `).bind(sessionId).first<{ reason: string; revokedAt: string | null }>();
  assert.ok(session?.revokedAt);
  assert.equal(session.reason, reason);
  const activeLocators = await database.prepare(`
    SELECT COUNT(*) AS count
    FROM mobile_token_locators
    WHERE session_id = ? AND state = 'active'
  `).bind(sessionId).first<{ count: number }>();
  assert.equal(Number(activeLocators?.count ?? -1), 0);
}

test("password change revokes web-independent mobile sessions atomically", async () => {
  const session = await createParentSession();
  await replacePassword(
    userId,
    await hashPassword("Stage 9 changed password विद्यालय 2026"),
  );
  await assertRevoked(session.sessionId, "password_changed");
  assert.equal(
    await mobile.resolveMobileAccessToken(session.accessToken),
    null,
  );
});

test("password reset revokes active mobile sessions and locators", async () => {
  const session = await createParentSession();
  const rawReset = "stage9-reset-token-" + "r".repeat(43);
  const created = await createReset(email, sha256(rawReset), metadata.ipHash);
  assert.equal(created?.userId, userId);
  const consumed = await consumeReset(
    sha256(rawReset),
    await hashPassword("Stage 9 reset password विद्यालय 2026"),
    { ipHash: metadata.ipHash, userAgentHash: metadata.userAgentHash },
  );
  assert.equal(consumed, userId);
  await assertRevoked(session.sessionId, "password_reset");
});

test("invitation credential replacement revokes active mobile sessions", async () => {
  const session = await createParentSession();
  const rawInvitation = "stage9-invitation-token-" + "i".repeat(43);
  await database.prepare(`
    INSERT INTO school_invitations (
      id, tenant_id, email, role_key, token_hash, status, expires_at,
      invited_by, created_at, updated_at
    ) VALUES (?, ?, ?, 'parent_portal', ?, 'pending', ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    tenantId,
    email,
    sha256(rawInvitation),
    "2027-01-01T00:00:00.000Z",
    inviterId,
    timestamp,
    timestamp,
  ).run();
  const accepted = await acceptInvitation(
    sha256(rawInvitation),
    email,
    await hashPassword("Stage 9 invitation password विद्यालय 2026"),
    { ipHash: metadata.ipHash, userAgentHash: metadata.userAgentHash },
  );
  assert.equal(accepted, userId);
  await assertRevoked(session.sessionId, "invitation_acceptance");
});
