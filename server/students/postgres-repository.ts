import type { PoolClient } from "pg";
import type { ChatGPTUser } from "../../app/chatgpt-auth";
import type { StudentRecord } from "./repository.ts";
import {
  ensurePostgresActor,
  isPostgresUniqueViolation,
  requirePostgresSchool,
  sha256Hex,
  timestampString,
} from "../runtime/postgres-repository.ts";
import { withTenantDatabase } from "../runtime/postgres.ts";
import type { CreateStudentInput } from "./validation.ts";

type StudentRow = Omit<StudentRecord, "fullName" | "createdAt"> & {
  createdAt: Date | string;
};
type ReplayRow = { response: unknown };

export function listPostgresStudents(
  tenantId: string,
  sessionId?: string | null,
): Promise<StudentRecord[]> {
  return withTenantDatabase(tenantId, async (_database, client) => {
    await requirePostgresSchool(client, tenantId);
    const result = sessionId
      ? await client.query<StudentRow>(
        `${studentSelect}
         WHERE tenant_id = $1
           AND academic_session_id::text = $2
         ORDER BY created_at DESC
         LIMIT 500`,
        [tenantId, sessionId],
      )
      : await client.query<StudentRow>(
        `${studentSelect}
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT 500`,
        [tenantId],
      );
    return result.rows.map(toStudentRecord);
  });
}

export function findPostgresStudentReplay(
  tenantId: string,
  key: string,
  actorEmail: string,
): Promise<StudentRecord | null> {
  return withTenantDatabase(
    tenantId,
    async (_database, client) => readReplay(client, tenantId, key, actorEmail),
  );
}

export function createPostgresStudent(
  tenantId: string,
  input: CreateStudentInput,
  actor: ChatGPTUser,
  key: string,
): Promise<StudentRecord> {
  return withTenantDatabase(tenantId, async (_database, client) => {
    const replay = await readReplay(client, tenantId, key, actor.email);
    if (replay) return replay;

    await requirePostgresSchool(client, tenantId);
    const campusResult = await client.query<{ id: string }>(
      `SELECT id
       FROM campuses
       WHERE tenant_id = $1
       ORDER BY created_at
       LIMIT 1`,
      [tenantId],
    );
    const campus = campusResult.rows[0];
    if (!campus) throw new Error("School campus not found");
    const sessionResult = await client.query<{ id: string }>(
      `SELECT id
       FROM academic_sessions
       WHERE tenant_id = $1
         AND status = 'active'
       ORDER BY starts_on DESC
       LIMIT 1`,
      [tenantId],
    );
    const actorId = await ensurePostgresActor(client, actor);
    const id = crypto.randomUUID();

    let inserted: StudentRow;
    try {
      const result = await client.query<StudentRow>(
        `INSERT INTO students (
           id, tenant_id, campus_id, academic_session_id,
           admission_number, roll_number, first_name, last_name,
           gender, date_of_birth, admission_date, class_name, section_name,
           guardian_name, guardian_phone, status, created_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           $9, $10, $11, $12, $13, $14, $15, 'active', $16
         )
         RETURNING
           id,
           admission_number AS "admissionNumber",
           roll_number AS "rollNumber",
           first_name AS "firstName",
           last_name AS "lastName",
           gender,
           date_of_birth AS "dateOfBirth",
           admission_date AS "admissionDate",
           class_name AS "className",
           section_name AS "sectionName",
           guardian_name AS "guardianName",
           guardian_phone AS "guardianPhone",
           status,
           created_at AS "createdAt"`,
        [
          id,
          tenantId,
          campus.id,
          sessionResult.rows[0]?.id ?? null,
          input.admissionNumber,
          input.rollNumber,
          input.firstName,
          input.lastName,
          input.gender,
          input.dateOfBirth,
          input.admissionDate,
          input.className,
          input.sectionName,
          input.guardianName,
          input.guardianPhone,
          actorId,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Student admission failed");
      inserted = row;
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        throw new Error("UNIQUE constraint failed: students admission number");
      }
      throw error;
    }

    const student = toStudentRecord(inserted);
    await client.query(
      `INSERT INTO audit_events (
         id, tenant_id, actor_id, action, resource_type, resource_id,
         reason, metadata, occurred_at
       ) VALUES (
         gen_random_uuid(), $1, $2, 'student.create', 'student', $3,
         'Student admission', $4::jsonb, now()
       )`,
      [
        tenantId,
        actorId,
        student.id,
        JSON.stringify({
          admissionNumber: input.admissionNumber,
          className: input.className,
          sectionName: input.sectionName,
        }),
      ],
    );
    await client.query(
      `INSERT INTO idempotency_records (
         tenant_id, key, actor_email, operation, request_hash,
         response, created_at, expires_at
       ) VALUES (
         $1, $2, $3, 'student.create', $4, $5::jsonb,
         now(), now() + interval '24 hours'
       )`,
      [
        tenantId,
        key,
        actor.email.toLowerCase(),
        await sha256Hex(JSON.stringify(input)),
        JSON.stringify(student),
      ],
    );
    return student;
  });
}

const studentSelect = `SELECT
  id,
  admission_number AS "admissionNumber",
  roll_number AS "rollNumber",
  first_name AS "firstName",
  last_name AS "lastName",
  gender,
  date_of_birth AS "dateOfBirth",
  admission_date AS "admissionDate",
  class_name AS "className",
  section_name AS "sectionName",
  guardian_name AS "guardianName",
  guardian_phone AS "guardianPhone",
  status,
  created_at AS "createdAt"
FROM students`;

function toStudentRecord(row: StudentRow): StudentRecord {
  return {
    ...row,
    createdAt: timestampString(row.createdAt),
    fullName: `${row.firstName} ${row.lastName}`.trim(),
  };
}

async function readReplay(
  client: PoolClient,
  tenantId: string,
  key: string,
  actorEmail: string,
): Promise<StudentRecord | null> {
  const result = await client.query<ReplayRow>(
    `SELECT response
     FROM idempotency_records
     WHERE tenant_id = $1
       AND key = $2
       AND actor_email = $3
       AND operation = 'student.create'
       AND expires_at > now()
     LIMIT 1`,
    [tenantId, key, actorEmail.toLowerCase()],
  );
  return result.rows[0]?.response as StudentRecord | undefined ?? null;
}
