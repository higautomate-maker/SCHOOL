import { database } from "@db-runtime";
import type { ChatGPTUser } from "../../app/chatgpt-auth";
import { repositoryBackend } from "../runtime/repository-backend.ts";
import { permissionCatalogue } from "./catalogue.ts";
import type { RoleAction } from "./validation";

export { permissionCatalogue };

export type RoleRecord = { id: string; name: string; key: string; system: boolean; description: string; permissions: string[] };
type RoleRow = { id: string; name: string; key: string; system: number; description: string; permissions: string | null };

export async function listRoles(tenantId: string, actor: ChatGPTUser): Promise<RoleRecord[]> {
  if (repositoryBackend() === "postgres") {
    return (await import("./postgres-repository.ts")).listPostgresRoles(tenantId, actor);
  }
  await ensureDefaultRole(tenantId, actor);
  const result = await database.prepare(`
    SELECT r.id, r.name, r.key, r.system, r.description, GROUP_CONCAT(rp.permission) AS permissions
    FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id
    WHERE r.tenant_id = ? GROUP BY r.id, r.name, r.key, r.system, r.description
    ORDER BY r.system DESC, r.name ASC
  `).bind(tenantId).all<RoleRow>();
  return result.results.map((role) => ({ ...role, system: Boolean(role.system), permissions: role.permissions ? role.permissions.split(",").sort() : [] }));
}

export async function applyRoleAction(tenantId: string, action: RoleAction, actor: ChatGPTUser): Promise<RoleRecord[]> {
  if (repositoryBackend() === "postgres") {
    return (await import("./postgres-repository.ts"))
      .applyPostgresRoleAction(tenantId, action, actor);
  }
  const school = await database.prepare("SELECT id FROM tenants WHERE id = ? AND status != 'archived'").bind(tenantId).first<{ id: string }>();
  if (!school) throw new Error("School not found");
  const actorId = await stableUserId(actor.email);
  const now = new Date().toISOString();
  await ensureUser(actorId, actor, now);
  let roleId: string;
  let auditAction: string;
  let metadata: Record<string, unknown>;

  if (action.action === "create") {
    roleId = crypto.randomUUID();
    const key = `${action.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32) || "custom"}_${roleId.slice(0, 5)}`;
    const statements = [
      database.prepare("INSERT INTO roles (id, tenant_id, name, key, system, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 'Custom school role', ?, ?, ?)").bind(roleId, tenantId, action.name, key, actorId, now, now),
      ...action.permissions.map((permission) => database.prepare("INSERT INTO role_permissions (role_id, permission, created_at) VALUES (?, ?, ?)").bind(roleId, permission, now)),
    ];
    await database.batch(statements);
    auditAction = "role.create";
    metadata = { roleId, name: action.name, permissions: action.permissions };
  } else {
    roleId = action.roleId;
    const role = await database.prepare("SELECT id, system FROM roles WHERE id = ? AND tenant_id = ?").bind(roleId, tenantId).first<{ id: string; system: number }>();
    if (!role) throw new Error("Role not found");
    if (role.system && !action.permissions.includes("roles.manage")) throw new Error("School Admin must retain role management permission");
    await database.batch([
      database.prepare("DELETE FROM role_permissions WHERE role_id = ?").bind(roleId),
      ...action.permissions.map((permission) => database.prepare("INSERT INTO role_permissions (role_id, permission, created_at) VALUES (?, ?, ?)").bind(roleId, permission, now)),
      database.prepare("UPDATE roles SET updated_at = ? WHERE id = ? AND tenant_id = ?").bind(now, roleId, tenantId),
    ]);
    auditAction = "role.permissions_update";
    metadata = { roleId, permissions: action.permissions };
  }

  await database.prepare("INSERT INTO audit_events (id, tenant_id, actor_id, action, resource_type, resource_id, reason, metadata_json, occurred_at) VALUES (?, ?, ?, ?, 'role', ?, 'Permission administration', ?, ?)")
    .bind(crypto.randomUUID(), tenantId, actorId, auditAction, roleId, JSON.stringify(metadata), now).run();
  return listRoles(tenantId, actor);
}

async function ensureDefaultRole(tenantId: string, actor: ChatGPTUser): Promise<void> {
  const existing = await database.prepare("SELECT id FROM roles WHERE tenant_id = ? AND key = 'school_admin'").bind(tenantId).first<{ id: string }>();
  if (existing) return;
  const school = await database.prepare("SELECT id FROM tenants WHERE id = ? AND status != 'archived'").bind(tenantId).first<{ id: string }>();
  if (!school) throw new Error("School not found");
  const now = new Date().toISOString();
  const actorId = await stableUserId(actor.email);
  await ensureUser(actorId, actor, now);
  const roleId = crypto.randomUUID();
  await database.batch([
    database.prepare("INSERT INTO roles (id, tenant_id, name, key, system, description, created_by, created_at, updated_at) VALUES (?, ?, 'School Admin', 'school_admin', 1, 'Full tenant administration', ?, ?, ?)").bind(roleId, tenantId, actorId, now, now),
    ...permissionCatalogue.map(([permission]) => database.prepare("INSERT INTO role_permissions (role_id, permission, created_at) VALUES (?, ?, ?)").bind(roleId, permission, now)),
  ]);
}

async function ensureUser(actorId: string, actor: ChatGPTUser, now: string): Promise<void> {
  await database.prepare("INSERT INTO users (id, email, full_name, status, mfa_enabled, created_at, updated_at) VALUES (?, ?, ?, 'active', 1, ?, ?) ON CONFLICT(email) DO UPDATE SET full_name = excluded.full_name, updated_at = excluded.updated_at")
    .bind(actorId, actor.email.toLowerCase(), actor.fullName ?? actor.displayName, now, now).run();
}

async function stableUserId(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `usr_${hash.slice(0, 24)}`;
}
