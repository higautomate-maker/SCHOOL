import type { PoolClient } from "pg";
import type { ChatGPTUser } from "../../app/chatgpt-auth";
import {
  ensurePostgresActor,
  jsonObject,
  sha256Hex,
  timestampString,
} from "../runtime/postgres-repository.ts";
import { withTenantDatabase } from "../runtime/postgres.ts";
import type { SchoolDetail } from "./management-repository.ts";
import type { SchoolAction } from "./management-validation.ts";

type DetailRow = {
  id: string;
  name: string;
  status: string;
  city: string | null;
  plan: string | null;
  adminEmail: string | null;
  invitationStatus: string | null;
  invitationExpiresAt: Date | string | null;
};
type ModuleRow = { moduleKey: string; enabled: boolean };
type AuditRow = {
  id: string;
  action: string;
  occurredAt: Date | string;
  metadata: unknown;
};
type ReplayRow = { response: unknown };

const labels: Record<string, string> = {
  student_information: "Student Information",
  fees_finance: "Fees & Finance",
  attendance: "Attendance",
  examinations: "Examinations",
  communication: "Communication",
};

export function getPostgresSchoolDetail(tenantId: string): Promise<SchoolDetail | null> {
  return withTenantDatabase(
    tenantId,
    async (_database, client) => readSchoolDetail(client, tenantId),
  );
}

export function performPostgresSchoolAction(
  tenantId: string,
  action: SchoolAction,
  actor: ChatGPTUser,
  idempotencyKey: string,
): Promise<SchoolDetail> {
  return withTenantDatabase(tenantId, async (_database, client) => {
    const replay = await readReplay(client, tenantId, idempotencyKey, actor.email);
    if (replay) return replay;

    const current = await readSchoolDetail(client, tenantId);
    if (!current) throw new Error("School not found");

    const actorId = await ensurePostgresActor(client, actor);
    let metadata: Record<string, unknown>;
    let auditAction: string;

    if (action.action === "update_plan") {
      const planId = await findOrCreatePlan(client, action.plan);
      await client.query(
        `UPDATE subscriptions
         SET plan_id = $1,
             updated_at = now()
         WHERE tenant_id = $2`,
        [planId, tenantId],
      );
      metadata = { from: current.plan, to: action.plan };
      auditAction = "subscription.plan_change";
    } else if (action.action === "set_module") {
      await client.query(
        `UPDATE module_policies
         SET enabled = $1,
             source = 'override',
             updated_at = now(),
             updated_by = $2
         WHERE tenant_id = $3
           AND module_key = $4`,
        [action.enabled, actorId, tenantId, action.moduleKey],
      );
      metadata = { moduleKey: action.moduleKey, enabled: action.enabled };
      auditAction = "module.policy_change";
    } else if (action.action === "resend_invitation") {
      const expiresAt = new Date(Date.now() + 7 * 86_400_000);
      const tokenHash = await sha256Hex(`${crypto.randomUUID()}:${tenantId}:${expiresAt.toISOString()}`);
      await client.query(
        `UPDATE school_invitations
         SET token_hash = $1,
             status = 'pending',
             expires_at = $2,
             updated_at = now()
         WHERE tenant_id = $3`,
        [tokenHash, expiresAt, tenantId],
      );
      metadata = { invitationStatus: "pending", expiresAt: expiresAt.toISOString() };
      auditAction = "invitation.resent";
    } else {
      await client.query(
        `UPDATE school_invitations
         SET status = 'revoked',
             updated_at = now()
         WHERE tenant_id = $1`,
        [tenantId],
      );
      metadata = { invitationStatus: "revoked" };
      auditAction = "invitation.revoked";
    }

    await client.query(
      `INSERT INTO audit_events (
         id, tenant_id, actor_id, action, resource_type, resource_id,
         reason, metadata, occurred_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, 'tenant', $1::text,
         'Platform administration', $4::jsonb, now()
       )`,
      [tenantId, actorId, auditAction, JSON.stringify(metadata)],
    );

    const updated = await readSchoolDetail(client, tenantId);
    if (!updated) throw new Error("School not found after update");

    await client.query(
      `INSERT INTO idempotency_records (
         tenant_id, key, actor_email, operation, request_hash,
         response, created_at, expires_at
       ) VALUES (
         $1, $2, $3, 'school.manage', $4, $5::jsonb,
         now(), now() + interval '24 hours'
       )`,
      [
        tenantId,
        idempotencyKey,
        actor.email.toLowerCase(),
        await sha256Hex(JSON.stringify(action)),
        JSON.stringify(updated),
      ],
    );
    return updated;
  });
}

async function readSchoolDetail(
  client: PoolClient,
  tenantId: string,
): Promise<SchoolDetail | null> {
  const schoolResult = await client.query<DetailRow>(
    `SELECT
       t.id,
       t.name,
       t.status,
       c.city,
       p.name AS plan,
       invitation.email AS "adminEmail",
       invitation.status AS "invitationStatus",
       invitation.expires_at AS "invitationExpiresAt"
     FROM tenants t
     LEFT JOIN campuses c
       ON c.tenant_id = t.id
      AND c.code = 'MAIN'
     LEFT JOIN subscriptions s
       ON s.tenant_id = t.id
     LEFT JOIN plans p
       ON p.id = s.plan_id
     LEFT JOIN LATERAL (
       SELECT i.email, i.status, i.expires_at
       FROM school_invitations i
       WHERE i.tenant_id = t.id
       ORDER BY i.created_at DESC
       LIMIT 1
     ) invitation ON true
     WHERE t.id = $1
       AND t.status <> 'archived'
     LIMIT 1`,
    [tenantId],
  );
  const school = schoolResult.rows[0];
  if (!school) return null;

  const [moduleResult, auditResult] = await Promise.all([
    client.query<ModuleRow>(
      `SELECT module_key AS "moduleKey", enabled
       FROM module_policies
       WHERE tenant_id = $1
       ORDER BY module_key`,
      [tenantId],
    ),
    client.query<AuditRow>(
      `SELECT id, action, occurred_at AS "occurredAt", metadata
       FROM audit_events
       WHERE tenant_id = $1
       ORDER BY occurred_at DESC
       LIMIT 8`,
      [tenantId],
    ),
  ]);

  return {
    tenantId: school.id,
    name: school.name,
    city: school.city ?? "India",
    plan: school.plan ?? "Starter",
    status: school.status,
    adminEmail: school.adminEmail,
    invitationStatus: school.invitationStatus,
    invitationExpiresAt: school.invitationExpiresAt
      ? timestampString(school.invitationExpiresAt)
      : null,
    modules: moduleResult.rows.map((module) => ({
      key: module.moduleKey,
      label: labels[module.moduleKey] ?? module.moduleKey,
      enabled: module.enabled,
    })),
    audit: auditResult.rows.map((event) => ({
      id: event.id,
      action: event.action,
      occurredAt: timestampString(event.occurredAt),
      metadata: jsonObject(event.metadata),
    })),
  };
}

async function readReplay(
  client: PoolClient,
  tenantId: string,
  key: string,
  actorEmail: string,
): Promise<SchoolDetail | null> {
  const result = await client.query<ReplayRow>(
    `SELECT response
     FROM idempotency_records
     WHERE tenant_id = $1
       AND key = $2
       AND actor_email = $3
       AND operation = 'school.manage'
       AND expires_at > now()
     LIMIT 1`,
    [tenantId, key, actorEmail.toLowerCase()],
  );
  return result.rows[0]?.response as SchoolDetail | undefined ?? null;
}

async function findOrCreatePlan(
  client: PoolClient,
  plan: "Starter" | "Growth" | "Enterprise",
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `SELECT id
     FROM plans
     WHERE name = $1
     ORDER BY created_at
     LIMIT 1`,
    [plan],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const monthly = plan === "Starter" ? 149_900 : plan === "Growth" ? 349_900 : 799_900;
  const created = await client.query<{ id: string }>(
    `INSERT INTO plans (
       id, name, monthly_price_paise, annual_price_paise, active
     ) VALUES (
       gen_random_uuid(), $1, $2, $3, true
     )
     RETURNING id`,
    [plan, monthly, monthly * 10],
  );
  const id = created.rows[0]?.id;
  if (!id) throw new Error("Plan could not be created");
  return id;
}
