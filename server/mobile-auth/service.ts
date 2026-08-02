import { z } from "zod";
import {
  privacyHash,
} from "../auth/crypto.ts";
import {
  hashPassword,
  verifyPassword,
} from "../auth/password.ts";
import {
  authRateLimit,
} from "../auth/rate-limit.ts";
import {
  replacePassword,
  writeSecurityEvent,
} from "../auth/repository.ts";
import {
  createMobileSession,
  findMobileLoginRecord,
  listActiveMobileAssignments,
  resolveMobileAccessToken,
  revokeMobileSession,
  revokeMobileSessionByAccessToken,
  rotateMobileRefreshToken,
} from "./repository.ts";
import {
  mobileBearerTokenFromRequest,
} from "./tokens.ts";
import type {
  MobileAssignment,
  MobileAuthenticatedPrincipal,
  MobileLoginRecord,
  MobileRefreshResult,
  MobileSessionCreation,
  MobileSessionMetadata,
} from "./types.ts";

const mobilePrincipalSchema = z.enum([
  "school",
  "parent",
  "student",
  "transporter",
]);

const mobileDeviceSchema = z.object({
  deviceId: z.string()
    .trim()
    .min(1)
    .max(512)
    .nullable()
    .optional(),
  devicePlatform: z.enum([
    "android",
    "ios",
  ]),
  appVersion: z.string()
    .trim()
    .min(1)
    .max(64),
}).strict();

export const mobileLoginInputSchema = mobileDeviceSchema.extend({
  email: z.string()
    .trim()
    .email()
    .max(254),
  password: z.string()
    .min(1)
    .max(1_024),
  tenantId: z.string().uuid(),
  principalType: mobilePrincipalSchema,
}).strict();

export const mobileRefreshInputSchema = mobileDeviceSchema.extend({
  refreshToken: z.string()
    .regex(/^[A-Za-z0-9_-]{43}$/),
}).strict();

export type MobileLoginInput =
  z.infer<typeof mobileLoginInputSchema>;

export type MobileRefreshInput =
  z.infer<typeof mobileRefreshInputSchema>;

export type MobileLoginResult =
  | {
      status: "authenticated";
      actorUserId: string;
      session: MobileSessionCreation;
    }
  | {
      status: "invalid";
    }
  | {
      status: "rate_limited";
      retryAfter: number;
      delayMs: number;
    };

const dummyHashKey =
  Symbol.for("hig.mobile-auth.dummy-hash");

type MobileAuthGlobal = typeof globalThis & {
  [dummyHashKey]?: Promise<string>;
};

function dummyPasswordHash(): Promise<string> {
  const target = globalThis as MobileAuthGlobal;

  return target[dummyHashKey] ??= hashPassword(
    "This is a non-account mobile dummy password 2026",
  );
}

export function parseMobileLoginInput(
  value: unknown,
): MobileLoginInput {
  return mobileLoginInputSchema.parse(value);
}

export function parseMobileRefreshInput(
  value: unknown,
): MobileRefreshInput {
  return mobileRefreshInputSchema.parse(value);
}

export function mobileClientAddress(
  request: Request,
): string {
  return request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .at(-1)
    ?? "unknown";
}

export function mobileRequestMetadata(
  request: Request,
  device: {
    deviceId?: string | null;
    devicePlatform: "android" | "ios";
    appVersion: string;
  },
): MobileSessionMetadata {
  return {
    deviceIdHash: device.deviceId
      ? privacyHash(device.deviceId)
      : null,
    devicePlatform: device.devicePlatform,
    appVersion: device.appVersion,
    ipHash: privacyHash(
      mobileClientAddress(request),
    ),
    userAgentHash: privacyHash(
      request.headers.get("user-agent") ?? "unknown",
    ),
  };
}

function loginRelationshipIsActive(
  record: MobileLoginRecord | null,
): record is MobileLoginRecord {
  if (
    !record
    || record.status !== "active"
    || record.disabled
    || record.relationshipStatus !== "active"
  ) {
    return false;
  }

  if (record.principalType === "school") {
    return record.mobileIdentityId === null
      && record.roleKey !== null;
  }

  return record.mobileIdentityId !== null
    && record.roleKey === null;
}

function auditTenantId(
  record: MobileLoginRecord | null,
): string | null {
  return record?.relationshipStatus
    ? record.tenantId
    : null;
}

async function writeMobileLoginFailure(
  input: MobileLoginInput,
  record: MobileLoginRecord | null,
  metadata: MobileSessionMetadata,
  reason: "invalid_credentials" | "rate_limited",
): Promise<void> {
  await writeSecurityEvent({
    tenantId: auditTenantId(record),
    actorId: record?.userId ?? null,
    action: "mobile.auth.login",
    outcome: "failure",
    ipHash: metadata.ipHash,
    metadata: {
      reason,
      emailHash: privacyHash(
        input.email.trim().toLowerCase(),
      ),
      principalType: input.principalType,
      deviceIdHash: metadata.deviceIdHash,
      devicePlatform: metadata.devicePlatform,
      appVersion: metadata.appVersion,
      userAgentHash: metadata.userAgentHash,
    },
  });
}

export async function authenticateMobilePassword(
  input: MobileLoginInput,
  request: Request,
): Promise<MobileLoginResult> {
  const email = input.email.trim().toLowerCase();

  const metadata = mobileRequestMetadata(
    request,
    input,
  );

  const limit = await authRateLimit(
    "login",
    `${input.tenantId}:${input.principalType}:${email}`,
    mobileClientAddress(request),
  );

  if (!limit.allowed) {
    await writeMobileLoginFailure(
      input,
      null,
      metadata,
      "rate_limited",
    );

    return {
      status: "rate_limited",
      retryAfter: limit.retryAfter,
      delayMs: limit.delayMs,
    };
  }

  const record = await findMobileLoginRecord({
    email,
    tenantId: input.tenantId,
    principalType: input.principalType,
  });

  const comparison = await verifyPassword(
    record?.passwordHash
      ?? await dummyPasswordHash(),
    input.password,
  );

  if (
    !comparison.valid
    || !loginRelationshipIsActive(record)
  ) {
    await writeMobileLoginFailure(
      input,
      record,
      metadata,
      "invalid_credentials",
    );

    return { status: "invalid" };
  }

  let currentRecord = record;

  if (comparison.needsRehash) {
    await replacePassword(
      record.userId,
      await hashPassword(input.password),
    );

    const refreshed =
      await findMobileLoginRecord({
        email,
        tenantId: input.tenantId,
        principalType: input.principalType,
      });

    if (!loginRelationshipIsActive(refreshed)) {
      await writeMobileLoginFailure(
        input,
        refreshed,
        metadata,
        "invalid_credentials",
      );

      return { status: "invalid" };
    }

    currentRecord = refreshed;
  }

  const session = await createMobileSession({
    login: currentRecord,
    metadata,
  });

  await writeSecurityEvent({
    tenantId: currentRecord.tenantId,
    actorId: currentRecord.userId,
    action: "mobile.auth.login",
    outcome: "success",
    ipHash: metadata.ipHash,
    metadata: {
      principalType: currentRecord.principalType,
      deviceIdHash: metadata.deviceIdHash,
      devicePlatform: metadata.devicePlatform,
      appVersion: metadata.appVersion,
      userAgentHash: metadata.userAgentHash,
    },
  });

  return {
    status: "authenticated",
    actorUserId: currentRecord.userId,
    session,
  };
}

export async function authenticatedMobilePrincipal(
  request: Request,
): Promise<MobileAuthenticatedPrincipal | null> {
  const token = mobileBearerTokenFromRequest(request);

  return token
    ? resolveMobileAccessToken(token)
    : null;
}

export async function refreshMobileSession(
  input: MobileRefreshInput,
  request: Request,
): Promise<MobileRefreshResult> {
  const metadata = mobileRequestMetadata(
    request,
    input,
  );

  const result = await rotateMobileRefreshToken(
    input.refreshToken,
    metadata,
  );

  await writeSecurityEvent({
    tenantId: result.status === "rotated"
      ? result.session.tenantId
      : null,
    action: result.status === "replay"
      ? "mobile.auth.refresh_replay"
      : "mobile.auth.refresh",
    outcome: result.status === "rotated"
      ? "success"
      : "failure",
    ipHash: metadata.ipHash,
    metadata: {
      result: result.status,
      principalType: result.status === "rotated"
        ? result.session.principalType
        : null,
      deviceIdHash: metadata.deviceIdHash,
      devicePlatform: metadata.devicePlatform,
      appVersion: metadata.appVersion,
      userAgentHash: metadata.userAgentHash,
    },
  });

  return result;
}

export async function logoutMobileSession(
  request: Request,
): Promise<boolean> {
  const token = mobileBearerTokenFromRequest(request);

  if (!token) {
    return false;
  }

  const actor = await resolveMobileAccessToken(token);

  if (!actor) {
    await revokeMobileSessionByAccessToken(
      token,
      "logout",
    );

    return false;
  }

  await revokeMobileSession(
    actor.sessionId,
    "logout",
  );

  const metadata = mobileRequestMetadata(
    request,
    {
      devicePlatform: request.headers
        .get("x-hig-device-platform") === "ios"
        ? "ios"
        : "android",
      appVersion: request.headers
        .get("x-hig-app-version")
        ?.trim()
        .slice(0, 64)
        || "unknown",
      deviceId: request.headers
        .get("x-hig-device-id"),
    },
  );

  await writeSecurityEvent({
    tenantId: actor.tenantId,
    actorId: actor.userId,
    action: "mobile.auth.logout",
    outcome: "success",
    ipHash: metadata.ipHash,
    metadata: {
      principalType: actor.principalType,
      deviceIdHash: metadata.deviceIdHash,
      devicePlatform: metadata.devicePlatform,
      appVersion: metadata.appVersion,
      userAgentHash: metadata.userAgentHash,
    },
  });

  return true;
}

export async function activeAssignmentsForPrincipal(
  principal: MobileAuthenticatedPrincipal,
): Promise<MobileAssignment[]> {
  if (!principal.mobileIdentityId) {
    return [];
  }

  return listActiveMobileAssignments(
    principal.tenantId,
    principal.mobileIdentityId,
  );
}
