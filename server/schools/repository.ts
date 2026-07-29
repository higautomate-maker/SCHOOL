import { env } from "cloudflare:workers";
import type { ChatGPTUser } from "../../app/chatgpt-auth";
import type { CreateSchoolInput } from "./validation";

export type SchoolSummary = {
  tenantId: string;
  id: string;
  name: string;
  code: string;
  location: string;
  students: number;
  plan: string;
  status: "Active" | "Trial" | "Attention";
  renewal: string;
  color: string;
  invitation: "Pending" | "Accepted";
};

type SchoolRow = {
  id: string; name: string; city: string | null; plan: string | null;
  status: string; period_ends_at: string | null; invitation_status: string | null; student_count: number | null;
};

const moduleKeys = ["student_information", "fees_finance", "attendance", "examinations", "communication"];

export async function listSchools(): Promise<SchoolSummary[]> {
  const result = await env.DB.prepare(`
    SELECT t.id, t.name, c.city, p.name AS plan, t.status, s.period_ends_at,
      MAX(i.status) AS invitation_status,
      (SELECT COUNT(*) FROM students st WHERE st.tenant_id = t.id AND st.status = 'active') AS student_count
    FROM tenants t
    LEFT JOIN campuses c ON c.tenant_id = t.id
    LEFT JOIN subscriptions s ON s.tenant_id = t.id
    LEFT JOIN plans p ON p.id = s.plan_id
    LEFT JOIN school_invitations i ON i.tenant_id = t.id
    WHERE t.status != 'archived'
    GROUP BY t.id, t.name, c.city, p.name, t.status, s.period_ends_at
    ORDER BY t.created_at DESC
    LIMIT 100
  `).all<SchoolRow>();

  return result.results.map(toSummary);
}

export async function findIdempotentResponse(key: string, actorEmail: string): Promise<SchoolSummary | null> {
  const row = await env.DB.prepare(`
    SELECT response_json FROM idempotency_records
    WHERE key = ? AND actor_email = ? AND operation = 'school.create' AND expires_at > ?
  `).bind(key, actorEmail, new Date().toISOString()).first<{ response_json: string }>();
  return row ? JSON.parse(row.response_json) as SchoolSummary : null;
}

export async function createSchool(input: CreateSchoolInput, actor: ChatGPTUser, idempotencyKey: string): Promise<SchoolSummary> {
  const now = new Date();
  const nowIso = now.toISOString();
  const tenantId = crypto.randomUUID();
  const campusId = crypto.randomUUID();
  const subscriptionId = crypto.randomUUID();
  const invitationId = crypto.randomUUID();
  const actorId = await stableUserId(actor.email);
  const adminId = await stableUserId(input.adminEmail);
  const planId = input.plan.toLowerCase();
  const slugBase = input.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "school";
  const slug = `${slugBase}-${tenantId.slice(0, 6)}`;
  const periodEndsAt = new Date(now.getTime() + 14 * 86_400_000).toISOString();
  const expiresAt = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const idempotencyExpiresAt = new Date(now.getTime() + 24 * 60 * 60_000).toISOString();
  const tokenHash = await sha256(`${crypto.randomUUID()}:${input.adminEmail}:${tenantId}`);
  const adminName = input.adminEmail.split("@")[0].replace(/[._-]+/g, " ");
  const school: SchoolSummary = {
    tenantId,
    id: `HIG-${tenantId.slice(0, 6).toUpperCase()}`,
    name: input.name,
    code: initials(input.name),
    location: input.city,
    students: 0,
    plan: input.plan,
    status: "Trial",
    renewal: "Trial · 14 days",
    color: "mint",
    invitation: "Pending",
  };

  const statements = [
    env.DB.prepare(`INSERT INTO plans (id, name, monthly_price_paise, annual_price_paise, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?) ON CONFLICT(id) DO NOTHING`).bind(planId, input.plan, planPrice(input.plan), planPrice(input.plan) * 10, nowIso, nowIso),
    env.DB.prepare(`INSERT INTO users (id, email, full_name, status, mfa_enabled, created_at, updated_at)
      VALUES (?, ?, ?, 'active', 1, ?, ?) ON CONFLICT(email) DO UPDATE SET full_name = excluded.full_name, updated_at = excluded.updated_at`).bind(actorId, actor.email.toLowerCase(), actor.fullName ?? actor.displayName, nowIso, nowIso),
    env.DB.prepare(`INSERT INTO users (id, email, full_name, status, mfa_enabled, created_at, updated_at)
      VALUES (?, ?, ?, 'invited', 0, ?, ?) ON CONFLICT(email) DO UPDATE SET updated_at = excluded.updated_at`).bind(adminId, input.adminEmail, adminName, nowIso, nowIso),
    env.DB.prepare(`INSERT INTO tenants (id, name, slug, status, country_code, created_at, updated_at)
      VALUES (?, ?, ?, 'trial', 'IN', ?, ?)`).bind(tenantId, input.name, slug, nowIso, nowIso),
    env.DB.prepare(`INSERT INTO campuses (id, tenant_id, name, code, city, created_at, updated_at)
      VALUES (?, ?, 'Main Campus', 'MAIN', ?, ?, ?)`).bind(campusId, tenantId, input.city, nowIso, nowIso),
    env.DB.prepare(`INSERT INTO subscriptions (id, tenant_id, plan_id, status, period_ends_at, created_at, updated_at)
      VALUES (?, ?, ?, 'trial', ?, ?, ?)`).bind(subscriptionId, tenantId, planId, periodEndsAt, nowIso, nowIso),
    env.DB.prepare(`INSERT INTO memberships (tenant_id, user_id, role_key, campus_id, created_at)
      VALUES (?, ?, 'school_admin', ?, ?)`).bind(tenantId, adminId, campusId, nowIso),
    ...moduleKeys.map((moduleKey) => env.DB.prepare(`INSERT INTO module_policies (tenant_id, module_key, enabled, source, updated_at, updated_by)
      VALUES (?, ?, 1, 'plan', ?, ?)`).bind(tenantId, moduleKey, nowIso, actorId)),
    env.DB.prepare(`INSERT INTO school_invitations (id, tenant_id, email, role_key, token_hash, status, expires_at, invited_by, created_at, updated_at)
      VALUES (?, ?, ?, 'school_admin', ?, 'pending', ?, ?, ?, ?)`).bind(invitationId, tenantId, input.adminEmail, tokenHash, expiresAt, actorId, nowIso, nowIso),
    env.DB.prepare(`INSERT INTO audit_events (id, tenant_id, actor_id, action, resource_type, resource_id, reason, metadata_json, occurred_at)
      VALUES (?, ?, ?, 'school.create', 'tenant', ?, 'Platform onboarding', ?, ?)`).bind(crypto.randomUUID(), tenantId, actorId, tenantId, JSON.stringify({ plan: input.plan, city: input.city, adminEmail: input.adminEmail }), nowIso),
    env.DB.prepare(`INSERT INTO idempotency_records (key, actor_email, operation, response_json, created_at, expires_at)
      VALUES (?, ?, 'school.create', ?, ?, ?)`).bind(idempotencyKey, actor.email.toLowerCase(), JSON.stringify(school), nowIso, idempotencyExpiresAt),
  ];

  await env.DB.batch(statements);
  return school;
}

function toSummary(row: SchoolRow): SchoolSummary {
  const tenantSuffix = row.id.slice(0, 6).toUpperCase();
  const status = row.status === "active" ? "Active" : row.status === "trial" ? "Trial" : "Attention";
  return {
    tenantId: row.id,
    id: `HIG-${tenantSuffix}`,
    name: row.name,
    code: initials(row.name),
    location: row.city ?? "India",
    students: Number(row.student_count ?? 0),
    plan: row.plan ?? "Starter",
    status,
    renewal: status === "Trial" ? trialLabel(row.period_ends_at) : status === "Attention" ? "Review required" : renewalLabel(row.period_ends_at),
    color: ["mint", "peach", "lilac", "yellow"][parseInt(tenantSuffix.slice(0, 2), 16) % 4] ?? "mint",
    invitation: row.invitation_status === "accepted" ? "Accepted" : "Pending",
  };
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 3).toUpperCase();
}

function trialLabel(value: string | null): string {
  if (!value) return "Trial";
  const days = Math.max(0, Math.ceil((Date.parse(value) - Date.now()) / 86_400_000));
  return `Trial · ${days} days`;
}

function renewalLabel(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function planPrice(plan: CreateSchoolInput["plan"]): number {
  return plan === "Starter" ? 149_900 : plan === "Growth" ? 349_900 : 799_900;
}

async function stableUserId(email: string): Promise<string> {
  return `usr_${(await sha256(email.trim().toLowerCase())).slice(0, 24)}`;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
