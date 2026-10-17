import { database } from "#db-runtime";
import { repositoryBackend } from "../runtime/repository-backend.ts";

export type CompanyAuditEvent = {
  id: string;
  tenantId: string | null;
  schoolName: string | null;
  actorName: string | null;
  action: string;
  resourceType: string;
  occurredAt: string;
};

export type CompanyAuditPage = {
  events: CompanyAuditEvent[];
  nextCursor: string | null;
};

export type CompanyAuditOptions = {
  tenantId?: string;
  cursor?: string;
  limit: number;
};

type AuditRow = {
  id: string;
  tenant_id: string | null;
  school_name: string | null;
  actor_name: string | null;
  action: string;
  resource_type: string;
  occurred_at: string;
};

export function decodeAuditCursor(value?: string): { occurredAt: string; id: string } | null {
  if (!value) return null;
  if (value.length > 512) throw new Error("Invalid audit cursor");
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof decoded.occurredAt !== "string" ||
      Number.isNaN(Date.parse(decoded.occurredAt)) ||
      typeof decoded.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded.id)
    ) throw new Error("Invalid audit cursor");
    return { occurredAt: decoded.occurredAt, id: decoded.id };
  } catch {
    throw new Error("Invalid audit cursor");
  }
}

export function encodeAuditCursor(event: CompanyAuditEvent): string {
  return Buffer.from(JSON.stringify({ occurredAt: event.occurredAt, id: event.id })).toString("base64url");
}

export async function listCompanyAudit(options: CompanyAuditOptions): Promise<CompanyAuditPage> {
  if (repositoryBackend() === "postgres") {
    return (await import("./audit-postgres-repository.ts")).listPostgresCompanyAudit(options);
  }
  const cursor = decodeAuditCursor(options.cursor);
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (options.tenantId) {
    conditions.push("e.tenant_id = ?");
    values.push(options.tenantId);
  }
  if (cursor) {
    conditions.push("(e.occurred_at < ? OR (e.occurred_at = ? AND e.id < ?))");
    values.push(cursor.occurredAt, cursor.occurredAt, cursor.id);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await database.prepare(`
    SELECT e.id, e.tenant_id, t.name AS school_name, u.full_name AS actor_name,
           e.action, e.resource_type, e.occurred_at
      FROM audit_events e
      LEFT JOIN tenants t ON t.id = e.tenant_id
      LEFT JOIN users u ON u.id = e.actor_id
      ${where}
     ORDER BY e.occurred_at DESC, e.id DESC
     LIMIT ?
  `).bind(...values, options.limit + 1).all<AuditRow>();
  const events = result.results.slice(0, options.limit).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    schoolName: row.school_name,
    actorName: row.actor_name,
    action: row.action,
    resourceType: row.resource_type,
    occurredAt: row.occurred_at,
  }));
  return {
    events,
    nextCursor: result.results.length > options.limit && events.length
      ? encodeAuditCursor(events.at(-1)!) : null,
  };
}
