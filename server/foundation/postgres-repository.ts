import type { PoolClient } from "pg";
import type { ChatGPTUser } from "../../app/chatgpt-auth";
import type { FoundationState } from "./repository.ts";
import {
  calendarDateString,
  ensurePostgresActor,
  isPostgresUniqueViolation,
  requirePostgresSchool,
} from "../runtime/postgres-repository.ts";
import { withTenantDatabase } from "../runtime/postgres.ts";
import type { FoundationAction } from "./validation.ts";

type SessionRow = {
  id: string;
  name: string;
  startsOn: Date | string;
  endsOn: Date | string;
  status: "planned" | "active" | "closed";
};
type ClassRow = {
  id: string;
  name: string;
  code: string;
  displayOrder: number | string;
};
type SectionRow = {
  classId: string;
  name: string;
  capacity: number | string;
};
type SubjectRow = {
  id: string;
  name: string;
  code: string;
  type: "core" | "elective" | "cocurricular";
};
type SettingRow = FoundationState["settings"];

const defaultSettings: SettingRow = {
  shortName: "",
  email: "",
  phone: "",
  principalName: "",
  address: "",
  currencyCode: "INR",
  admissionPrefix: "HIG",
  receiptPrefix: "RCPT",
};

export function getPostgresFoundation(tenantId: string): Promise<FoundationState> {
  return withTenantDatabase(tenantId, async (_database, client) => {
    await requirePostgresSchool(client, tenantId);
    return readFoundation(client, tenantId);
  });
}

export function applyPostgresFoundationAction(
  tenantId: string,
  action: FoundationAction,
  actor: ChatGPTUser,
): Promise<FoundationState> {
  return withTenantDatabase(tenantId, async (_database, client) => {
    await requirePostgresSchool(client, tenantId);
    const actorId = await ensurePostgresActor(client, actor);
    let resourceType = "school_configuration";
    let resourceId = tenantId;

    try {
      if (action.action === "create_session") {
        if (Date.parse(action.endsOn) <= Date.parse(action.startsOn)) {
          throw new Error("Academic session must end after it starts");
        }
        resourceType = "academic_session";
        resourceId = crypto.randomUUID();
        if (action.activate) {
          await client.query(
            `UPDATE academic_sessions
             SET status = 'closed',
                 updated_at = now()
             WHERE tenant_id = $1
               AND status = 'active'`,
            [tenantId],
          );
        }
        await client.query(
          `INSERT INTO academic_sessions (
             id, tenant_id, name, starts_on, ends_on, status
           ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            resourceId,
            tenantId,
            action.name,
            action.startsOn,
            action.endsOn,
            action.activate ? "active" : "planned",
          ],
        );
      } else if (action.action === "activate_session") {
        const session = await client.query<{ id: string }>(
          `SELECT id
           FROM academic_sessions
           WHERE tenant_id = $1
             AND id = $2
           LIMIT 1`,
          [tenantId, action.sessionId],
        );
        if (!session.rows[0]) throw new Error("Academic session not found");
        await client.query(
          `UPDATE academic_sessions
           SET status = 'closed',
               updated_at = now()
           WHERE tenant_id = $1
             AND status = 'active'`,
          [tenantId],
        );
        await client.query(
          `UPDATE academic_sessions
           SET status = 'active',
               updated_at = now()
           WHERE tenant_id = $1
             AND id = $2`,
          [tenantId, action.sessionId],
        );
        resourceType = "academic_session";
        resourceId = action.sessionId;
      } else if (action.action === "create_class") {
        resourceType = "class";
        resourceId = crypto.randomUUID();
        const count = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count
           FROM school_classes
           WHERE tenant_id = $1`,
          [tenantId],
        );
        await client.query(
          `INSERT INTO school_classes (
             id, tenant_id, name, code, display_order, active
           ) VALUES ($1, $2, $3, $4, $5, true)`,
          [
            resourceId,
            tenantId,
            action.name,
            action.code,
            Number(count.rows[0]?.count ?? 0) + 1,
          ],
        );
        for (const section of action.sections) {
          await client.query(
            `INSERT INTO class_sections (
               id, tenant_id, class_id, name, capacity
             ) VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
            [tenantId, resourceId, section, action.capacity],
          );
        }
      } else if (action.action === "create_subject") {
        resourceType = "subject";
        resourceId = crypto.randomUUID();
        await client.query(
          `INSERT INTO subjects (
             id, tenant_id, name, code, type, active
           ) VALUES ($1, $2, $3, $4, $5, true)`,
          [resourceId, tenantId, action.name, action.code, action.type],
        );
      } else {
        await client.query(
          `INSERT INTO school_settings (
             tenant_id, short_name, email, phone, principal_name, address,
             currency_code, admission_prefix, receipt_prefix, updated_by, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now()
           )
           ON CONFLICT (tenant_id) DO UPDATE
             SET short_name = EXCLUDED.short_name,
                 email = EXCLUDED.email,
                 phone = EXCLUDED.phone,
                 principal_name = EXCLUDED.principal_name,
                 address = EXCLUDED.address,
                 currency_code = EXCLUDED.currency_code,
                 admission_prefix = EXCLUDED.admission_prefix,
                 receipt_prefix = EXCLUDED.receipt_prefix,
                 updated_by = EXCLUDED.updated_by,
                 updated_at = EXCLUDED.updated_at`,
          [
            tenantId,
            action.shortName,
            action.email,
            action.phone,
            action.principalName,
            action.address,
            action.currencyCode,
            action.admissionPrefix,
            action.receiptPrefix,
            actorId,
          ],
        );
      }
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        throw new Error("UNIQUE constraint failed: foundation record already exists");
      }
      throw error;
    }

    await client.query(
      `INSERT INTO audit_events (
         id, tenant_id, actor_id, action, resource_type, resource_id,
         reason, metadata, occurred_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5,
         'School foundation setup', $6::jsonb, now()
       )`,
      [
        tenantId,
        actorId,
        `foundation.${action.action}`,
        resourceType,
        resourceId,
        JSON.stringify(action),
      ],
    );
    return readFoundation(client, tenantId);
  });
}

async function readFoundation(
  client: PoolClient,
  tenantId: string,
): Promise<FoundationState> {
  const [sessionResult, classResult, sectionResult, subjectResult, settingResult] = await Promise.all([
    client.query<SessionRow>(
      `SELECT
         id, name, starts_on AS "startsOn", ends_on AS "endsOn", status
       FROM academic_sessions
       WHERE tenant_id = $1
       ORDER BY starts_on DESC`,
      [tenantId],
    ),
    client.query<ClassRow>(
      `SELECT
         id, name, code, display_order AS "displayOrder"
       FROM school_classes
       WHERE tenant_id = $1
         AND active = true
       ORDER BY display_order, name`,
      [tenantId],
    ),
    client.query<SectionRow>(
      `SELECT
         class_id AS "classId", name, capacity
       FROM class_sections
       WHERE tenant_id = $1
       ORDER BY class_id, name`,
      [tenantId],
    ),
    client.query<SubjectRow>(
      `SELECT id, name, code, type
       FROM subjects
       WHERE tenant_id = $1
         AND active = true
       ORDER BY name`,
      [tenantId],
    ),
    client.query<SettingRow>(
      `SELECT
         short_name AS "shortName",
         email,
         phone,
         principal_name AS "principalName",
         address,
         currency_code AS "currencyCode",
         admission_prefix AS "admissionPrefix",
         receipt_prefix AS "receiptPrefix"
       FROM school_settings
       WHERE tenant_id = $1
       LIMIT 1`,
      [tenantId],
    ),
  ]);

  const settings = settingResult.rows[0] ?? defaultSettings;
  const classes = classResult.rows.map((schoolClass) => ({
    id: schoolClass.id,
    name: schoolClass.name,
    code: schoolClass.code,
    displayOrder: Number(schoolClass.displayOrder),
    sections: sectionResult.rows
      .filter((section) => section.classId === schoolClass.id)
      .map((section) => ({
        name: section.name,
        capacity: Number(section.capacity),
      })),
  }));
  const checks = [
    ["School profile", Boolean(settings.shortName && settings.email)],
    ["Academic session", sessionResult.rows.some((session) => session.status === "active")],
    ["Classes & sections", classes.length > 0],
    ["Subjects", subjectResult.rows.length > 0],
  ] as const;
  const completed = checks.filter(([, done]) => done).map(([label]) => label);
  const remaining = checks.filter(([, done]) => !done).map(([label]) => label);

  return {
    sessions: sessionResult.rows.map((session) => ({
      ...session,
      startsOn: calendarDateString(session.startsOn),
      endsOn: calendarDateString(session.endsOn),
    })),
    classes,
    subjects: subjectResult.rows,
    settings,
    setup: {
      percent: completed.length * 25,
      completed,
      remaining,
    },
  };
}
