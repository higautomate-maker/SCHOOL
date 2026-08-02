import type { PoolClient } from "pg";
import type { ChatGPTUser } from "../../app/chatgpt-auth";
import { permissionAllowedByModuleEntitlements, permissionCatalogue } from "./catalogue.ts";
import type { RoleRecord } from "./repository.ts";
import {
  ensurePostgresActor,
  isPostgresUniqueViolation,
  requirePostgresSchool,
} from "../runtime/postgres-repository.ts";
import { withTenantDatabase } from "../runtime/postgres.ts";
import type { RoleAction } from "./validation.ts";

type RoleRow = {
  id: string;
  name: string;
  key: string;
  system: boolean;
  description: string;
  permissions: string[] | null;
};

export function listPostgresRoles(
  tenantId: string,
  actor: ChatGPTUser,
): Promise<RoleRecord[]> {
  return withTenantDatabase(tenantId, async (_database, client) => {
    await requirePostgresSchool(client, tenantId);
    await ensureDefaultRole(client, tenantId, actor);
    return readRoles(client, tenantId);
  });
}

export function applyPostgresRoleAction(
  tenantId: string,
  action: RoleAction,
  actor: ChatGPTUser,
): Promise<RoleRecord[]> {
  return withTenantDatabase(tenantId, async (_database, client) => {
    await requirePostgresSchool(client, tenantId);
    const actorId = await ensurePostgresActor(client, actor);
    await assertPermissionsInsideCompanyBoundary(
      client,
      tenantId,
      action.permissions,
    );
    let roleId: string;
    let auditAction: string;
    let metadata: Record<string, unknown>;

    try {
      if (action.action === "create") {
        roleId = crypto.randomUUID();
        const key = `${action.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32) || "custom"}_${roleId.slice(0, 5)}`;
        await client.query(
          `INSERT INTO roles (
             id, tenant_id, name, key, system, description, created_by
           ) VALUES (
             $1, $2, $3, $4, false, 'Custom school role', $5
           )`,
          [roleId, tenantId, action.name, key, actorId],
        );
        await replacePermissions(client, tenantId, roleId, action.permissions);
        auditAction = "role.create";
        metadata = { roleId, name: action.name, permissions: action.permissions };
      } else {
        roleId = action.roleId;
        const roleResult = await client.query<{ id: string; system: boolean }>(
          `SELECT id, system
           FROM roles
           WHERE tenant_id = $1
             AND id = $2
           LIMIT 1`,
          [tenantId, roleId],
        );
        const role = roleResult.rows[0];
        if (!role) throw new Error("Role not found");
        if (role.system && !action.permissions.includes("roles.manage")) {
          throw new Error("School Admin must retain role management permission");
        }
        await replacePermissions(client, tenantId, roleId, action.permissions);
        await client.query(
          `UPDATE roles
           SET updated_at = now()
           WHERE tenant_id = $1
             AND id = $2`,
          [tenantId, roleId],
        );
        auditAction = "role.permissions_update";
        metadata = { roleId, permissions: action.permissions };
      }
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        throw new Error("UNIQUE constraint failed: role already exists");
      }
      throw error;
    }

    await client.query(
      `INSERT INTO audit_events (
         id, tenant_id, actor_id, action, resource_type, resource_id,
         reason, metadata, occurred_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, 'role', $4,
         'Permission administration', $5::jsonb, now()
       )`,
      [tenantId, actorId, auditAction, roleId, JSON.stringify(metadata)],
    );
    return readRoles(client, tenantId);
  });
}

async function readRoles(
  client: PoolClient,
  tenantId: string,
): Promise<RoleRecord[]> {
  const result = await client.query<RoleRow>(
    `SELECT
       r.id,
       r.name,
       r.key,
       r.system,
       r.description,
       COALESCE(
         array_agg(rp.permission ORDER BY rp.permission)
           FILTER (WHERE rp.permission IS NOT NULL),
         ARRAY[]::text[]
       ) AS permissions
     FROM roles r
     LEFT JOIN role_permissions rp
       ON rp.tenant_id = r.tenant_id
      AND rp.role_id = r.id
     WHERE r.tenant_id = $1
     GROUP BY r.id, r.name, r.key, r.system, r.description
     ORDER BY r.system DESC, r.name ASC`,
    [tenantId],
  );
  return result.rows.map((role) => ({
    ...role,
    permissions: role.permissions ?? [],
  }));
}

async function ensureDefaultRole(
  client: PoolClient,
  tenantId: string,
  actor: ChatGPTUser,
): Promise<void> {
  const existing = await client.query<{ id: string }>(
    `SELECT id
     FROM roles
     WHERE tenant_id = $1
       AND key = 'school_admin'
     LIMIT 1`,
    [tenantId],
  );
  if (existing.rows[0]) return;

  const actorId = await ensurePostgresActor(client, actor);
  const roleId = crypto.randomUUID();
  await client.query(
    `INSERT INTO roles (
       id, tenant_id, name, key, system, description, created_by
     ) VALUES (
       $1, $2, 'School Admin', 'school_admin', true,
       'Full tenant administration', $3
     )`,
    [roleId, tenantId, actorId],
  );
  await replacePermissions(
    client,
    tenantId,
    roleId,
    permissionCatalogue.map(([permission]) => permission),
  );
}

async function replacePermissions(
  client: PoolClient,
  tenantId: string,
  roleId: string,
  permissions: readonly string[],
): Promise<void> {
  await client.query(
    `DELETE FROM role_permissions
     WHERE tenant_id = $1
       AND role_id = $2`,
    [tenantId, roleId],
  );
  for (const permission of permissions) {
    await client.query(
      `INSERT INTO role_permissions (
         tenant_id, role_id, permission
       ) VALUES ($1, $2, $3)`,
      [tenantId, roleId, permission],
    );
  }
}
async function assertPermissionsInsideCompanyBoundary(
  client: PoolClient,
  tenantId: string,
  permissions: readonly string[],
): Promise<void> {
  const result = await client.query<{ module_key: string }>(
    `SELECT module_key
       FROM module_policies
      WHERE tenant_id = $1
        AND enabled = true`,
    [tenantId],
  );
  const entitlements = new Set(result.rows.map((row) => row.module_key));
  const blocked = permissions.filter((permission) =>
    !permissionAllowedByModuleEntitlements(permission, entitlements)
  );
  if (blocked.length) {
    throw new Error(
      `Company has not enabled the module required by: ${blocked.join(", ")}`,
    );
  }
}
