import { env } from "cloudflare:workers";
import type { ChatGPTUser } from "../../app/chatgpt-auth";
import type { SchoolAction } from "./management-validation";

export type SchoolDetail = {
  tenantId: string;
  name: string;
  city: string;
  plan: string;
  status: string;
  adminEmail: string | null;
  invitationStatus: string | null;
  invitationExpiresAt: string | null;
  modules: Array<{ key: string; label: string; enabled: boolean }>;
  audit: Array<{ id: string; action: string; occurredAt: string; metadata: Record<string, unknown> }>;
};

type DetailRow = { id: string; name: string; status: string; city: string | null; plan: string | null; admin_email: string | null; invitation_status: string | null; invitation_expires_at: string | null };
type ModuleRow = { module_key: string; enabled: number };
type AuditRow = { id: string; action: string; occurred_at: string; metadata_json: string };

const labels: Record<string, string> = {
  student_information: "Student Information",
  fees_finance: "Fees & Finance",
  attendance: "Attendance",
  examinations: "Examinations",
  communication: "Communication",
};

export async function getSchoolDetail(tenantId: string): Promise<SchoolDetail | null> {
  const school = await env.DB.prepare(`
    SELECT t.id, t.name, t.status, c.city, p.name AS plan, i.email AS admin_email,
      i.status AS invitation_status, i.expires_at AS invitation_expires_at
    FROM tenants t
    LEFT JOIN campuses c ON c.tenant_id = t.id AND c.code = 'MAIN'
    LEFT JOIN subscriptions s ON s.tenant_id = t.id
    LEFT JOIN plans p ON p.id = s.plan_id
    LEFT JOIN school_invitations i ON i.tenant_id = t.id
    WHERE t.id = ? AND t.status != 'archived'
    LIMIT 1
  `).bind(tenantId).first<DetailRow>();
  if (!school) return null;

  const [modules, audit] = await Promise.all([
    env.DB.prepare(`SELECT module_key, enabled FROM module_policies WHERE tenant_id = ? ORDER BY module_key`).bind(tenantId).all<ModuleRow>(),
    env.DB.prepare(`SELECT id, action, occurred_at, metadata_json FROM audit_events WHERE tenant_id = ? ORDER BY occurred_at DESC LIMIT 8`).bind(tenantId).all<AuditRow>(),
  ]);
  return {
    tenantId: school.id,
    name: school.name,
    city: school.city ?? "India",
    plan: school.plan ?? "Starter",
    status: school.status,
    adminEmail: school.admin_email,
    invitationStatus: school.invitation_status,
    invitationExpiresAt: school.invitation_expires_at,
    modules: modules.results.map((module) => ({ key: module.module_key, label: labels[module.module_key] ?? module.module_key, enabled: Boolean(module.enabled) })),
    audit: audit.results.map((event) => ({ id: event.id, action: event.action, occurredAt: event.occurred_at, metadata: safeJson(event.metadata_json) })),
  };
}

export async function performSchoolAction(tenantId: string, action: SchoolAction, actor: ChatGPTUser, idempotencyKey: string): Promise<SchoolDetail> {
  const replay = await getReplay(idempotencyKey, actor.email);
  if (replay) return replay;
  const current = await getSchoolDetail(tenantId);
  if (!current) throw new Error("School not found");
  const now = new Date();
  const nowIso = now.toISOString();
  const actorId = await stableUserId(actor.email);
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`INSERT INTO users (id, email, full_name, status, mfa_enabled, created_at, updated_at)
      VALUES (?, ?, ?, 'active', 1, ?, ?) ON CONFLICT(email) DO UPDATE SET full_name = excluded.full_name, updated_at = excluded.updated_at`).bind(actorId, actor.email.toLowerCase(), actor.fullName ?? actor.displayName, nowIso, nowIso),
  ];
  let metadata: Record<string, unknown> = {};
  let auditAction: string = action.action;

  if (action.action === "update_plan") {
    const planId = action.plan.toLowerCase();
    statements.push(
      env.DB.prepare(`INSERT INTO plans (id, name, monthly_price_paise, annual_price_paise, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?) ON CONFLICT(id) DO NOTHING`).bind(planId, action.plan, planPrice(action.plan), planPrice(action.plan) * 10, nowIso, nowIso),
      env.DB.prepare(`UPDATE subscriptions SET plan_id = ?, updated_at = ? WHERE tenant_id = ?`).bind(planId, nowIso, tenantId),
    );
    metadata = { from: current.plan, to: action.plan };
    auditAction = "subscription.plan_change";
  } else if (action.action === "set_module") {
    statements.push(env.DB.prepare(`UPDATE module_policies SET enabled = ?, source = 'override', updated_at = ?, updated_by = ? WHERE tenant_id = ? AND module_key = ?`).bind(action.enabled ? 1 : 0, nowIso, actorId, tenantId, action.moduleKey));
    metadata = { moduleKey: action.moduleKey, enabled: action.enabled };
    auditAction = "module.policy_change";
  } else if (action.action === "resend_invitation") {
    const expiresAt = new Date(now.getTime() + 7 * 86_400_000).toISOString();
    const tokenHash = await sha256(`${crypto.randomUUID()}:${tenantId}:${nowIso}`);
    statements.push(env.DB.prepare(`UPDATE school_invitations SET token_hash = ?, status = 'pending', expires_at = ?, updated_at = ? WHERE tenant_id = ?`).bind(tokenHash, expiresAt, nowIso, tenantId));
    metadata = { invitationStatus: "pending", expiresAt };
    auditAction = "invitation.resent";
  } else {
    statements.push(env.DB.prepare(`UPDATE school_invitations SET status = 'revoked', updated_at = ? WHERE tenant_id = ?`).bind(nowIso, tenantId));
    metadata = { invitationStatus: "revoked" };
    auditAction = "invitation.revoked";
  }

  statements.push(env.DB.prepare(`INSERT INTO audit_events (id, tenant_id, actor_id, action, resource_type, resource_id, reason, metadata_json, occurred_at)
    VALUES (?, ?, ?, ?, 'tenant', ?, 'Platform administration', ?, ?)`).bind(crypto.randomUUID(), tenantId, actorId, auditAction, tenantId, JSON.stringify(metadata), nowIso));
  await env.DB.batch(statements);
  const updated = await getSchoolDetail(tenantId);
  if (!updated) throw new Error("School not found after update");
  await env.DB.prepare(`INSERT INTO idempotency_records (key, actor_email, operation, response_json, created_at, expires_at)
    VALUES (?, ?, 'school.manage', ?, ?, ?)`).bind(idempotencyKey, actor.email.toLowerCase(), JSON.stringify(updated), nowIso, new Date(now.getTime() + 24 * 60 * 60_000).toISOString()).run();
  return updated;
}

async function getReplay(key: string, actorEmail: string): Promise<SchoolDetail | null> {
  const row = await env.DB.prepare(`SELECT response_json FROM idempotency_records WHERE key = ? AND actor_email = ? AND operation = 'school.manage' AND expires_at > ?`).bind(key, actorEmail.toLowerCase(), new Date().toISOString()).first<{ response_json: string }>();
  return row ? JSON.parse(row.response_json) as SchoolDetail : null;
}

function safeJson(value: string): Record<string, unknown> {
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}

function planPrice(plan: "Starter" | "Growth" | "Enterprise"): number {
  return plan === "Starter" ? 149_900 : plan === "Growth" ? 349_900 : 799_900;
}

async function stableUserId(email: string): Promise<string> {
  return `usr_${(await sha256(email.trim().toLowerCase())).slice(0, 24)}`;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
