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
  roleKey: string | null;
  credentialVersion: number;
  issuedAt: string;
  lastSeenAt: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  devicePlatform: string | null;
  appVersion: string | null;
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

export type MobileLoginRecord = {
  userId: string;
  email: string;
  fullName: string;
  status: string;
  passwordHash: string;
  credentialVersion: number;
  disabled: boolean;
  tenantId: string;
  principalType: MobilePrincipalType;
  mobileIdentityId: string | null;
  relationshipStatus: MobileIdentityStatus | null;
  roleKey: string | null;
};

export type MobileSessionCreation = MobileTokenSet & {
  sessionId: string;
  refreshFamilyId: string;
  tenantId: string;
  principalType: MobilePrincipalType;
  mobileIdentityId: string | null;
  credentialVersion: number;
};

export type MobileRefreshResult =
  | {
      status: "rotated";
      session: MobileSessionCreation;
    }
  | {
      status: "invalid" | "replay";
    };

export type MobileAssignment = {
  id: string;
  tenantId: string;
  mobileIdentityId: string;
  resourceType: MobileResourceType;
  resourceId: string;
  status: MobileAssignmentStatus;
};


export type MobileAccessModule = {
  key: string;
  label: string;
  canManage: boolean;
};

export type MobileAccessFeature = {
  key: string;
  label: string;
  requiredSchoolModule: string | null;
};

export type MobileAccessSummary = {
  tenantId: string;
  principalType: MobilePrincipalType;
  modules: MobileAccessModule[];
  features: MobileAccessFeature[];
  assignments: MobileAssignment[];
};
