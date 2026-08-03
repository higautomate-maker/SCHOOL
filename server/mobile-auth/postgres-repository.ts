import type { PoolClient } from "pg";
import {
  resolveEffectiveAppFeatureAccess,
  resolveEffectiveSchoolModuleAccess,
} from "../access/catalogue.ts";
import { getPostgresPool } from "../runtime/postgres.ts";
import {
  hashMobileToken,
  isWellFormedMobileToken,
  issueMobileTokenSet,
} from "./tokens.ts";
import type {
  CreateMobileSessionInput,
  FindMobileLoginInput,
} from "./repository.ts";
import type {
  MobileAccessSummary,
  MobileAssignment,
  MobileAuthenticatedPrincipal,
  MobileIdentityStatus,
  MobileLoginRecord,
  MobilePrincipalType,
  MobileRefreshResult,
  MobileSessionCreation,
  MobileSessionMetadata,
} from "./types.ts";

type LoginRow = {
  userId: string;
  email: string;
  fullName: string;
  status: string;
  passwordHash: string;
  credentialVersion: number;
  disabledAt: Date | null;
  relationshipStatus: string | null;
  roleKey: string | null;
  mobileIdentityId: string | null;
};

type LocatorRow = {
  tokenHash: string;
  tokenKind: "access" | "refresh";
  tenantId: string;
  sessionId: string;
  userId: string;
  refreshFamilyId: string;
  rotation: number;
  state: "active" | "used" | "revoked" | "expired";
  expiresAt: Date;
};

type AccessRow = {
  sessionId: string;
  userId: string;
  email: string;
  fullName: string;
  userStatus: string;
  tenantId: string;
  principalType: MobilePrincipalType;
  mobileIdentityId: string | null;
  credentialVersion: number;
  currentCredentialVersion: number;
  credentialDisabledAt: Date | null;
  issuedAt: Date;
  lastSeenAt: Date;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  devicePlatform: string | null;
  appVersion: string | null;
  identityStatus: string | null;
  identityAudience: string | null;
  identityUserId: string | null;
  schoolMembershipStatus: string | null;
  roleKey: string | null;
};

async function transaction<Result>(
  operation: (client: PoolClient) => Promise<Result>,
): Promise<Result> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.mobile_auth_service', 'true', true)",
    );
    await client.query(
      "SELECT set_config('app.auth_service', 'true', true)",
    );
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

async function enableTenant(
  client: PoolClient,
  tenantId: string,
): Promise<void> {
  await client.query(
    "SELECT set_config('app.tenant_id', $1::text, true)",
    [tenantId],
  );
}

async function enableAccessPolicyService(
  client: PoolClient,
): Promise<void> {
  await client.query(
    "SELECT set_config('app.access_policy_service', 'true', true)",
  );
}

function relationshipStatus(
  value: string | null,
): MobileIdentityStatus | null {
  return value === "invited"
    || value === "active"
    || value === "suspended"
    || value === "revoked"
    ? value
    : null;
}

function loginRecord(
  row: LoginRow,
  input: FindMobileLoginInput,
): MobileLoginRecord {
  return {
    userId: row.userId,
    email: row.email,
    fullName: row.fullName,
    status: row.status,
    passwordHash: row.passwordHash,
    credentialVersion: Number(row.credentialVersion),
    disabled: row.disabledAt !== null,
    tenantId: input.tenantId,
    principalType: input.principalType,
    mobileIdentityId: row.mobileIdentityId,
    relationshipStatus: relationshipStatus(row.relationshipStatus),
    roleKey: row.roleKey,
  };
}

function safeReason(reason: string): string {
  return reason.trim().slice(0, 120) || "revoked";
}

export async function findMobileLoginRecord(
  input: FindMobileLoginInput,
): Promise<MobileLoginRecord | null> {
  return transaction(async (client) => {
    await enableTenant(client, input.tenantId);
    const result = input.principalType === "school"
      ? await client.query<LoginRow>(
        `SELECT
           u.id AS "userId",
           u.email,
           u.full_name AS "fullName",
           u.status::text AS status,
           c.password_hash AS "passwordHash",
           c.credential_version::int AS "credentialVersion",
           c.disabled_at AS "disabledAt",
           m.status::text AS "relationshipStatus",
           m.role_key AS "roleKey",
           NULL::uuid AS "mobileIdentityId"
         FROM users u
         JOIN auth_credentials c ON c.user_id = u.id
         LEFT JOIN memberships m
           ON m.user_id = u.id AND m.tenant_id = $1::uuid
         WHERE lower(u.email) = lower($2::text)
         ORDER BY
           CASE WHEN m.status = 'active' THEN 0
                WHEN m.status IS NULL THEN 2 ELSE 1 END,
           m.created_at
         LIMIT 1`,
        [input.tenantId, input.email.trim().toLowerCase()],
      )
      : await client.query<LoginRow>(
        `SELECT
           u.id AS "userId",
           u.email,
           u.full_name AS "fullName",
           u.status::text AS status,
           c.password_hash AS "passwordHash",
           c.credential_version::int AS "credentialVersion",
           c.disabled_at AS "disabledAt",
           i.status::text AS "relationshipStatus",
           NULL::text AS "roleKey",
           i.id AS "mobileIdentityId"
         FROM users u
         JOIN auth_credentials c ON c.user_id = u.id
         LEFT JOIN mobile_identities i
           ON i.user_id = u.id
          AND i.tenant_id = $1::uuid
          AND i.audience::text = $2::text
         WHERE lower(u.email) = lower($3::text)
         ORDER BY
           CASE WHEN i.status = 'active' THEN 0
                WHEN i.status IS NULL THEN 2 ELSE 1 END,
           i.created_at
         LIMIT 1`,
        [
          input.tenantId,
          input.principalType,
          input.email.trim().toLowerCase(),
        ],
      );
    return result.rows[0]
      ? loginRecord(result.rows[0], input)
      : null;
  });
}

function assertCreatableLogin(login: MobileLoginRecord): void {
  if (
    login.status !== "active"
    || login.disabled
    || login.relationshipStatus !== "active"
  ) {
    throw new Error("Active mobile authentication relationship is required");
  }
  if (
    login.principalType === "school"
      ? login.mobileIdentityId !== null || login.roleKey === null
      : login.mobileIdentityId === null || login.roleKey !== null
  ) {
    throw new Error("Mobile principal relationship is invalid");
  }
}

export async function createMobileSession(
  input: CreateMobileSessionInput,
): Promise<MobileSessionCreation> {
  assertCreatableLogin(input.login);
  return transaction(async (client) => {
    await enableTenant(client, input.login.tenantId);
    const credential = await client.query<{
      userStatus: string;
      credentialVersion: number;
      disabledAt: Date | null;
    }>(
      `SELECT u.status::text AS "userStatus",
              c.credential_version::int AS "credentialVersion",
              c.disabled_at AS "disabledAt"
         FROM users u
         JOIN auth_credentials c ON c.user_id = u.id
        WHERE u.id = $1::uuid
        LIMIT 1`,
      [input.login.userId],
    );
    const current = credential.rows[0];
    if (
      !current
      || current.userStatus !== "active"
      || current.disabledAt !== null
      || current.credentialVersion !== input.login.credentialVersion
    ) {
      throw new Error("Mobile credentials are unavailable");
    }

    const issuedAt = input.issuedAt ?? new Date();
    const tokens = issueMobileTokenSet(issuedAt);
    const sessionId = crypto.randomUUID();
    const refreshFamilyId = crypto.randomUUID();

    await client.query(
      `INSERT INTO mobile_sessions (
         id, tenant_id, user_id, mobile_identity_id, principal_type,
         access_token_hash, refresh_token_hash, refresh_family_id,
         refresh_rotation, credential_version, issued_at, last_seen_at,
         access_expires_at, refresh_expires_at, device_id_hash,
         device_platform, app_version, ip_hash, user_agent_hash
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::mobile_principal_type,
         $6::text, $7::text, $8::uuid, 0, $9::bigint,
         $10::timestamptz, $10::timestamptz, $11::timestamptz,
         $12::timestamptz, $13::text, $14::text, $15::text, $16::text, $17::text
       )`,
      [
        sessionId,
        input.login.tenantId,
        input.login.userId,
        input.login.mobileIdentityId,
        input.login.principalType,
        tokens.accessTokenHash,
        tokens.refreshTokenHash,
        refreshFamilyId,
        input.login.credentialVersion,
        issuedAt,
        tokens.accessExpiresAt,
        tokens.refreshExpiresAt,
        input.metadata.deviceIdHash,
        input.metadata.devicePlatform,
        input.metadata.appVersion,
        input.metadata.ipHash,
        input.metadata.userAgentHash,
      ],
    );

    return {
      ...tokens,
      sessionId,
      refreshFamilyId,
      tenantId: input.login.tenantId,
      principalType: input.login.principalType,
      mobileIdentityId: input.login.mobileIdentityId,
      credentialVersion: input.login.credentialVersion,
    };
  });
}

async function locateToken(
  client: PoolClient,
  tokenHash: string,
  tokenKind: "access" | "refresh",
): Promise<LocatorRow | null> {
  const result = await client.query<LocatorRow>(
    `SELECT token_hash AS "tokenHash", token_kind AS "tokenKind",
            tenant_id AS "tenantId", session_id AS "sessionId",
            user_id AS "userId", refresh_family_id AS "refreshFamilyId",
            rotation::int, state, expires_at AS "expiresAt"
       FROM mobile_token_locators
      WHERE token_hash = $1::text AND token_kind = $2::text
      LIMIT 1
      FOR UPDATE`,
    [tokenHash, tokenKind],
  );
  return result.rows[0] ?? null;
}

function validAccessSession(row: AccessRow, now: number): boolean {
  if (
    row.userStatus !== "active"
    || row.credentialDisabledAt !== null
    || Number(row.credentialVersion) !== Number(row.currentCredentialVersion)
    || row.accessExpiresAt.getTime() <= now
    || row.refreshExpiresAt.getTime() <= now
  ) return false;

  if (row.principalType === "school") {
    return row.mobileIdentityId === null
      && row.schoolMembershipStatus === "active"
      && row.roleKey !== null;
  }
  return row.mobileIdentityId !== null
    && row.identityStatus === "active"
    && row.identityAudience === row.principalType
    && row.identityUserId === row.userId;
}

async function authoritativeAccessRow(
  client: PoolClient,
  locator: LocatorRow,
): Promise<AccessRow | null> {
  await enableTenant(client, locator.tenantId);
  const result = await client.query<AccessRow>(
    `SELECT
       s.id AS "sessionId", s.user_id AS "userId", u.email,
       u.full_name AS "fullName", u.status::text AS "userStatus",
       s.tenant_id AS "tenantId", s.principal_type::text AS "principalType",
       s.mobile_identity_id AS "mobileIdentityId",
       s.credential_version::int AS "credentialVersion",
       c.credential_version::int AS "currentCredentialVersion",
       c.disabled_at AS "credentialDisabledAt",
       s.issued_at AS "issuedAt",
       s.last_seen_at AS "lastSeenAt",
       s.access_expires_at AS "accessExpiresAt",
       s.refresh_expires_at AS "refreshExpiresAt",
       s.device_platform AS "devicePlatform",
       s.app_version AS "appVersion",
       i.status::text AS "identityStatus",
       i.audience::text AS "identityAudience",
       i.user_id AS "identityUserId",
       m.status::text AS "schoolMembershipStatus",
       m.role_key AS "roleKey"
     FROM mobile_sessions s
     JOIN users u ON u.id = s.user_id
     JOIN auth_credentials c ON c.user_id = s.user_id
     LEFT JOIN mobile_identities i
       ON i.tenant_id = s.tenant_id AND i.id = s.mobile_identity_id
     LEFT JOIN LATERAL (
       SELECT membership.status, membership.role_key
       FROM memberships membership
       WHERE membership.tenant_id = s.tenant_id
         AND membership.user_id = s.user_id
       ORDER BY CASE WHEN membership.status = 'active' THEN 0 ELSE 1 END,
                membership.created_at
       LIMIT 1
     ) m ON true
     WHERE s.tenant_id = $1::uuid
       AND s.id = $2::uuid
       AND s.access_token_hash = $3::text
       AND s.revoked_at IS NULL
     LIMIT 1
     FOR UPDATE OF s`,
    [locator.tenantId, locator.sessionId, locator.tokenHash],
  );
  return result.rows[0] ?? null;
}

export async function resolveMobileAccessToken(
  accessToken: string,
): Promise<MobileAuthenticatedPrincipal | null> {
  if (!isWellFormedMobileToken(accessToken)) return null;
  return transaction(async (client) => {
    const tokenHash = hashMobileToken(accessToken);
    const locator = await locateToken(client, tokenHash, "access");
    if (!locator || locator.state !== "active") return null;
    if (locator.expiresAt.getTime() <= Date.now()) {
      await client.query(
        `UPDATE mobile_token_locators
            SET state = 'expired', updated_at = now()
          WHERE token_hash = $1::text AND state = 'active'`,
        [tokenHash],
      );
      return null;
    }

    const row = await authoritativeAccessRow(client, locator);
    if (!row) return null;
    if (!validAccessSession(row, Date.now())) {
      await client.query(
        `UPDATE mobile_sessions
            SET revoked_at = COALESCE(revoked_at, now()),
                revoke_reason = COALESCE(revoke_reason, 'invalid_or_expired')
          WHERE tenant_id = $1::uuid AND id = $2::uuid`,
        [locator.tenantId, locator.sessionId],
      );
      return null;
    }

    const touched = await client.query<{ lastSeenAt: Date }>(
      `UPDATE mobile_sessions SET last_seen_at = now()
        WHERE tenant_id = $1::uuid AND id = $2::uuid AND revoked_at IS NULL
        RETURNING last_seen_at AS "lastSeenAt"`,
      [locator.tenantId, locator.sessionId],
    );
    const lastSeenAt = touched.rows[0]?.lastSeenAt ?? row.lastSeenAt;

    return {
      sessionId: row.sessionId,
      userId: row.userId,
      email: row.email,
      fullName: row.fullName,
      tenantId: row.tenantId,
      principalType: row.principalType,
      mobileIdentityId: row.mobileIdentityId,
      roleKey: row.roleKey,
      credentialVersion: Number(row.credentialVersion),
      issuedAt: row.issuedAt.toISOString(),
      lastSeenAt: lastSeenAt.toISOString(),
      accessExpiresAt: row.accessExpiresAt.toISOString(),
      refreshExpiresAt: row.refreshExpiresAt.toISOString(),
      devicePlatform: row.devicePlatform,
      appVersion: row.appVersion,
    };
  });
}

async function replayRefresh(
  client: PoolClient,
  locator: LocatorRow,
  metadata: MobileSessionMetadata,
): Promise<MobileRefreshResult> {
  await enableTenant(client, locator.tenantId);
  await client.query(
    `UPDATE mobile_refresh_token_uses
        SET replay_detected_at = COALESCE(replay_detected_at, now())
      WHERE tenant_id = $1::uuid AND token_hash = $2::text`,
    [locator.tenantId, locator.tokenHash],
  );
  await client.query(
    `UPDATE mobile_sessions
        SET revoked_at = COALESCE(revoked_at, now()),
            revoke_reason = COALESCE(revoke_reason, 'refresh_replay')
      WHERE tenant_id = $1::uuid
        AND refresh_family_id = $2::uuid`,
    [locator.tenantId, locator.refreshFamilyId],
  );
  await client.query(
    `UPDATE mobile_device_registrations
        SET status = 'revoked',
            revoked_at = COALESCE(revoked_at, now()),
            updated_at = now()
      WHERE tenant_id = $1::uuid
        AND session_id IN (
          SELECT id FROM mobile_sessions
           WHERE tenant_id = $1::uuid AND refresh_family_id = $2::uuid
        )
        AND status = 'active'`,
    [locator.tenantId, locator.refreshFamilyId],
  );
  await client.query(
    `INSERT INTO audit_events (
       tenant_id, actor_id, action, resource_type, resource_id,
       reason, ip_hash, metadata
     ) VALUES (
       $1::uuid, $2::uuid, 'mobile.auth.refresh.replay',
       'authentication', $3::text, 'failure', $4::text, $5::jsonb
     )`,
    [
      locator.tenantId,
      locator.userId,
      locator.sessionId,
      metadata.ipHash,
      JSON.stringify({
        deviceIdHash: metadata.deviceIdHash,
        devicePlatform: metadata.devicePlatform,
        appVersion: metadata.appVersion,
        userAgentHash: metadata.userAgentHash,
      }),
    ],
  );
  return { status: "replay" };
}

export async function rotateMobileRefreshToken(
  refreshToken: string,
  metadata: MobileSessionMetadata,
): Promise<MobileRefreshResult> {
  if (!isWellFormedMobileToken(refreshToken)) return { status: "invalid" };
  return transaction(async (client) => {
    const tokenHash = hashMobileToken(refreshToken);
    const locator = await locateToken(client, tokenHash, "refresh");
    if (!locator) return { status: "invalid" };
    if (locator.state === "used") return replayRefresh(client, locator, metadata);
    if (
      locator.state !== "active"
      || locator.expiresAt.getTime() <= Date.now()
    ) {
      if (locator.state === "active") {
        await client.query(
          `UPDATE mobile_token_locators
              SET state = 'expired', updated_at = now()
            WHERE token_hash = $1::text AND state = 'active'`,
          [tokenHash],
        );
      }
      return { status: "invalid" };
    }

    await enableTenant(client, locator.tenantId);
    const current = await client.query<{
      sessionId: string;
      tenantId: string;
      principalType: MobilePrincipalType;
      mobileIdentityId: string | null;
      refreshFamilyId: string;
      refreshRotation: number;
      credentialVersion: number;
      userStatus: string;
      credentialDisabledAt: Date | null;
      currentCredentialVersion: number;
      refreshExpiresAt: Date;
      relationshipActive: boolean;
    }>(
      `SELECT s.id AS "sessionId", s.tenant_id AS "tenantId",
              s.principal_type::text AS "principalType",
              s.mobile_identity_id AS "mobileIdentityId",
              s.refresh_family_id AS "refreshFamilyId",
              s.refresh_rotation::int AS "refreshRotation",
              s.credential_version::int AS "credentialVersion",
              u.status::text AS "userStatus",
              c.disabled_at AS "credentialDisabledAt",
              c.credential_version::int AS "currentCredentialVersion",
              s.refresh_expires_at AS "refreshExpiresAt",
              CASE WHEN s.principal_type = 'school' THEN EXISTS (
                SELECT 1 FROM memberships m
                 WHERE m.tenant_id = s.tenant_id
                   AND m.user_id = s.user_id
                   AND m.status = 'active'
              ) ELSE EXISTS (
                SELECT 1 FROM mobile_identities i
                 WHERE i.tenant_id = s.tenant_id
                   AND i.id = s.mobile_identity_id
                   AND i.user_id = s.user_id
                   AND i.audience::text = s.principal_type::text
                   AND i.status = 'active'
              ) END AS "relationshipActive"
         FROM mobile_sessions s
         JOIN users u ON u.id = s.user_id
         JOIN auth_credentials c ON c.user_id = s.user_id
        WHERE s.tenant_id = $1::uuid
          AND s.id = $2::uuid
          AND s.refresh_token_hash = $3::text
          AND s.revoked_at IS NULL
        LIMIT 1
        FOR UPDATE OF s`,
      [locator.tenantId, locator.sessionId, tokenHash],
    );
    const row = current.rows[0];
    const invalid = !row
      || row.userStatus !== "active"
      || row.credentialDisabledAt !== null
      || row.credentialVersion !== row.currentCredentialVersion
      || row.refreshExpiresAt.getTime() <= Date.now()
      || !row.relationshipActive
      || row.refreshRotation !== locator.rotation;
    if (invalid) {
      if (row) {
        await client.query(
          `UPDATE mobile_sessions
              SET revoked_at = COALESCE(revoked_at, now()),
                  revoke_reason = COALESCE(revoke_reason, 'invalid_or_expired')
            WHERE tenant_id = $1::uuid AND id = $2::uuid`,
          [locator.tenantId, locator.sessionId],
        );
      }
      return { status: "invalid" };
    }

    const issuedAt = new Date();
    const tokens = issueMobileTokenSet(issuedAt);
    const rotated = await client.query<{
      sessionId: string;
      tenantId: string;
      principalType: MobilePrincipalType;
      mobileIdentityId: string | null;
      refreshFamilyId: string;
      credentialVersion: number;
    }>(
      `UPDATE mobile_sessions
          SET access_token_hash = $1::text,
              refresh_token_hash = $2::text,
              refresh_rotation = refresh_rotation + 1,
              last_seen_at = $3::timestamptz,
              access_expires_at = $4::timestamptz,
              refresh_expires_at = $5::timestamptz,
              device_id_hash = $6::text,
              device_platform = $7::text,
              app_version = $8::text,
              ip_hash = $9::text,
              user_agent_hash = $10::text
        WHERE tenant_id = $11::uuid
          AND id = $12::uuid
          AND refresh_token_hash = $13::text
          AND refresh_rotation = $14::bigint
          AND revoked_at IS NULL
        RETURNING id AS "sessionId", tenant_id AS "tenantId",
                  principal_type::text AS "principalType",
                  mobile_identity_id AS "mobileIdentityId",
                  refresh_family_id AS "refreshFamilyId",
                  credential_version::int AS "credentialVersion"`,
      [
        tokens.accessTokenHash,
        tokens.refreshTokenHash,
        issuedAt,
        tokens.accessExpiresAt,
        tokens.refreshExpiresAt,
        metadata.deviceIdHash,
        metadata.devicePlatform,
        metadata.appVersion,
        metadata.ipHash,
        metadata.userAgentHash,
        locator.tenantId,
        locator.sessionId,
        tokenHash,
        locator.rotation,
      ],
    );
    const result = rotated.rows[0];
    if (!result) {
      const latest = await locateToken(client, tokenHash, "refresh");
      return latest?.state === "used"
        ? replayRefresh(client, latest, metadata)
        : { status: "invalid" };
    }

    return {
      status: "rotated",
      session: {
        ...tokens,
        sessionId: result.sessionId,
        refreshFamilyId: result.refreshFamilyId,
        tenantId: result.tenantId,
        principalType: result.principalType,
        mobileIdentityId: result.mobileIdentityId,
        credentialVersion: Number(result.credentialVersion),
      },
    };
  });
}

export async function revokeMobileSession(
  tenantId: string,
  sessionId: string,
  reason: string,
): Promise<void> {
  await transaction(async (client) => {
    await enableTenant(client, tenantId);
    await client.query(
      `UPDATE mobile_sessions
          SET revoked_at = COALESCE(revoked_at, now()),
              revoke_reason = COALESCE(revoke_reason, $1::text)
        WHERE tenant_id = $2::uuid AND id = $3::uuid`,
      [safeReason(reason), tenantId, sessionId],
    );
    await client.query(
      `UPDATE mobile_device_registrations
          SET status = 'revoked',
              revoked_at = COALESCE(revoked_at, now()),
              updated_at = now()
        WHERE tenant_id = $1::uuid AND session_id = $2::uuid
          AND status = 'active'`,
      [tenantId, sessionId],
    );
  });
}

export async function revokeMobileSessionByAccessToken(
  accessToken: string,
  reason: string,
): Promise<void> {
  if (!isWellFormedMobileToken(accessToken)) return;
  await transaction(async (client) => {
    const locator = await locateToken(
      client,
      hashMobileToken(accessToken),
      "access",
    );
    if (!locator || locator.state !== "active") return;
    await enableTenant(client, locator.tenantId);
    await client.query(
      `UPDATE mobile_sessions
          SET revoked_at = COALESCE(revoked_at, now()),
              revoke_reason = COALESCE(revoke_reason, $1::text)
        WHERE tenant_id = $2::uuid AND id = $3::uuid`,
      [safeReason(reason), locator.tenantId, locator.sessionId],
    );
    await client.query(
      `UPDATE mobile_device_registrations
          SET status = 'revoked',
              revoked_at = COALESCE(revoked_at, now()),
              updated_at = now()
        WHERE tenant_id = $1::uuid AND session_id = $2::uuid
          AND status = 'active'`,
      [locator.tenantId, locator.sessionId],
    );
  });
}

export async function revokeMobileUserSessions(
  userId: string,
  reason: string,
): Promise<void> {
  await transaction(async (client) => {
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
        [safeReason(reason), tenantId, userId],
      );
      await client.query(
        `UPDATE mobile_device_registrations
            SET status = 'revoked',
                revoked_at = COALESCE(revoked_at, now()),
                updated_at = now()
          WHERE tenant_id = $1::uuid AND user_id = $2::uuid
            AND status = 'active'`,
        [tenantId, userId],
      );
    }
  });
}

export async function listActiveMobileAssignments(
  tenantId: string,
  mobileIdentityId: string,
): Promise<MobileAssignment[]> {
  return transaction(async (client) => {
    await enableTenant(client, tenantId);
    const result = await client.query<MobileAssignment>(
      `SELECT id, tenant_id AS "tenantId",
              mobile_identity_id AS "mobileIdentityId",
              resource_type AS "resourceType", resource_id AS "resourceId",
              status::text AS status
         FROM mobile_identity_assignments
        WHERE tenant_id = $1::uuid
          AND mobile_identity_id = $2::uuid
          AND status = 'active'
        ORDER BY resource_type, resource_id`,
      [tenantId, mobileIdentityId],
    );
    return result.rows;
  });
}

export async function mobileAccessForPrincipal(
  principal: MobileAuthenticatedPrincipal,
): Promise<MobileAccessSummary> {
  return transaction(async (client) => {
    await enableTenant(client, principal.tenantId);
    await enableAccessPolicyService(client);

    const moduleResult = await client.query<{
      moduleKey: string;
      enabled: boolean;
    }>(
      `SELECT module_key AS "moduleKey", enabled
         FROM module_policies
        WHERE tenant_id = $1::uuid`,
      [principal.tenantId],
    );
    const enabledSchoolModules = new Set(
      moduleResult.rows
        .filter((row) => row.enabled)
        .map((row) => row.moduleKey),
    );

    if (principal.principalType === "school") {
      const permissions = principal.roleKey
        ? await client.query<{ permission: string }>(
          `SELECT rp.permission
             FROM roles r
             JOIN role_permissions rp
               ON rp.tenant_id = r.tenant_id AND rp.role_id = r.id
            WHERE r.tenant_id = $1::uuid AND r.key = $2::text`,
          [principal.tenantId, principal.roleKey],
        )
        : { rows: [] as Array<{ permission: string }> };
      const effective = resolveEffectiveSchoolModuleAccess({
        policies: moduleResult.rows,
        rolePermissions: new Set(
          permissions.rows.map((row) => row.permission),
        ),
      });
      return {
        tenantId: principal.tenantId,
        principalType: principal.principalType,
        modules: effective
          .filter((entry) => entry.accessible)
          .map((entry) => ({
            key: entry.module.key,
            label: entry.module.label,
            canManage: entry.module.requiredManagementPermissions.every((permission) =>
              permissions.rows.some((row) => row.permission === permission)
            ),
          })),
        features: [],
        assignments: [],
      };
    }

    const planResult = await client.query<{
      audience: "parent" | "student" | "transporter";
      featureKey: string;
      enabled: boolean;
    }>(
      `SELECT policy.audience::text AS audience,
              policy.feature_key AS "featureKey", policy.enabled
         FROM plan_app_feature_policies policy
        WHERE policy.plan_id = (
          SELECT subscription.plan_id
            FROM subscriptions subscription
           WHERE subscription.tenant_id = $1::uuid
             AND subscription.status IN ('trial', 'active')
           ORDER BY subscription.created_at DESC
           LIMIT 1
        )
          AND policy.audience::text = $2::text`,
      [principal.tenantId, principal.principalType],
    );
    const tenantResult = await client.query<{
      audience: "parent" | "student" | "transporter";
      featureKey: string;
      enabled: boolean;
    }>(
      `SELECT audience::text AS audience,
              feature_key AS "featureKey", enabled
         FROM tenant_app_feature_policies
        WHERE tenant_id = $1::uuid AND audience::text = $2::text`,
      [principal.tenantId, principal.principalType],
    );
    const effective = resolveEffectiveAppFeatureAccess({
      audience: principal.principalType,
      planPolicies: planResult.rows,
      tenantPolicies: tenantResult.rows,
      enabledSchoolModules,
    });
    const assignments = principal.mobileIdentityId
      ? await client.query<MobileAssignment>(
        `SELECT id, tenant_id AS "tenantId",
                mobile_identity_id AS "mobileIdentityId",
                resource_type AS "resourceType", resource_id AS "resourceId",
                status::text AS status
           FROM mobile_identity_assignments
          WHERE tenant_id = $1::uuid
            AND mobile_identity_id = $2::uuid
            AND status = 'active'
          ORDER BY resource_type, resource_id`,
        [principal.tenantId, principal.mobileIdentityId],
      )
      : { rows: [] as MobileAssignment[] };

    return {
      tenantId: principal.tenantId,
      principalType: principal.principalType,
      modules: [],
      features: effective
        .filter((entry) => entry.accessible)
        .map((entry) => ({
          key: entry.feature.key,
          label: entry.feature.label,
          requiredSchoolModule: entry.feature.requiredSchoolModule,
        })),
      assignments: assignments.rows,
    };
  });
}
