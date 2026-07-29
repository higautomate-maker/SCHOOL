import { sql } from "drizzle-orm";
import type { PoolClient } from "pg";
import type { ChatGPTUser } from "../../app/chatgpt-auth";
import {
  ensurePostgresActor,
  isPostgresUniqueViolation,
  sha256Hex,
} from "../runtime/postgres-repository.ts";
import {
  withPlatformReadDatabase,
  withPlatformSchoolCreationDatabase,
} from "../runtime/postgres.ts";
import type { SchoolListOptions, SchoolPage, SchoolSummary } from "./repository.ts";
import type { CreateSchoolInput } from "./validation.ts";

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
type ReplayRow = { response: unknown };
const moduleKeys = [
  "student_information",
  "fees_finance",
  "attendance",
  "examinations",
  "communication",
] as const;

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

export function findPostgresSchoolCreationReplay(
  key: string,
  actorEmail: string,
): Promise<SchoolSummary | null> {
  return withPlatformSchoolCreationDatabase(
    async (_database, client) => readSchoolCreationReplay(client, key, actorEmail),
  );
}

export async function createPostgresSchool(
  input: CreateSchoolInput,
  actor: ChatGPTUser,
  idempotencyKey: string,
): Promise<SchoolSummary> {
  try {
    return await withPlatformSchoolCreationDatabase(async (_database, client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
        [`school.create:${actor.email.toLowerCase()}:${idempotencyKey}`],
      );
      const replay = await readSchoolCreationReplay(
        client,
        idempotencyKey,
        actor.email,
      );
      if (replay) return replay;

      const actorId = await ensurePostgresActor(client, actor);
      const adminId = await ensureInvitedAdmin(client, input.adminEmail);
      const planId = await findOrCreatePlan(client, input.plan);
      const tenantId = crypto.randomUUID();
      const campusId = crypto.randomUUID();
      const slugBase = input.name.toLowerCase().normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48)
        || "school";
      const slug = `${slugBase}-${tenantId.slice(0, 6)}`;
      const tokenHash = await sha256Hex(
        `${crypto.randomUUID()}:${input.adminEmail}:${tenantId}`,
      );

      await client.query(
        `INSERT INTO tenants (
           id, name, slug, status, country_code, created_at, updated_at
         ) VALUES (
           $1::uuid, $2::text, $3::text, 'trial', 'IN', now(), now()
         )`,
        [tenantId, input.name, slug],
      );
      await client.query(
        `INSERT INTO campuses (
           id, tenant_id, name, code, city, created_at, updated_at
         ) VALUES (
           $1::uuid, $2::uuid, 'Main Campus', 'MAIN', $3::text, now(), now()
         )`,
        [campusId, tenantId, input.city],
      );
      await client.query(
        `INSERT INTO subscriptions (
           id, tenant_id, plan_id, status, period_ends_at,
           created_at, updated_at
         ) VALUES (
           gen_random_uuid(), $1::uuid, $2::uuid, 'trial',
           now() + interval '14 days', now(), now()
         )`,
        [tenantId, planId],
      );
      await client.query(
        `INSERT INTO memberships (
           tenant_id, user_id, role_key, campus_id, created_at
         ) VALUES (
           $1::uuid, $2::uuid, 'school_admin', $3::uuid, now()
         )`,
        [tenantId, adminId, campusId],
      );
      for (const moduleKey of moduleKeys) {
        await client.query(
          `INSERT INTO module_policies (
             tenant_id, module_key, enabled, source, configuration,
             updated_at, updated_by
           ) VALUES (
             $1::uuid, $2::text, true, 'plan', '{}'::jsonb, now(), $3::uuid
           )`,
          [tenantId, moduleKey, actorId],
        );
      }
      await client.query(
        `INSERT INTO school_invitations (
           id, tenant_id, email, role_key, token_hash, status, expires_at,
           invited_by, created_at, updated_at
         ) VALUES (
           gen_random_uuid(), $1::uuid, $2::text, 'school_admin', $3::text,
           'pending', now() + interval '7 days', $4::uuid, now(), now()
         )`,
        [tenantId, input.adminEmail, tokenHash, actorId],
      );
      await client.query(
        `INSERT INTO audit_events (
           id, tenant_id, actor_id, action, resource_type, resource_id,
           reason, metadata, occurred_at
         ) VALUES (
           gen_random_uuid(), $1::uuid, $2::uuid, 'school.create',
           'tenant', $3::text, 'Platform onboarding', $4::jsonb, now()
         )`,
        [
          tenantId,
          actorId,
          tenantId,
          JSON.stringify({
            plan: input.plan,
            city: input.city,
            adminEmail: input.adminEmail,
          }),
        ],
      );

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
      await client.query(
        `INSERT INTO idempotency_records (
           tenant_id, key, actor_email, operation, request_hash,
           response, created_at, expires_at
         ) VALUES (
           $1::uuid, $2::text, $3::text, 'school.create', $4::text,
           $5::jsonb, now(), now() + interval '24 hours'
         )`,
        [
          tenantId,
          idempotencyKey,
          actor.email.toLowerCase(),
          await sha256Hex(JSON.stringify(input)),
          JSON.stringify(school),
        ],
      );
      return school;
    });
  } catch (error) {
    if (isPostgresUniqueViolation(error)) {
      const replay = await findPostgresSchoolCreationReplay(
        idempotencyKey,
        actor.email,
      );
      if (replay) return replay;
    }
    throw error;
  }
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

async function readSchoolCreationReplay(
  client: PoolClient,
  key: string,
  actorEmail: string,
): Promise<SchoolSummary | null> {
  const result = await client.query<ReplayRow>(
    `SELECT response
     FROM idempotency_records
     WHERE key = $1::text
       AND actor_email = $2::text
       AND operation = 'school.create'
       AND expires_at > now()
     ORDER BY created_at DESC
     LIMIT 1`,
    [key, actorEmail.toLowerCase()],
  );
  return result.rows[0]?.response as SchoolSummary | undefined ?? null;
}

async function ensureInvitedAdmin(
  client: PoolClient,
  email: string,
): Promise<string> {
  const adminName = email.split("@")[0]?.replace(/[._-]+/g, " ") || "School Admin";
  const result = await client.query<{ id: string }>(
    `INSERT INTO users (
       id, email, full_name, status, mfa_enabled, created_at, updated_at
     ) VALUES (
       gen_random_uuid(), $1::text, $2::text, 'invited', false, now(), now()
     )
     ON CONFLICT ((lower(email))) DO UPDATE
       SET updated_at = now()
     RETURNING id`,
    [email.toLowerCase(), adminName],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("School administrator could not be invited");
  return id;
}

async function findOrCreatePlan(
  client: PoolClient,
  plan: CreateSchoolInput["plan"],
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `SELECT id
     FROM plans
     WHERE name = $1::text
     ORDER BY created_at
     LIMIT 1`,
    [plan],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const monthlyPricePaise = planPrice(plan);
  const result = await client.query<{ id: string }>(
    `INSERT INTO plans (
       id, name, monthly_price_paise, annual_price_paise,
       active, created_at, updated_at
     ) VALUES (
       gen_random_uuid(), $1::text, $2::bigint, $3::bigint,
       true, now(), now()
     )
     RETURNING id`,
    [plan, monthlyPricePaise, monthlyPricePaise * 10],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Subscription plan could not be resolved");
  return id;
}

function planPrice(plan: CreateSchoolInput["plan"]): number {
  return plan === "Starter" ? 149_900 : plan === "Growth" ? 349_900 : 799_900;
}
