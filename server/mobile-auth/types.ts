export const mobilePrincipalTypes = [
  "school",
  "parent",
  "student",
  "transporter",
] as const;

export type MobilePrincipalType =
  (typeof mobilePrincipalTypes)[number];

export const mobileAudiences = [
  "parent",
  "student",
  "transporter",
] as const;

export type MobileAudience =
  (typeof mobileAudiences)[number];

export const mobileIdentityStatuses = [
  "invited",
  "active",
  "suspended",
  "revoked",
] as const;

export type MobileIdentityStatus =
  (typeof mobileIdentityStatuses)[number];

export const mobileAssignmentStatuses = [
  "active",
  "suspended",
  "revoked",
] as const;

export type MobileAssignmentStatus =
  (typeof mobileAssignmentStatuses)[number];

export const mobileResourceTypes = [
  "student",
  "vehicle",
  "route",
  "trip",
] as const;

export type MobileResourceType =
  (typeof mobileResourceTypes)[number];

export const MOBILE_ACCESS_TOKEN_TTL_MS =
  15 * 60 * 1_000;

export const MOBILE_REFRESH_TOKEN_TTL_MS =
  30 * 24 * 60 * 60 * 1_000;

export type MobileSessionMetadata = {
  deviceIdHash: string | null;
  devicePlatform: string | null;
  appVersion: string | null;
  ipHash: string | null;
  userAgentHash: string | null;
};

export type MobileTokenSet = {
  accessToken: string;
  accessTokenHash: string;
  refreshToken: string;
  refreshTokenHash: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
};

export type MobileIdentityRecord = {
  id: string;
  tenantId: string;
  userId: string;
  audience: MobileAudience;
  status: MobileIdentityStatus;
};

export type MobileAuthenticatedPrincipal = {
  sessionId: string;
  userId: string;
  email: string;
  fullName: string;
  tenantId: string;
  principalType: MobilePrincipalType;
  mobileIdentityId: string | null;
  credentialVersion: number;
  accessExpiresAt: string;
  refreshExpiresAt: string;
};

export function isMobilePrincipalType(
  value: unknown,
): value is MobilePrincipalType {
  return typeof value === "string"
    && mobilePrincipalTypes.includes(
      value as MobilePrincipalType,
    );
}

export function isMobileAudience(
  value: unknown,
): value is MobileAudience {
  return typeof value === "string"
    && mobileAudiences.includes(value as MobileAudience);
}

export function mobileAudienceForPrincipal(
  principalType: MobilePrincipalType,
): MobileAudience | null {
  return principalType === "school"
    ? null
    : principalType;
}
