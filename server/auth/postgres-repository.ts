import type { PoolClient } from "pg";
import { getPostgresPool } from "../runtime/postgres.ts";
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS } from "./cookies.ts";
import { randomToken, sha256 } from "./crypto.ts";
import type { LoginRecord, SessionMetadata } from "./repository.ts";
import type { AuthenticatedActor, SessionCreation } from "./types.ts";

const platformPermissions = new Set([
  "platform.schools.view",
  "platform.schools.manage",
]);

async function transaction<Result>(
  operation: (client: PoolClient) => Promise<Result>,
): Promise<Result> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.auth_service', 'true', true)");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function enablePlatformRead(client: PoolClient): Promise<void> {
  await client.query("SELECT set_config('app.platform_read', 'true', true)");
}

async function enableTenant(client: PoolClient, tenantId: string): Promise<void> {
  await client.query("SELECT set_config('app.tenant_id', $1::text, true)", [tenantId]);
}

async function revokeMobileSessionsForUser(
  client: PoolClient,
  userId: string,
  reason: string,
): Promise<void> {
  await client.query(
    "SELECT set_config('app.mobile_auth_service', 'true', true)",
  );
  const tenants = await client.query<{ tenantId: string }>(
    `SELECT DISTINCT tenant_id AS "tenantId"
       FROM mobile_token_locators
      WHERE user_id = $1::uuid`,
    [userId],
  );
  for (const { tenantId } of tenants.rows) {
    await enableTenant(client, tenantId);
    await client.query(
      `UPDATE mobile_sessions
          SET revoked_at = COALESCE(revoked_at, now()),
              revoke_reason = COALESCE(revoke_reason, $1::text)
        WHERE tenant_id = $2::uuid
          AND user_id = $3::uuid
          AND revoked_at IS NULL`,
      [reason, tenantId, userId],
    );
  }
}

export async function findLoginRecord(email: string): Promise<LoginRecord | null> {
  return transaction(async (client) => {
    const result = await client.query(
      `SELECT u.id AS "userId", u.email, u.full_name AS "fullName", u.status,
              c.password_hash AS "passwordHash",
              c.credential_version::int AS "credentialVersion",
              c.disabled_at IS NOT NULL AS disabled,
              (EXISTS(SELECT 1 FROM platform_role_assignments p WHERE p.user_id = u.id)
                OR EXISTS(SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.status = 'active')) AS eligible
         FROM users u
         JOIN auth_credentials c ON c.user_id = u.id
        WHERE lower(u.email) = lower($1::text)
        LIMIT 1`,
      [email],
    );
    return result.rows[0] ?? null;
  });
}

export async function replacePassword(userId: string, passwordHash: string): Promise<void> {
  await transaction(async (client) => {
    await client.query(
      `UPDATE auth_credentials
          SET password_hash = $1::text,
              credential_version = credential_version + 1,
              password_changed_at = now(), updated_at = now()
        WHERE user_id = $2::uuid`,
      [passwordHash, userId],
    );
    await client.query(
      `UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'password_changed'
        WHERE user_id = $1::uuid AND revoked_at IS NULL`,
      [userId],
    );
    await revokeMobileSessionsForUser(client, userId, "password_changed");
  });
}

async function sessionIdentity(
  client: PoolClient,
  userId: string,
  requestedTenantId: string | null,
): Promise<{ tenantId: string | null; membershipStatus: string | null; roleKey: string | null; platformRole: string | null }> {
  await enablePlatformRead(client);
  const platform = await client.query(
    `SELECT role_key FROM platform_role_assignments
      WHERE user_id = $1::uuid ORDER BY created_at LIMIT 1`,
    [userId],
  );
  const membership = await client.query(
    `SELECT tenant_id, status, role_key
       FROM memberships
      WHERE user_id = $1::uuid
        AND ($2::uuid IS NULL OR tenant_id = $2::uuid)
        AND status = 'active'
      ORDER BY created_at
      LIMIT 1`,
    [userId, requestedTenantId],
  );
  const row = membership.rows[0];
  return {
    tenantId: row?.tenant_id ?? null,
    membershipStatus: row?.status ?? null,
    roleKey: row?.role_key ?? null,
    platformRole: platform.rows[0]?.role_key ?? null,
  };
}

export async function createSession(
  userId: string,
  credentialVersion: number,
  activeTenantId: string | null,
  metadata: SessionMetadata,
): Promise<SessionCreation> {
  return transaction(async (client) => {
    const identity = await sessionIdentity(client, userId, activeTenantId);
    if (!identity.platformRole && !identity.tenantId) throw new Error("No active identity");
    if (activeTenantId && identity.tenantId !== activeTenantId) throw new Error("Active membership required");
    const sessionTenantId=activeTenantId??(identity.platformRole?null:identity.tenantId);

    const token = randomToken();
    const csrfToken = randomToken();
    const id = crypto.randomUUID();
    const issuedAt = new Date();
    const absoluteExpiresAt = new Date(issuedAt.getTime() + SESSION_ABSOLUTE_MS);
    await client.query(
      `INSERT INTO auth_sessions
        (id, token_hash, user_id, active_tenant_id, credential_version, csrf_hash,
         issued_at, last_seen_at, idle_expires_at, absolute_expires_at, ip_hash, user_agent_hash)
       VALUES
        ($1::uuid, $2::text, $3::uuid, $4::uuid, $5::bigint, $6::text,
         $7::timestamptz, $7::timestamptz, $8::timestamptz, $9::timestamptz, $10::text, $11::text)`,
      [
        id,
        sha256(token),
        userId,
        sessionTenantId,
        credentialVersion,
        sha256(csrfToken),
        issuedAt,
        new Date(issuedAt.getTime() + SESSION_IDLE_MS),
        absoluteExpiresAt,
        metadata.ipHash,
        metadata.userAgentHash,
      ],
    );
    return { token, csrfToken, sessionId: id, absoluteExpiresAt: absoluteExpiresAt.toISOString() };
  });
}

export async function resolveSession(token: string): Promise<AuthenticatedActor | null> {
  return transaction(async (client) => {
    const result = await client.query(
      `SELECT s.id, s.user_id, u.email, u.full_name, u.status AS user_status,
              s.active_tenant_id, s.credential_version::int,
              c.credential_version::int AS current_version, c.disabled_at AS credential_disabled_at,
              s.csrf_hash,
              s.idle_expires_at, s.absolute_expires_at
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         JOIN auth_credentials c ON c.user_id = u.id
        WHERE s.token_hash = $1::text AND s.revoked_at IS NULL
        LIMIT 1 FOR UPDATE OF s`,
      [sha256(token)],
    );
    const row = result.rows[0];
    if (!row) return null;

    const identity = await sessionIdentity(client, row.user_id, row.active_tenant_id);
    const currentTime = Date.now();
    const invalid = row.user_status !== "active"
      || row.credential_disabled_at !== null
      || row.credential_version !== row.current_version
      || new Date(row.idle_expires_at).getTime() <= currentTime
      || new Date(row.absolute_expires_at).getTime() <= currentTime
      || (row.active_tenant_id !== null && identity.tenantId !== row.active_tenant_id)
      || (!identity.platformRole && !identity.tenantId);
    if (invalid) {
      await client.query(
        `UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'invalid_or_expired'
          WHERE id = $1::uuid`,
        [row.id],
      );
      return null;
    }

    const permissions = new Set<string>();
    const modules = new Set<string>();
    if (row.active_tenant_id && identity.roleKey) {
      await enableTenant(client, row.active_tenant_id);
      const rolePermissions = await client.query(
        `SELECT rp.permission
           FROM roles r
           JOIN role_permissions rp
             ON rp.tenant_id = r.tenant_id AND rp.role_id = r.id
          WHERE r.tenant_id = $1::uuid AND r.key = $2::text`,
        [row.active_tenant_id, identity.roleKey],
      );
      rolePermissions.rows.forEach(({ permission }) => permissions.add(permission));
      const modulePolicies = await client.query(
        `SELECT module_key FROM module_policies
          WHERE tenant_id = $1::uuid AND enabled = true`,
        [row.active_tenant_id],
      );
      modulePolicies.rows.forEach(({ module_key }) => modules.add(module_key));
    }

    await client.query(
      `UPDATE auth_sessions
          SET last_seen_at = now(), idle_expires_at = now() + interval '30 minutes'
        WHERE id = $1::uuid`,
      [row.id],
    );
    return {
      userId: row.user_id,
      email: row.email,
      displayName: row.full_name,
      fullName: row.full_name,
      sessionId: row.id,
      csrfHash: row.csrf_hash,
      activeTenantId: row.active_tenant_id,
      identityType: row.active_tenant_id ? "school" : "platform",
      platformPermissions: !row.active_tenant_id && identity.platformRole ? platformPermissions : new Set(),
      rolePermissions: permissions,
      moduleEntitlements: modules,
      membershipStatus: row.active_tenant_id ? identity.membershipStatus as AuthenticatedActor["membershipStatus"] : null,
    };
  });
}

export async function rotateTenant(
  sessionId: string,
  userId: string,
  tenantId: string,
  metadata: SessionMetadata,
): Promise<SessionCreation> {
  return transaction(async (client) => {
    const identity = await sessionIdentity(client, userId, tenantId);
    if (identity.tenantId !== tenantId || identity.membershipStatus !== "active") {
      throw new Error("Active membership required");
    }
    const version = await client.query(
      `SELECT credential_version::int AS version FROM auth_credentials WHERE user_id = $1::uuid`,
      [userId],
    );
    await client.query(
      `UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'tenant_switch'
        WHERE id = $1::uuid AND user_id = $2::uuid AND revoked_at IS NULL`,
      [sessionId, userId],
    );
    const token = randomToken();
    const csrfToken = randomToken();
    const id = crypto.randomUUID();
    const absoluteExpiresAt = new Date(Date.now() + SESSION_ABSOLUTE_MS);
    await client.query(
      `INSERT INTO auth_sessions
        (id, token_hash, user_id, active_tenant_id, credential_version, csrf_hash,
         idle_expires_at, absolute_expires_at, ip_hash, user_agent_hash)
       VALUES
        ($1::uuid, $2::text, $3::uuid, $4::uuid, $5::bigint, $6::text,
         now() + interval '30 minutes', $7::timestamptz, $8::text, $9::text)`,
      [id, sha256(token), userId, tenantId, version.rows[0].version, sha256(csrfToken), absoluteExpiresAt, metadata.ipHash, metadata.userAgentHash],
    );
    return { token, csrfToken, sessionId: id, absoluteExpiresAt: absoluteExpiresAt.toISOString() };
  });
}

export async function revokeSession(id: string, reason: string): Promise<void> {
  await transaction(async (client) => {
    await client.query(
      `UPDATE auth_sessions SET revoked_at = now(), revoke_reason = $1::text
        WHERE id = $2::uuid AND revoked_at IS NULL`,
      [reason, id],
    );
  });
}

export async function revokeUserSessions(userId: string, reason: string): Promise<void> {
  await transaction(async (client) => {
    await client.query(
      `UPDATE auth_sessions SET revoked_at = now(), revoke_reason = $1::text
        WHERE user_id = $2::uuid AND revoked_at IS NULL`,
      [reason, userId],
    );
  });
}

export async function listSessions(userId: string): Promise<Array<{ id: string; issuedAt: string; lastSeenAt: string }>> {
  return transaction(async (client) => {
    const result = await client.query(
      `SELECT id, issued_at AS "issuedAt", last_seen_at AS "lastSeenAt"
         FROM auth_sessions WHERE user_id = $1::uuid AND revoked_at IS NULL
        ORDER BY issued_at DESC`,
      [userId],
    );
    return result.rows.map((row)=>({id:row.id,issuedAt:new Date(row.issuedAt).toISOString(),lastSeenAt:new Date(row.lastSeenAt).toISOString()}));
  });
}

export async function createReset(email: string, tokenHash: string, ipHash: string | null): Promise<{ userId: string; email: string } | null> {
  return transaction(async (client) => {
    const user = await client.query(
      `SELECT id, email FROM users WHERE lower(email) = lower($1::text) AND status = 'active'`,
      [email],
    );
    if (!user.rows[0]) return null;
    await client.query(
      `UPDATE password_reset_tokens SET consumed_at = now()
        WHERE user_id = $1::uuid AND consumed_at IS NULL`,
      [user.rows[0].id],
    );
    await client.query(
      `INSERT INTO password_reset_tokens(user_id, token_hash, expires_at, ip_hash)
       VALUES($1::uuid, $2::text, now() + interval '30 minutes', $3::text)`,
      [user.rows[0].id, tokenHash, ipHash],
    );
    return { userId: user.rows[0].id, email: user.rows[0].email };
  });
}

export async function invalidateReset(tokenHash: string): Promise<void> {
  await transaction(async (client) => {
    await client.query(
      `UPDATE password_reset_tokens SET consumed_at = now()
        WHERE token_hash = $1::text AND consumed_at IS NULL`,
      [tokenHash],
    );
  });
}

export async function consumeReset(tokenHash: string, passwordHash: string, metadata: SessionMetadata = { ipHash: null, userAgentHash: null }): Promise<string | null> {
  return transaction(async (client) => {
    const reset = await client.query(
      `UPDATE password_reset_tokens
          SET consumed_at = now()
        WHERE id = (
          SELECT id FROM password_reset_tokens
           WHERE token_hash = $1::text AND consumed_at IS NULL AND expires_at > now()
           FOR UPDATE
        )
        RETURNING user_id`,
      [tokenHash],
    );
    if (!reset.rows[0]) return null;
    const userId = reset.rows[0].user_id;
    await client.query(
      `UPDATE auth_credentials
          SET password_hash = $1::text, credential_version = credential_version + 1,
              password_changed_at = now(), updated_at = now()
        WHERE user_id = $2::uuid`,
      [passwordHash, userId],
    );
    await client.query(
      `UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'password_reset'
        WHERE user_id = $1::uuid AND revoked_at IS NULL`,
      [userId],
    );
    await revokeMobileSessionsForUser(client, userId, "password_reset");
    await client.query(
      `SELECT set_config('app.platform_create', 'true', true)`,
    );
    await client.query(
      `INSERT INTO audit_events(tenant_id, actor_id, action, resource_type, reason, ip_hash, metadata)
       VALUES(NULL, $1::uuid, 'auth.password_reset.complete', 'authentication', 'success', $2::text, $3::jsonb)`,
      [userId, metadata.ipHash, JSON.stringify({ userAgentHash: metadata.userAgentHash })],
    );
    return userId;
  });
}

export async function acceptInvitation(tokenHash: string, email: string, passwordHash: string, metadata: SessionMetadata = { ipHash: null, userAgentHash: null }): Promise<string | null> {
  return transaction(async (client) => {
    await enablePlatformRead(client);
    const invitation = await client.query(
      `SELECT i.id, i.tenant_id, u.id AS user_id
         FROM school_invitations i
         JOIN users u ON lower(u.email) = lower(i.email)
        WHERE i.token_hash = $1::text AND lower(i.email) = lower($2::text)
          AND i.status = 'pending' AND i.expires_at > now()
        FOR UPDATE OF i`,
      [tokenHash, email],
    );
    if (!invitation.rows[0]) return null;
    const row = invitation.rows[0];
    await enableTenant(client, row.tenant_id);
    await client.query(
      `INSERT INTO auth_credentials
        (user_id, password_hash, credential_version, must_change_password, password_changed_at)
       VALUES($1::uuid, $2::text, 1, false, now())
       ON CONFLICT(user_id) DO UPDATE SET
         password_hash = excluded.password_hash,
         credential_version = auth_credentials.credential_version + 1,
         password_changed_at = now(), updated_at = now()`,
      [row.user_id, passwordHash],
    );
    await client.query(`UPDATE users SET status = 'active', updated_at = now() WHERE id = $1::uuid`, [row.user_id]);
    await client.query(
      `UPDATE memberships SET status = 'active', updated_at = now()
        WHERE user_id = $1::uuid AND tenant_id = $2::uuid`,
      [row.user_id, row.tenant_id],
    );
    const accepted = await client.query(
      `UPDATE school_invitations
          SET status = 'accepted', accepted_at = now(), updated_at = now()
        WHERE id = $1::uuid AND status = 'pending'
        RETURNING id`,
      [row.id],
    );
    if (!accepted.rows[0]) throw new Error("Invitation was already consumed");
    await client.query(
      `UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'invitation_acceptance'
        WHERE user_id = $1::uuid AND revoked_at IS NULL`,
      [row.user_id],
    );
    await revokeMobileSessionsForUser(
      client,
      row.user_id,
      "invitation_acceptance",
    );
    await enableTenant(client, row.tenant_id);
    await client.query(
      `INSERT INTO audit_events(tenant_id, actor_id, action, resource_type, reason, ip_hash, metadata)
       VALUES($1::uuid, $2::uuid, 'auth.invitation.accept', 'authentication', 'success', $3::text, $4::jsonb)`,
      [row.tenant_id, row.user_id, metadata.ipHash, JSON.stringify({ userAgentHash: metadata.userAgentHash })],
    );
    return row.user_id;
  });
}

export async function writeSecurityEvent(input: { tenantId?: string | null; actorId?: string | null; action: string; outcome: "success" | "failure"; ipHash?: string | null; metadata?: Record<string, unknown> }): Promise<void> {
  await transaction(async (client) => {
    if (input.tenantId) await enableTenant(client, input.tenantId);
    else await client.query("SELECT set_config('app.platform_create', 'true', true)");
    await client.query(
      `INSERT INTO audit_events(tenant_id, actor_id, action, resource_type, reason, ip_hash, metadata)
       VALUES($1::uuid, $2::uuid, $3::text, 'authentication', $4::text, $5::text, $6::jsonb)`,
      [input.tenantId ?? null, input.actorId ?? null, input.action, input.outcome, input.ipHash ?? null, JSON.stringify(input.metadata ?? {})],
    );
  });
}

export async function bootstrapPlatformAdmin(input: { email: string; fullName: string; passwordHash: string }): Promise<void> {
  await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('hig.bootstrap.platform_admin'))");
    await client.query("SELECT set_config('app.platform_create', 'true', true)");
    const existing = await client.query(`SELECT 1 FROM platform_role_assignments LIMIT 1`);
    if (existing.rows[0]) throw new Error("Platform administrator already exists");
    const user = await client.query(
      `INSERT INTO users(email, full_name, status, mfa_enabled)
       VALUES($1::text, $2::text, 'active', false) RETURNING id`,
      [input.email, input.fullName],
    );
    await client.query(
      `INSERT INTO auth_credentials(user_id, password_hash) VALUES($1::uuid, $2::text)`,
      [user.rows[0].id, input.passwordHash],
    );
    await client.query(
      `INSERT INTO platform_role_assignments(user_id, role_key) VALUES($1::uuid, 'platform_admin')`,
      [user.rows[0].id],
    );
  });
}
