import { env } from "cloudflare:workers";
import type { ChatGPTUser } from "../../app/chatgpt-auth";
import type { CreateStudentInput } from "./validation";

export type StudentRecord = CreateStudentInput & { id: string; fullName: string; status: "active" | "inactive" | "graduated"; createdAt: string };
type StudentRow = Omit<StudentRecord, "fullName">;

export async function listStudents(tenantId: string, sessionId?: string | null): Promise<StudentRecord[]> {
  await requireSchool(tenantId);
  const condition = sessionId ? " AND academic_session_id = ?" : "";
  const statement = env.DB.prepare(`SELECT id, admission_number AS admissionNumber, roll_number AS rollNumber,
    first_name AS firstName, last_name AS lastName, gender, date_of_birth AS dateOfBirth,
    admission_date AS admissionDate, class_name AS className, section_name AS sectionName,
    guardian_name AS guardianName, guardian_phone AS guardianPhone, status, created_at AS createdAt
    FROM students WHERE tenant_id = ?${condition} ORDER BY created_at DESC LIMIT 500`);
  const result = await (sessionId ? statement.bind(tenantId, sessionId) : statement.bind(tenantId)).all<StudentRow>();
  return result.results.map((student) => ({ ...student, fullName: `${student.firstName} ${student.lastName}`.trim() }));
}

export async function findStudentReplay(key: string, actorEmail: string): Promise<StudentRecord | null> {
  const row = await env.DB.prepare(`SELECT response_json FROM idempotency_records WHERE key = ? AND actor_email = ? AND operation = 'student.create' AND expires_at > ?`)
    .bind(key, actorEmail, new Date().toISOString()).first<{ response_json: string }>();
  return row ? JSON.parse(row.response_json) as StudentRecord : null;
}

export async function createStudent(tenantId: string, input: CreateStudentInput, actor: ChatGPTUser, key: string): Promise<StudentRecord> {
  await requireSchool(tenantId);
  const campus = await env.DB.prepare("SELECT id FROM campuses WHERE tenant_id = ? ORDER BY created_at LIMIT 1").bind(tenantId).first<{ id: string }>();
  if (!campus) throw new Error("School campus not found");
  const session = await env.DB.prepare("SELECT id FROM academic_sessions WHERE tenant_id = ? AND status = 'active' ORDER BY starts_on DESC LIMIT 1").bind(tenantId).first<{ id: string }>();
  const now = new Date(); const nowIso = now.toISOString(); const actorId = await stableUserId(actor.email); const id = crypto.randomUUID();
  const student: StudentRecord = { ...input, id, fullName: `${input.firstName} ${input.lastName}`.trim(), status: "active", createdAt: nowIso };
  await ensureUser(actorId, actor, nowIso);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO students (id, tenant_id, campus_id, academic_session_id, admission_number, roll_number, first_name, last_name, gender, date_of_birth, admission_date, class_name, section_name, guardian_name, guardian_phone, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`)
      .bind(id, tenantId, campus.id, session?.id ?? null, input.admissionNumber, input.rollNumber, input.firstName, input.lastName, input.gender, input.dateOfBirth, input.admissionDate, input.className, input.sectionName, input.guardianName, input.guardianPhone, actorId, nowIso, nowIso),
    env.DB.prepare(`INSERT INTO audit_events (id, tenant_id, actor_id, action, resource_type, resource_id, reason, metadata_json, occurred_at)
      VALUES (?, ?, ?, 'student.create', 'student', ?, 'Student admission', ?, ?)`)
      .bind(crypto.randomUUID(), tenantId, actorId, id, JSON.stringify({ admissionNumber: input.admissionNumber, className: input.className, sectionName: input.sectionName }), nowIso),
    env.DB.prepare(`INSERT INTO idempotency_records (key, actor_email, operation, response_json, created_at, expires_at) VALUES (?, ?, 'student.create', ?, ?, ?)`)
      .bind(key, actor.email.toLowerCase(), JSON.stringify(student), nowIso, new Date(now.getTime() + 86_400_000).toISOString()),
  ]);
  return student;
}

async function requireSchool(tenantId: string) {
  const school = await env.DB.prepare("SELECT id FROM tenants WHERE id = ? AND status != 'archived'").bind(tenantId).first<{ id: string }>();
  if (!school) throw new Error("School not found");
}
async function ensureUser(id: string, actor: ChatGPTUser, now: string) {
  await env.DB.prepare(`INSERT INTO users (id, email, full_name, status, mfa_enabled, created_at, updated_at) VALUES (?, ?, ?, 'active', 1, ?, ?) ON CONFLICT(email) DO UPDATE SET full_name = excluded.full_name, updated_at = excluded.updated_at`)
    .bind(id, actor.email.toLowerCase(), actor.fullName ?? actor.displayName, now, now).run();
}
async function stableUserId(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `usr_${hash.slice(0, 24)}`;
}
