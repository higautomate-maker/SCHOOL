import { noStoreHeaders } from "../auth/cookies.ts";
import { privacyHash } from "../auth/crypto.ts";
import { authRateLimit } from "../auth/rate-limit.ts";
import { mobileClientAddress } from "./service.ts";
import type {
  MobileAuthenticatedPrincipal,
  MobileSessionCreation,
} from "./types.ts";

export function mobileJson(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return Response.json(body, {
    status,
    headers: noStoreHeaders(extraHeaders),
  });
}

export function publicMobileSession(
  session: MobileSessionCreation,
): Record<string, unknown> {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    tokenType: "Bearer",
    accessExpiresAt: session.accessExpiresAt,
    refreshExpiresAt: session.refreshExpiresAt,
    sessionId: session.sessionId,
    tenantId: session.tenantId,
    principalType: session.principalType,
    mobileIdentityId: session.mobileIdentityId,
  };
}

export function publicMobilePrincipal(
  principal: MobileAuthenticatedPrincipal,
): Record<string, unknown> {
  return {
    sessionId: principal.sessionId,
    user: {
      id: principal.userId,
      email: principal.email,
      name: principal.fullName,
    },
    tenantId: principal.tenantId,
    principalType: principal.principalType,
    schoolMembership: principal.principalType === "school"
      ? { roleKey: principal.roleKey }
      : null,
    mobileRelationship: principal.principalType === "school"
      ? null
      : {
          id: principal.mobileIdentityId,
          audience: principal.principalType,
        },
    accessExpiresAt: principal.accessExpiresAt,
    refreshExpiresAt: principal.refreshExpiresAt,
    sessionMetadata: {
      issuedAt: principal.issuedAt,
      lastSeenAt: principal.lastSeenAt,
      devicePlatform: principal.devicePlatform,
      appVersion: principal.appVersion,
    },
  };
}

export async function mobileSensitiveLimit(
  request: Request,
  subject: string,
): Promise<{
  allowed: boolean;
  retryAfter: number;
  delayMs: number;
}> {
  return authRateLimit(
    "sensitive",
    privacyHash(subject),
    mobileClientAddress(request),
  );
}
