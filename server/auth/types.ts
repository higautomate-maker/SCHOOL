export type MembershipStatus = "invited" | "active" | "suspended" | "revoked";
export type AuthenticatedActor = {
  userId: string;
  email: string;
  displayName: string;
  fullName: string;
  sessionId: string;
  csrfHash: string;
  activeTenantId: string | null;
  identityType: "platform" | "school";
  platformPermissions: ReadonlySet<string>;
  rolePermissions: ReadonlySet<string>;
  moduleEntitlements: ReadonlySet<string>;
  membershipStatus: MembershipStatus | null;
};

export type SessionCreation = {
  token: string;
  csrfToken: string;
  sessionId: string;
  absoluteExpiresAt: string;
};

export class AuthenticationError extends Error {
  constructor(message = "Authentication required") { super(message); this.name = "AuthenticationError"; }
}
export class AuthorizationError extends Error {
  constructor(message = "Access denied") { super(message); this.name = "AuthorizationError"; }
}
