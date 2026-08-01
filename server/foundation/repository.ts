import { database } from "#db-runtime";
import type { ChatGPTUser } from "../../app/chatgpt-auth";
import {
  repositoryBackend,
  schedulePostgresShadowRead,
} from "../runtime/repository-backend.ts";
import type { FoundationAction } from "./validation";

type SessionRow = { id: string; name: string; startsOn: string; endsOn: string; status: "planned" | "active" | "closed" };
type ClassRow = { id: string; name: string; code: string; displayOrder: number; sections: string | null; capacity: number | null };
type SubjectRow = { id: string; name: string; code: string; type: "core" | "elective" | "cocurricular" };
type SettingRow = { shortName: string; email: string; phone: string; principalName: string; address: string; currencyCode: string; admissionPrefix: string; receiptPrefix: string };

export type FoundationState = {
  sessions: SessionRow[];
  classes: Array<Omit<ClassRow, "sections" | "capacity"> & { sections: Array<{ name: string; capacity: number }> }>;
  subjects: SubjectRow[];
  settings: SettingRow;
  setup: { percent: number; completed: string[]; remaining: string[] };
};

const defaultSettings: SettingRow = { shortName: "", email: "", phone: "", principalName: "", address: "", currencyCode: "INR", admissionPrefix: "HIG", receiptPrefix: "RCPT" };

export async function getFoundation(tenantId: string): Promise<FoundationState> {
  if (repositoryBackend() === "postgres") {
    return (await import("./postgres-repository.ts")).getPostgresFoundation(tenantId);
  }
  await requireSchool(tenantId);
  const [sessionResult, classResult, subjectResult, setting] = await Promise.all([
    database.prepare("SELECT id, name, starts_on AS startsOn, ends_on AS endsOn, status FROM academic_sessions WHERE tenant_id = ? ORDER BY starts_on DESC").bind(tenantId).all<SessionRow>(),
    database.prepare(`SELECT c.id, c.name, c.code, c.display_order AS displayOrder, GROUP_CONCAT(s.name, '||') AS sections, MAX(s.capacity) AS capacity FROM school_classes c LEFT JOIN class_sections s ON s.class_id = c.id WHERE c.tenant_id = ? AND c.active = 1 GROUP BY c.id, c.name, c.code, c.display_order ORDER BY c.display_order, c.name`).bind(tenantId).all<ClassRow>(),
    database.prepare("SELECT id, name, code, type FROM subjects WHERE tenant_id = ? AND active = 1 ORDER BY name").bind(tenantId).all<SubjectRow>(),
    database.prepare("SELECT short_name AS shortName, email, phone, principal_name AS principalName, address, currency_code AS currencyCode, admission_prefix AS admissionPrefix, receipt_prefix AS receiptPrefix FROM school_settings WHERE tenant_id = ?").bind(tenantId).first<SettingRow>(),
  ]);
  const settings = setting ?? defaultSettings;
  const classes = classResult.results.map((item) => ({ id: item.id, name: item.name, code: item.code, displayOrder: item.displayOrder, sections: item.sections ? item.sections.split("||").map((name) => ({ name, capacity: item.capacity ?? 40 })) : [] }));
  const checks = [["School profile", Boolean(settings.shortName && settings.email)], ["Academic session", sessionResult.results.some((session) => session.status === "active")], ["Classes & sections", classes.length > 0], ["Subjects", subjectResult.results.length > 0]] as const;
  const completed = checks.filter(([, done]) => done).map(([label]) => label);
  const remaining = checks.filter(([, done]) => !done).map(([label]) => label);
  const foundation = { sessions: sessionResult.results, classes, subjects: subjectResult.results, settings, setup: { percent: completed.length * 25, completed, remaining } };
  schedulePostgresShadowRead(
    "foundation",
    foundation,
    async () => (await import("./postgres-repository.ts")).getPostgresFoundation(tenantId),
  );
  return foundation;
}

export async function applyFoundationAction(tenantId: string, action: FoundationAction, actor: ChatGPTUser): Promise<FoundationState> {
  if (repositoryBackend() === "postgres") {
    return (await import("./postgres-repository.ts"))
      .applyPostgresFoundationAction(tenantId, action, actor);
  }
  await requireSchool(tenantId);
  const now = new Date().toISOString(); const actorId = await stableUserId(actor.email); await ensureUser(actorId, actor, now);
  let resourceType = "school_configuration"; let resourceId = tenantId; const auditAction = `foundation.${action.action}`;
  if (action.action === "create_session") {
    if (Date.parse(action.endsOn) <= Date.parse(action.startsOn)) throw new Error("Academic session must end after it starts");
    const id = crypto.randomUUID(); resourceType = "academic_session"; resourceId = id;
    const statements = [];
    if (action.activate) statements.push(database.prepare("UPDATE academic_sessions SET status = 'closed', updated_at = ? WHERE tenant_id = ? AND status = 'active'").bind(now, tenantId));
    statements.push(database.prepare("INSERT INTO academic_sessions (id, tenant_id, name, starts_on, ends_on, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, tenantId, action.name, action.startsOn, action.endsOn, action.activate ? "active" : "planned", now, now));
    await database.batch(statements);
  } else if (action.action === "activate_session") {
    const exists = await database.prepare("SELECT id FROM academic_sessions WHERE id = ? AND tenant_id = ?").bind(action.sessionId, tenantId).first();
    if (!exists) throw new Error("Academic session not found");
    await database.batch([database.prepare("UPDATE academic_sessions SET status = 'closed', updated_at = ? WHERE tenant_id = ? AND status = 'active'").bind(now, tenantId), database.prepare("UPDATE academic_sessions SET status = 'active', updated_at = ? WHERE id = ? AND tenant_id = ?").bind(now, action.sessionId, tenantId)]);
    resourceType = "academic_session"; resourceId = action.sessionId;
  } else if (action.action === "create_class") {
    const id = crypto.randomUUID(); resourceType = "class"; resourceId = id;
    const count = await database.prepare("SELECT COUNT(*) AS count FROM school_classes WHERE tenant_id = ?").bind(tenantId).first<{ count: number }>();
    await database.batch([database.prepare("INSERT INTO school_classes (id, tenant_id, name, code, display_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").bind(id, tenantId, action.name, action.code, Number(count?.count ?? 0) + 1, now, now), ...action.sections.map((name) => database.prepare("INSERT INTO class_sections (id, tenant_id, class_id, name, capacity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), tenantId, id, name, action.capacity, now, now))]);
  } else if (action.action === "create_subject") {
    const id = crypto.randomUUID(); resourceType = "subject"; resourceId = id;
    await database.prepare("INSERT INTO subjects (id, tenant_id, name, code, type, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").bind(id, tenantId, action.name, action.code, action.type, now, now).run();
  } else {
    await database.prepare(`INSERT INTO school_settings (tenant_id, short_name, email, phone, principal_name, address, currency_code, admission_prefix, receipt_prefix, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(tenant_id) DO UPDATE SET short_name=excluded.short_name, email=excluded.email, phone=excluded.phone, principal_name=excluded.principal_name, address=excluded.address, currency_code=excluded.currency_code, admission_prefix=excluded.admission_prefix, receipt_prefix=excluded.receipt_prefix, updated_by=excluded.updated_by, updated_at=excluded.updated_at`).bind(tenantId, action.shortName, action.email, action.phone, action.principalName, action.address, action.currencyCode, action.admissionPrefix, action.receiptPrefix, actorId, now).run();
  }
  await database.prepare("INSERT INTO audit_events (id, tenant_id, actor_id, action, resource_type, resource_id, reason, metadata_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, 'School foundation setup', ?, ?)").bind(crypto.randomUUID(), tenantId, actorId, auditAction, resourceType, resourceId, JSON.stringify(action), now).run();
  return getFoundation(tenantId);
}

async function requireSchool(tenantId: string) { const school = await database.prepare("SELECT id FROM tenants WHERE id = ? AND status != 'archived'").bind(tenantId).first(); if (!school) throw new Error("School not found"); }
async function ensureUser(id: string, actor: ChatGPTUser, now: string) { await database.prepare("INSERT INTO users (id, email, full_name, status, mfa_enabled, created_at, updated_at) VALUES (?, ?, ?, 'active', 1, ?, ?) ON CONFLICT(email) DO UPDATE SET full_name=excluded.full_name, updated_at=excluded.updated_at").bind(id, actor.email.toLowerCase(), actor.fullName ?? actor.displayName, now, now).run(); }
async function stableUserId(email: string): Promise<string> { const bytes = new TextEncoder().encode(email.trim().toLowerCase()); const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((byte) => byte.toString(16).padStart(2, "0")).join(""); return `usr_${hash.slice(0, 24)}`; }
