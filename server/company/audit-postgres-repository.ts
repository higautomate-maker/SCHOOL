import { withPlatformReadDatabase } from "../runtime/postgres.ts";
import {
  decodeAuditCursor,
  encodeAuditCursor,
  type CompanyAuditEvent,
  type CompanyAuditOptions,
  type CompanyAuditPage,
} from "./audit-repository.ts";

type AuditRow = {
  id: string;
  tenantId: string | null;
  schoolName: string | null;
  actorName: string | null;
  action: string;
  resourceType: string;
  occurredAt: string;
};

export function listPostgresCompanyAudit(options: CompanyAuditOptions): Promise<CompanyAuditPage> {
  const cursor = decodeAuditCursor(options.cursor);
  return withPlatformReadDatabase(async (_database, client) => {
    const result = await client.query<AuditRow>(
      `SELECT e.id, e.tenant_id AS "tenantId", t.name AS "schoolName",
              u.full_name AS "actorName", e.action,
              e.resource_type AS "resourceType",
              to_char(e.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "occurredAt"
         FROM audit_events e
         LEFT JOIN tenants t ON t.id = e.tenant_id
         LEFT JOIN users u ON u.id = e.actor_id
        WHERE ($1::uuid IS NULL OR e.tenant_id = $1::uuid)
          AND ($2::timestamptz IS NULL OR (e.occurred_at, e.id) < ($2::timestamptz, $3::uuid))
        ORDER BY e.occurred_at DESC, e.id DESC
        LIMIT $4`,
      [options.tenantId ?? null, cursor?.occurredAt ?? null, cursor?.id ?? null, options.limit + 1],
    );
    const events: CompanyAuditEvent[] = result.rows.slice(0, options.limit);
    return {
      events,
      nextCursor: result.rows.length > options.limit && events.length
        ? encodeAuditCursor(events.at(-1)!) : null,
    };
  });
}
