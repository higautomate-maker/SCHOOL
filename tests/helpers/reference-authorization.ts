export type IdentityType =
  | "company"
  | "school"
  | "teacher"
  | "parent"
  | "transporter";

export type ReferenceActor = {
  identityType: IdentityType;
  tenantId: string | null;
  platformPermissions: ReadonlySet<string>;
  rolePermissions: ReadonlySet<string>;
  assignments: ReadonlySet<string>;
};

export type ReferenceRequest = {
  scope: "platform" | "tenant";
  tenantId: string | null;
  module: string | null;
  permission: string;
  resourceAssignment: string | null;
};

export type AuthorizationDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "unauthenticated"
        | "wrong_client_scope"
        | "tenant_mismatch"
        | "module_not_entitled"
        | "permission_denied"
        | "resource_not_assigned";
    };

export function referenceAuthorizationDecision(
  actor: ReferenceActor | null,
  request: ReferenceRequest,
  tenantEntitlements: ReadonlySet<string>,
): AuthorizationDecision {
  if (!actor) return { allowed: false, reason: "unauthenticated" };

  if (request.scope === "platform") {
    if (actor.identityType !== "company") {
      return { allowed: false, reason: "wrong_client_scope" };
    }
    return actor.platformPermissions.has(request.permission)
      ? { allowed: true }
      : { allowed: false, reason: "permission_denied" };
  }

  if (!actor.tenantId || actor.tenantId !== request.tenantId) {
    return { allowed: false, reason: "tenant_mismatch" };
  }
  if (!request.module || !tenantEntitlements.has(request.module)) {
    return { allowed: false, reason: "module_not_entitled" };
  }
  if (!actor.rolePermissions.has(request.permission)) {
    return { allowed: false, reason: "permission_denied" };
  }
  if (
    request.resourceAssignment &&
    !actor.assignments.has(request.resourceAssignment)
  ) {
    return { allowed: false, reason: "resource_not_assigned" };
  }

  return { allowed: true };
}
