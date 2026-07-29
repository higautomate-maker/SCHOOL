import { sql } from "drizzle-orm";
import { withPlatformReadDatabase } from "../runtime/postgres.ts";
import type { SchoolListOptions, SchoolPage, SchoolSummary } from "./repository.ts";

type SchoolRow = {
  id: string;
  name: string;
  city: string | null;
  plan: string | null;
  status: string;
  createdAt: Date | string;
  periodEndsAt: Date | string | null;
  invitationStatus: string | null;
  studentCount: number | string | null;
};

export async function listPostgresSchools(options: SchoolListOptions = {}): Promise<SchoolPage> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const decodedCursor = options.cursor ? decodeCursor(options.cursor) : null;
  const cursor = decodedCursor
    ? sql`AND (t.created_at, t.id) < (${decodedCursor.createdAt}::timestamptz, ${decodedCursor.id}::uuid)`
    : sql``;

  return withPlatformReadDatabase(async (database) => {
    const result = await database.execute<SchoolRow>(sql`
      SELECT
        t.id,
        t.name,
        c.city,
        p.name AS plan,
        t.status,
        t.created_at AS "createdAt",
        s.period_ends_at AS "periodEndsAt",
        invitation.status AS "invitationStatus",
        student_totals.student_count AS "studentCount"
      FROM tenants t
      LEFT JOIN campuses c
        ON c.tenant_id = t.id
       AND c.code = 'MAIN'
      LEFT JOIN subscriptions s
        ON s.tenant_id = t.id
      LEFT JOIN plans p
        ON p.id = s.plan_id
      LEFT JOIN LATERAL (
        SELECT i.status
        FROM school_invitations i
        WHERE i.tenant_id = t.id
        ORDER BY i.created_at DESC
        LIMIT 1
      ) invitation ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS student_count
        FROM students st
        WHERE st.tenant_id = t.id
          AND st.status = 'active'
      ) student_totals ON true
      WHERE t.status <> 'archived'
      ${cursor}
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT ${limit + 1}
    `);
    const rows = result.rows;
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    return {
      schools: pageRows.map(toSummary),
      nextCursor: hasMore && pageRows.length
        ? encodeCursor(pageRows.at(-1)!)
        : null,
    };
  });
}

function encodeCursor(row: Pick<SchoolRow, "createdAt" | "id">): string {
  return Buffer.from(JSON.stringify({
    createdAt: new Date(row.createdAt).toISOString(),
    id: row.id,
  })).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: string; id: string } {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (
      typeof value.createdAt !== "string"
      || !Number.isFinite(Date.parse(value.createdAt))
      || typeof value.id !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id)
    ) {
      throw new Error("Malformed cursor");
    }
    return { createdAt: new Date(value.createdAt).toISOString(), id: value.id };
  } catch {
    throw new Error("Invalid school pagination cursor");
  }
}

function toSummary(row: SchoolRow): SchoolSummary {
  const tenantSuffix = row.id.slice(0, 6).toUpperCase();
  const status = row.status === "active" ? "Active" : row.status === "trial" ? "Trial" : "Attention";
  const periodEnd = row.periodEndsAt ? new Date(row.periodEndsAt).toISOString() : null;
  return {
    tenantId: row.id,
    id: `HIG-${tenantSuffix}`,
    name: row.name,
    code: initials(row.name),
    location: row.city ?? "India",
    students: Number(row.studentCount ?? 0),
    plan: row.plan ?? "Starter",
    status,
    renewal: status === "Trial"
      ? trialLabel(periodEnd)
      : status === "Attention"
        ? "Review required"
        : renewalLabel(periodEnd),
    color: ["mint", "peach", "lilac", "yellow"][Number.parseInt(tenantSuffix.slice(0, 2), 16) % 4] ?? "mint",
    invitation: row.invitationStatus === "accepted" ? "Accepted" : "Pending",
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
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
