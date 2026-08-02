import { database } from "#db-runtime";
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
  disabledAt: string | null;
  relationshipStatus: string | null;
  roleKey: string | null;
  mobileIdentityId: string | null;
};

type AccessSessionRow = {
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
  credentialDisabledAt: string | null;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  identityStatus: string | null;
  identityAudience: string | null;
  identityUserId: string | null;
  schoolMembershipStatus: string | null;
  roleKey: string | null;
};

type RotatedSessionRow = {
  sessionId: string;
  tenantId: string;
  principalType: MobilePrincipalType;
  mobileIdentityId: string | null;
  refreshFamilyId: string;
  credentialVersion: number;
};

type ConsumedRefreshRow = {
  sessionId: string;
  refreshFamilyId: string;
};

const nowIso = (): string => new Date().toISOString();

function safeReason(reason: string): string {
  const normalized = reason.trim().slice(0, 120);

  return normalized || "revoked";
}

function relationshipStatus(
  value: string | null,
): MobileIdentityStatus | null {
  if (
    value === "invited"
    || value === "active"
    || value === "suspended"
    || value === "revoked"
  ) {
    return value;
  }

  return null;
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
    relationshipStatus:
      relationshipStatus(row.relationshipStatus),
    roleKey: row.roleKey,
  };
}

export async function findMobileLoginRecord(
  input: FindMobileLoginInput,
): Promise<MobileLoginRecord | null> {
  const email = input.email.trim().toLowerCase();

  if (input.principalType === "school") {
    const row = await database.prepare(`
      SELECT
        u.id AS userId,
        u.email AS email,
        u.full_name AS fullName,
        u.status AS status,
        c.password_hash AS passwordHash,
        c.credential_version AS credentialVersion,
        c.disabled_at AS disabledAt,
        m.status AS relationshipStatus,
        m.role_key AS roleKey,
        NULL AS mobileIdentityId
      FROM users u
      JOIN auth_credentials c
        ON c.user_id = u.id
      LEFT JOIN memberships m
        ON m.user_id = u.id
       AND m.tenant_id = ?
      WHERE lower(u.email) = lower(?)
      ORDER BY
        CASE
          WHEN m.status = 'active' THEN 0
          WHEN m.status IS NULL THEN 2
          ELSE 1
        END,
        m.created_at
      LIMIT 1
    `).bind(
      input.tenantId,
      email,
    ).first<LoginRow>();

    return row ? loginRecord(row, input) : null;
  }

  const row = await database.prepare(`
    SELECT
      u.id AS userId,
      u.email AS email,
      u.full_name AS fullName,
      u.status AS status,
      c.password_hash AS passwordHash,
      c.credential_version AS credentialVersion,
      c.disabled_at AS disabledAt,
      i.status AS relationshipStatus,
      NULL AS roleKey,
      i.id AS mobileIdentityId
    FROM users u
    JOIN auth_credentials c
      ON c.user_id = u.id
    LEFT JOIN mobile_identities i
      ON i.user_id = u.id
     AND i.tenant_id = ?
     AND i.audience = ?
    WHERE lower(u.email) = lower(?)
    ORDER BY
      CASE
        WHEN i.status = 'active' THEN 0
        WHEN i.status IS NULL THEN 2
        ELSE 1
      END,
      i.created_at
    LIMIT 1
  `).bind(
    input.tenantId,
    input.principalType,
    email,
  ).first<LoginRow>();

  return row ? loginRecord(row, input) : null;
}

function assertCreatableLogin(
  login: MobileLoginRecord,
): void {
  if (
    login.status !== "active"
    || login.disabled
    || login.relationshipStatus !== "active"
  ) {
    throw new Error(
      "Active mobile authentication relationship is required",
    );
  }

  if (
    login.principalType === "school"
    && (
      login.mobileIdentityId !== null
      || login.roleKey === null
    )
  ) {
    throw new Error(
      "Active School membership is required",
    );
  }

  if (
    login.principalType !== "school"
    && (
      login.mobileIdentityId === null
      || login.roleKey !== null
    )
  ) {
    throw new Error(
      "Active mobile identity is required",
    );
  }
}

export async function createMobileSession(
  input: CreateMobileSessionInput,
): Promise<MobileSessionCreation> {
  assertCreatableLogin(input.login);

  const current = await database.prepare(`
    SELECT
      u.status AS userStatus,
      c.credential_version AS credentialVersion,
      c.disabled_at AS disabledAt
    FROM users u
    JOIN auth_credentials c
      ON c.user_id = u.id
    WHERE u.id = ?
    LIMIT 1
  `).bind(
    input.login.userId,
  ).first<{
    userStatus: string;
    credentialVersion: number;
    disabledAt: string | null;
  }>();

  if (
    !current
    || current.userStatus !== "active"
    || current.disabledAt !== null
    || Number(current.credentialVersion)
      !== input.login.credentialVersion
  ) {
    throw new Error(
      "Mobile credentials are unavailable",
    );
  }

  const issuedAt = input.issuedAt ?? new Date();
  const issuedAtIso = issuedAt.toISOString();
  const tokens = issueMobileTokenSet(issuedAt);

  const sessionId = crypto.randomUUID();
  const refreshFamilyId = crypto.randomUUID();

  await database.prepare(`
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
      refresh_expires_at,
      device_id_hash,
      device_platform,
      app_version,
      ip_hash,
      user_agent_hash
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      0,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?
    )
  `).bind(
    sessionId,
    input.login.tenantId,
    input.login.userId,
    input.login.mobileIdentityId,
    input.login.principalType,
    tokens.accessTokenHash,
    tokens.refreshTokenHash,
    refreshFamilyId,
    input.login.credentialVersion,
    issuedAtIso,
    issuedAtIso,
    tokens.accessExpiresAt,
    tokens.refreshExpiresAt,
    input.metadata.deviceIdHash,
    input.metadata.devicePlatform,
    input.metadata.appVersion,
    input.metadata.ipHash,
    input.metadata.userAgentHash,
  ).run();

  return {
    ...tokens,
    sessionId,
    refreshFamilyId,
    tenantId: input.login.tenantId,
    principalType: input.login.principalType,
    mobileIdentityId: input.login.mobileIdentityId,
    credentialVersion: input.login.credentialVersion,
  };
}

async function accessSessionRow(
  accessToken: string,
): Promise<AccessSessionRow | null> {
  return database.prepare(`
    SELECT
      s.id AS sessionId,
      s.user_id AS userId,
      u.email AS email,
      u.full_name AS fullName,
      u.status AS userStatus,
      s.tenant_id AS tenantId,
      s.principal_type AS principalType,
      s.mobile_identity_id AS mobileIdentityId,
      s.credential_version AS credentialVersion,
      c.credential_version AS currentCredentialVersion,
      c.disabled_at AS credentialDisabledAt,
      s.access_expires_at AS accessExpiresAt,
      s.refresh_expires_at AS refreshExpiresAt,
      i.status AS identityStatus,
      i.audience AS identityAudience,
      i.user_id AS identityUserId,
      (
        SELECT m.status
        FROM memberships m
        WHERE m.tenant_id = s.tenant_id
          AND m.user_id = s.user_id
        ORDER BY
          CASE WHEN m.status = 'active' THEN 0 ELSE 1 END,
          m.created_at
        LIMIT 1
      ) AS schoolMembershipStatus,
      (
        SELECT m.role_key
        FROM memberships m
        WHERE m.tenant_id = s.tenant_id
          AND m.user_id = s.user_id
          AND m.status = 'active'
        ORDER BY m.created_at
        LIMIT 1
      ) AS roleKey
    FROM mobile_sessions s
    JOIN users u
      ON u.id = s.user_id
    JOIN auth_credentials c
      ON c.user_id = s.user_id
    LEFT JOIN mobile_identities i
      ON i.tenant_id = s.tenant_id
     AND i.id = s.mobile_identity_id
    WHERE s.access_token_hash = ?
      AND s.revoked_at IS NULL
    LIMIT 1
  `).bind(
    hashMobileToken(accessToken),
  ).first<AccessSessionRow>();
}

function validAccessSession(
  row: AccessSessionRow,
  currentTime: number,
): boolean {
  if (
    row.userStatus !== "active"
    || row.credentialDisabledAt !== null
    || Number(row.credentialVersion)
      !== Number(row.currentCredentialVersion)
    || Date.parse(row.accessExpiresAt) <= currentTime
    || Date.parse(row.refreshExpiresAt) <= currentTime
  ) {
    return false;
  }

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

export async function resolveMobileAccessToken(
  accessToken: string,
): Promise<MobileAuthenticatedPrincipal | null> {
  if (!isWellFormedMobileToken(accessToken)) {
    return null;
  }

  const row = await accessSessionRow(accessToken);

  if (!row) {
    return null;
  }

  const currentTime = Date.now();

  if (!validAccessSession(row, currentTime)) {
    await revokeMobileSession(
      row.sessionId,
      "invalid_or_expired",
    );

    return null;
  }

  await database.prepare(`
    UPDATE mobile_sessions
       SET last_seen_at = ?
     WHERE id = ?
       AND revoked_at IS NULL
  `).bind(
    new Date(currentTime).toISOString(),
    row.sessionId,
  ).run();

  return {
    sessionId: row.sessionId,
    userId: row.userId,
    email: row.email,
    fullName: row.fullName,
    tenantId: row.tenantId,
    principalType: row.principalType,
    mobileIdentityId: row.mobileIdentityId,
    credentialVersion: Number(row.credentialVersion),
    accessExpiresAt: row.accessExpiresAt,
    refreshExpiresAt: row.refreshExpiresAt,
  };
}

export async function rotateMobileRefreshToken(
  refreshToken: string,
  metadata: MobileSessionMetadata,
): Promise<MobileRefreshResult> {
  if (!isWellFormedMobileToken(refreshToken)) {
    return { status: "invalid" };
  }

  const oldTokenHash = hashMobileToken(refreshToken);
  const rotatedAt = new Date();
  const rotatedAtIso = rotatedAt.toISOString();
  const tokens = issueMobileTokenSet(rotatedAt);

  const row = await database.prepare(`
    UPDATE mobile_sessions
       SET access_token_hash = ?,
           refresh_token_hash = ?,
           refresh_rotation = refresh_rotation + 1,
           last_seen_at = ?,
           access_expires_at = ?,
           refresh_expires_at = ?,
           device_id_hash = ?,
           device_platform = ?,
           app_version = ?,
           ip_hash = ?,
           user_agent_hash = ?
     WHERE refresh_token_hash = ?
       AND revoked_at IS NULL
       AND refresh_expires_at > ?
       AND EXISTS (
         SELECT 1
           FROM users u
           JOIN auth_credentials c
             ON c.user_id = u.id
          WHERE u.id = mobile_sessions.user_id
            AND u.status = 'active'
            AND c.disabled_at IS NULL
            AND c.credential_version
              = mobile_sessions.credential_version
       )
       AND (
         (
           principal_type = 'school'
           AND mobile_identity_id IS NULL
           AND EXISTS (
             SELECT 1
               FROM memberships m
              WHERE m.tenant_id
                = mobile_sessions.tenant_id
                AND m.user_id
                  = mobile_sessions.user_id
                AND m.status = 'active'
           )
         )
         OR
         (
           principal_type <> 'school'
           AND EXISTS (
             SELECT 1
               FROM mobile_identities i
              WHERE i.tenant_id
                = mobile_sessions.tenant_id
                AND i.id
                  = mobile_sessions.mobile_identity_id
                AND i.user_id
                  = mobile_sessions.user_id
                AND i.audience
                  = mobile_sessions.principal_type
                AND i.status = 'active'
           )
         )
       )
    RETURNING
      id AS sessionId,
      tenant_id AS tenantId,
      principal_type AS principalType,
      mobile_identity_id AS mobileIdentityId,
      refresh_family_id AS refreshFamilyId,
      credential_version AS credentialVersion
  `).bind(
    tokens.accessTokenHash,
    tokens.refreshTokenHash,
    rotatedAtIso,
    tokens.accessExpiresAt,
    tokens.refreshExpiresAt,
    metadata.deviceIdHash,
    metadata.devicePlatform,
    metadata.appVersion,
    metadata.ipHash,
    metadata.userAgentHash,
    oldTokenHash,
    rotatedAtIso,
  ).first<RotatedSessionRow>();

  if (row) {
    return {
      status: "rotated",
      session: {
        ...tokens,
        sessionId: row.sessionId,
        refreshFamilyId: row.refreshFamilyId,
        tenantId: row.tenantId,
        principalType: row.principalType,
        mobileIdentityId: row.mobileIdentityId,
        credentialVersion:
          Number(row.credentialVersion),
      },
    };
  }

  const consumed = await database.prepare(`
    SELECT
      session_id AS sessionId,
      refresh_family_id AS refreshFamilyId
    FROM mobile_refresh_token_uses
    WHERE token_hash = ?
    LIMIT 1
  `).bind(
    oldTokenHash,
  ).first<ConsumedRefreshRow>();

  if (consumed) {
    const detectedAt = nowIso();

    await database.batch([
      database.prepare(`
        UPDATE mobile_refresh_token_uses
           SET replay_detected_at =
             COALESCE(replay_detected_at, ?)
         WHERE token_hash = ?
      `).bind(
        detectedAt,
        oldTokenHash,
      ),

      database.prepare(`
        UPDATE mobile_sessions
           SET revoked_at = COALESCE(revoked_at, ?),
               revoke_reason =
                 COALESCE(revoke_reason, 'refresh_replay')
         WHERE refresh_family_id = ?
      `).bind(
        detectedAt,
        consumed.refreshFamilyId,
      ),
    ]);

    return { status: "replay" };
  }

  const current = await database.prepare(`
    SELECT id
    FROM mobile_sessions
    WHERE refresh_token_hash = ?
    LIMIT 1
  `).bind(
    oldTokenHash,
  ).first<{ id: string }>();

  if (current) {
    await revokeMobileSession(
      current.id,
      "invalid_or_expired",
    );
  }

  return { status: "invalid" };
}

export async function revokeMobileSession(
  sessionId: string,
  reason: string,
): Promise<void> {
  await database.prepare(`
    UPDATE mobile_sessions
       SET revoked_at = COALESCE(revoked_at, ?),
           revoke_reason = COALESCE(revoke_reason, ?)
     WHERE id = ?
  `).bind(
    nowIso(),
    safeReason(reason),
    sessionId,
  ).run();
}

export async function revokeMobileSessionByAccessToken(
  accessToken: string,
  reason: string,
): Promise<void> {
  if (!isWellFormedMobileToken(accessToken)) {
    return;
  }

  await database.prepare(`
    UPDATE mobile_sessions
       SET revoked_at = COALESCE(revoked_at, ?),
           revoke_reason = COALESCE(revoke_reason, ?)
     WHERE access_token_hash = ?
  `).bind(
    nowIso(),
    safeReason(reason),
    hashMobileToken(accessToken),
  ).run();
}

export async function revokeMobileUserSessions(
  userId: string,
  reason: string,
): Promise<void> {
  await database.prepare(`
    UPDATE mobile_sessions
       SET revoked_at = COALESCE(revoked_at, ?),
           revoke_reason = COALESCE(revoke_reason, ?)
     WHERE user_id = ?
       AND revoked_at IS NULL
  `).bind(
    nowIso(),
    safeReason(reason),
    userId,
  ).run();
}

export async function listActiveMobileAssignments(
  tenantId: string,
  mobileIdentityId: string,
): Promise<MobileAssignment[]> {
  const result = await database.prepare(`
    SELECT
      id,
      tenant_id AS tenantId,
      mobile_identity_id AS mobileIdentityId,
      resource_type AS resourceType,
      resource_id AS resourceId,
      status
    FROM mobile_identity_assignments
    WHERE tenant_id = ?
      AND mobile_identity_id = ?
      AND status = 'active'
    ORDER BY resource_type, resource_id
  `).bind(
    tenantId,
    mobileIdentityId,
  ).all<MobileAssignment>();

  return result.results;
}
