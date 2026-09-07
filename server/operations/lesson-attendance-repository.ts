import { getPostgresPool } from "../runtime/postgres.ts";
import { ensurePostgresActor, requirePostgresSchool, sha256Hex } from "../runtime/postgres-repository.ts";
import { currentAttendanceAdmin, readTeacherAssignments } from "./teacher-assignment-repository.ts";
import { evaluateTeacherAttendance } from "./teacher-attendance-policy.ts";
import type { LessonAttendanceInput } from "./lesson-attendance-validation.ts";
import { withTenantDatabase } from "../runtime/postgres.ts";

export async function readLessonAttendance(tenantId: string, userId: string, date: string) {
  return withTenantDatabase(tenantId, async (_db, client) => {
    const grants = await readTeacherAssignments(client, tenantId, userId);
    const result = await client.query(`SELECT academic_session_id AS "academicSessionId",
      class_id AS "classId", section_id AS "sectionId", subject_id AS "subjectId",
      lesson_key AS "lessonId", attendance_date::text AS "attendanceDate",
      student_id AS "studentId", status, note FROM lesson_attendance
      WHERE tenant_id = $1::uuid AND attendance_date = $2::date`, [tenantId, date]);
    return result.rows.filter(row => grants.some(grant => grant.kind === "subject_teacher"
      && grant.academicSessionId === row.academicSessionId && grant.classId === row.classId
      && grant.sectionId === row.sectionId && grant.subjectId === row.subjectId));
  });
}

export type LessonAttendanceActor = {
  tenantId: string;
  userId: string;
  email: string;
  fullName: string;
  canManageAttendance: boolean;
  isSchoolAdmin: boolean;
};

export type LessonAttendanceResult = {
  lessonId: string;
  saved: number;
  attendanceDate: string;
};

export async function saveLessonAttendance(
  actor: LessonAttendanceActor,
  input: LessonAttendanceInput,
  idempotencyKey: string,
): Promise<LessonAttendanceResult> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1::text, true)", [actor.tenantId]);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))", [
      `${actor.tenantId}:lesson-attendance:${idempotencyKey}`,
    ]);
    const requestHash = await sha256Hex(JSON.stringify(input));
    const replay = await client.query<{ response: LessonAttendanceResult; request_hash: string }>(
      `SELECT response, request_hash FROM idempotency_records
       WHERE tenant_id = $1::uuid AND key = $2::text AND actor_email = $3::text
         AND operation = 'lesson_attendance.mark' AND expires_at > now() LIMIT 1`,
      [actor.tenantId, idempotencyKey, actor.email.toLowerCase()],
    );

    await requirePostgresSchool(client, actor.tenantId);
    const actorId = await ensurePostgresActor(client, {
      email: actor.email,
      displayName: actor.fullName,
      fullName: actor.fullName,
    });
    if (actorId !== actor.userId) throw new Error("Lesson attendance identity denied");

    const grants = await readTeacherAssignments(client, actor.tenantId, actor.userId);
    const decision = evaluateTeacherAttendance({
      tenantId: actor.tenantId,
      userId: actor.userId,
      canManageAttendance: actor.canManageAttendance,
      isSchoolAdmin: actor.isSchoolAdmin && await currentAttendanceAdmin(client, actor.tenantId, actor.userId),
    }, {
      tenantId: actor.tenantId,
      academicSessionId: input.academicSessionId,
      classId: input.classId,
      sectionId: input.sectionId,
      kind: "lesson",
      subjectId: input.subjectId,
      lessonId: input.lessonId,
    }, grants, input.overrideReason);
    if (!decision.allowed) {
      if (decision.reason === "override_reason_required") throw new Error("Lesson override reason required");
      throw new Error("Subject teacher assignment required");
    }

    const studentIds = input.entries.map((entry) => entry.studentId);
    const roster = await client.query<{ id: string }>(
      `SELECT s.id
       FROM students s
       JOIN academic_sessions se ON se.tenant_id = s.tenant_id AND se.id = s.academic_session_id
       JOIN school_classes c ON c.tenant_id = s.tenant_id AND c.id = $4::uuid
         AND c.name = s.class_name AND c.active
       JOIN class_sections cs ON cs.tenant_id = c.tenant_id AND cs.class_id = c.id
         AND cs.id = $5::uuid AND cs.name = s.section_name
       JOIN subjects su ON su.tenant_id = s.tenant_id AND su.id = $6::uuid AND su.active
       WHERE s.tenant_id = $1::uuid AND s.academic_session_id = $2::uuid
         AND s.id = ANY($3::uuid[]) AND se.status = 'active'
       FOR SHARE OF s, se, c, cs, su`,
      [actor.tenantId, input.academicSessionId, studentIds, input.classId, input.sectionId, input.subjectId],
    );
    if (roster.rowCount !== studentIds.length) throw new Error("Lesson attendance student scope invalid");

    if (replay.rows[0]) {
      if (replay.rows[0].request_hash !== requestHash) throw new Error("Idempotency key reused with different request");
      await client.query("COMMIT");
      return replay.rows[0].response;
    }

    for (const entry of input.entries) {
      await client.query(
        `INSERT INTO lesson_attendance (
           tenant_id, academic_session_id, class_id, section_id, subject_id,
           lesson_key, attendance_date, student_id, status, note, marked_by
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
           $6::text, $7::date, $8::uuid, $9::attendance_status, $10::text, $11::uuid)
         ON CONFLICT (tenant_id, academic_session_id, class_id, section_id, subject_id, attendance_date, lesson_key, student_id) DO UPDATE SET
           status = EXCLUDED.status, note = EXCLUDED.note,
           marked_by = EXCLUDED.marked_by, updated_at = now()`,
        [actor.tenantId, input.academicSessionId, input.classId, input.sectionId, input.subjectId,
          input.lessonId, input.attendanceDate, entry.studentId, entry.status, entry.note, actorId],
      );
    }

    const result: LessonAttendanceResult = {
      lessonId: input.lessonId,
      saved: input.entries.length,
      attendanceDate: input.attendanceDate,
    };
    await client.query(
      `INSERT INTO audit_events (id, tenant_id, actor_id, action, resource_type,
         resource_id, reason, metadata, occurred_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'lesson_attendance.mark',
         'lesson_attendance', $3::text, $4::text, $5::jsonb, now())`,
      [actor.tenantId, actorId, input.lessonId, decision.auditReason, JSON.stringify({
        academicSessionId: input.academicSessionId,
        classId: input.classId,
        sectionId: input.sectionId,
        subjectId: input.subjectId,
        attendanceDate: input.attendanceDate,
        saved: input.entries.length,
      })],
    );
    await client.query(
      `INSERT INTO idempotency_records (tenant_id, key, actor_email, operation,
         request_hash, response, created_at, expires_at)
       VALUES ($1::uuid, $2::text, $3::text, 'lesson_attendance.mark', $4::text,
         $5::jsonb, now(), now() + interval '24 hours')`,
      [actor.tenantId, idempotencyKey, actor.email.toLowerCase(),
        await sha256Hex(JSON.stringify(input)), JSON.stringify(result)],
    );
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
