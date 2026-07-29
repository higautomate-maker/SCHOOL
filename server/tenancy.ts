export type TenantContext = { tenantId: string; userId: string; permissions: ReadonlySet<string> };

export class TenantAccessError extends Error {
  constructor() { super("Tenant access denied"); this.name = "TenantAccessError"; }
}

export function requireTenant(context: TenantContext | null): TenantContext {
  if (!context?.tenantId || !context.userId) throw new TenantAccessError();
  return context;
}

export function enforceTenant(context: TenantContext, requestedTenantId: string): void {
  if (context.tenantId !== requestedTenantId) throw new TenantAccessError();
}

export function requirePermission(context: TenantContext, permission: string): void {
  if (!context.permissions.has(permission)) throw new TenantAccessError();
}
