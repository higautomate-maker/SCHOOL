import type { PoolClient } from "pg";
import { withTenantDatabase } from "../runtime/postgres.ts";
import { requirePostgresSchool } from "../runtime/postgres-repository.ts";
import type { TeacherAssignmentInput } from "./teacher-assignment-validation.ts";
import type { TeacherAttendanceGrant } from "./teacher-attendance-policy.ts";

export type TeacherClassContext = TeacherAttendanceGrant & {
  id: string; sessionName: string; className: string; sectionName: string; subjectName: string | null;
};

/** Called inside the same tenant transaction as any future attendance write.
 * SHARE locks prevent revocation until the authorized write commits.
 */
export async function readTeacherAssignments(client: PoolClient, tenantId: string, userId: string): Promise<TeacherClassContext[]> {
  const membership = await client.query(`SELECT m.role_key FROM memberships m
    JOIN users u ON u.id = m.user_id WHERE m.tenant_id = $1::uuid AND m.user_id = $2::uuid
    AND m.status = 'active' AND u.status = 'active' AND m.role_key IN ('teacher', 'school_admin')
    FOR SHARE OF m, u`, [tenantId, userId]);
  if (!membership.rowCount) return [];
  const result = await client.query<TeacherClassContext>(
    `SELECT a.id, a.tenant_id AS "tenantId", a.academic_session_id AS "academicSessionId",
       a.user_id AS "userId", a.class_id AS "classId", a.section_id AS "sectionId",
       a.kind, a.subject_id AS "subjectId", a.active,
       se.name AS "sessionName", c.name AS "className", cs.name AS "sectionName", su.name AS "subjectName"
     FROM teacher_assignments a
     JOIN academic_sessions se ON se.tenant_id = a.tenant_id AND se.id = a.academic_session_id
     JOIN school_classes c ON c.tenant_id = a.tenant_id AND c.id = a.class_id
     JOIN class_sections cs ON cs.tenant_id = a.tenant_id AND cs.class_id = a.class_id AND cs.id = a.section_id
     LEFT JOIN subjects su ON su.tenant_id = a.tenant_id AND su.id = a.subject_id
     WHERE a.tenant_id = $1::uuid AND a.user_id = $2::uuid AND a.active
       AND se.status = 'active' AND c.active AND (a.subject_id IS NULL OR su.active)
       AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = a.tenant_id
         AND m.user_id = a.user_id AND m.status = 'active' AND m.role_key IN ('teacher', 'school_admin'))
     ORDER BY c.display_order, c.name, cs.name, su.name NULLS FIRST
     FOR SHARE OF a, se, c, cs`, [tenantId, userId]);
  return result.rows;
}

export async function currentAttendanceAdmin(client: PoolClient, tenantId: string, userId: string): Promise<boolean> {
  const result = await client.query(`SELECT m.user_id FROM memberships m JOIN users u ON u.id=m.user_id
    WHERE m.tenant_id=$1::uuid AND m.user_id=$2::uuid AND m.role_key='school_admin'
      AND m.status='active' AND u.status='active' FOR SHARE OF m,u`, [tenantId, userId]);
  return Boolean(result.rowCount);
}

export function teacherAssignmentSetup(tenantId: string, administratorId: string) {
  return withTenantDatabase(tenantId, async (_db, client) => {
    if (!await currentAttendanceAdmin(client, tenantId, administratorId)) throw new Error('Administrator access denied');
    const teachers = await client.query(`SELECT u.id,u.full_name AS name,u.email FROM memberships m JOIN users u ON u.id=m.user_id
      WHERE m.tenant_id=$1 AND m.role_key IN ('teacher','school_admin') AND m.status='active' AND u.status='active' ORDER BY u.full_name`,[tenantId]);
    const sessions = await client.query(`SELECT id,name FROM academic_sessions WHERE tenant_id=$1 AND status IN ('planned','active') ORDER BY starts_on DESC`,[tenantId]);
    const sections = await client.query(`SELECT cs.id,c.id AS "classId",c.name AS "className",cs.name FROM class_sections cs
      JOIN school_classes c ON c.tenant_id=cs.tenant_id AND c.id=cs.class_id WHERE cs.tenant_id=$1 AND c.active ORDER BY c.name,cs.name`,[tenantId]);
    const subjects = await client.query('SELECT id,name FROM subjects WHERE tenant_id=$1 AND active ORDER BY name',[tenantId]);
    const assignments = await client.query(`SELECT a.id,a.user_id AS "userId",u.full_name AS "teacherName",a.academic_session_id AS "academicSessionId",
      a.class_id AS "classId",a.section_id AS "sectionId",a.subject_id AS "subjectId",a.kind,a.active,
      c.name AS "className",cs.name AS "sectionName",su.name AS "subjectName",se.name AS "sessionName"
      FROM teacher_assignments a JOIN users u ON u.id=a.user_id
      JOIN school_classes c ON c.tenant_id=a.tenant_id AND c.id=a.class_id
      JOIN class_sections cs ON cs.tenant_id=a.tenant_id AND cs.id=a.section_id
      JOIN academic_sessions se ON se.tenant_id=a.tenant_id AND se.id=a.academic_session_id
      LEFT JOIN subjects su ON su.tenant_id=a.tenant_id AND su.id=a.subject_id
      WHERE a.tenant_id=$1 AND a.active ORDER BY u.full_name,c.name,cs.name`,[tenantId]);
    return {teachers:teachers.rows,sessions:sessions.rows,sections:sections.rows,subjects:subjects.rows,assignments:assignments.rows};
  });
}

export function getTeacherContexts(tenantId: string, userId: string): Promise<TeacherClassContext[]> {
  return withTenantDatabase(tenantId, async (_db, client) => {
    await requirePostgresSchool(client, tenantId);
    return readTeacherAssignments(client, tenantId, userId);
  });
}

/** Caller must check current academics permission; membership is rechecked here. */
export function setTeacherAssignment(tenantId: string, administratorId: string, input: TeacherAssignmentInput): Promise<{ id: string }> {
  return withTenantDatabase(tenantId, async (_db, client) => {
    await requirePostgresSchool(client, tenantId);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))", [`teacher-assignments:${tenantId}`]);
    const admin = await client.query(
      `SELECT m.user_id FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.tenant_id = $1::uuid AND m.user_id = $2::uuid AND m.role_key = 'school_admin'
         AND m.status = 'active' AND u.status = 'active' FOR SHARE OF m, u`, [tenantId, administratorId]);
    if (!admin.rowCount) throw new Error("Teacher assignment access denied");
    const teacher = await client.query(
      `SELECT m.user_id FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.tenant_id = $1::uuid AND m.user_id = $2::uuid AND m.role_key IN ('teacher', 'school_admin')
         AND m.status = 'active' AND u.status = 'active' FOR SHARE OF m, u`, [tenantId, input.userId]);
    // Revocation is allowed even after a teacher is suspended.
    if (input.active && !teacher.rowCount) throw new Error("Active teacher membership required");
    const scope = await client.query(
      `SELECT cs.id FROM class_sections cs JOIN school_classes c ON c.tenant_id = cs.tenant_id AND c.id = cs.class_id
       JOIN academic_sessions se ON se.tenant_id = cs.tenant_id AND se.id = $4::uuid
       WHERE cs.tenant_id = $1::uuid AND cs.class_id = $2::uuid AND cs.id = $3::uuid
         AND (NOT $5::boolean OR (c.active AND se.status IN ('planned', 'active')))
       FOR SHARE OF cs, c, se`, [tenantId, input.classId, input.sectionId, input.academicSessionId, input.active]);
    if (!scope.rowCount) throw new Error("Class assignment scope invalid");
    const subjectId = input.kind === "subject_teacher" ? input.subjectId : null;
    if (subjectId) {
      const subject = await client.query(
        "SELECT id FROM subjects WHERE tenant_id = $1::uuid AND id = $2::uuid AND (NOT $3::boolean OR active) FOR SHARE",
        [tenantId, subjectId, input.active]);
      if (!subject.rowCount) throw new Error("Subject assignment invalid");
    }
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM teacher_assignments WHERE tenant_id = $1::uuid AND academic_session_id = $2::uuid
       AND user_id = $3::uuid AND class_id = $4::uuid AND section_id = $5::uuid
       AND kind = $6::text AND subject_id IS NOT DISTINCT FROM $7::uuid FOR UPDATE`,
      [tenantId, input.academicSessionId, input.userId, input.classId, input.sectionId, input.kind, subjectId]);
    let id = existing.rows[0]?.id;
    if (id) {
      await client.query("UPDATE teacher_assignments SET active = $3::boolean, updated_by = $4::uuid, updated_at = now() WHERE tenant_id = $1::uuid AND id = $2::uuid",
        [tenantId, id, input.active, administratorId]);
    } else {
      if (!input.active) throw new Error("Teacher assignment not found");
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO teacher_assignments (tenant_id, academic_session_id, user_id, class_id, section_id, kind, subject_id, active, updated_by)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::text, $7::uuid, true, $8::uuid) RETURNING id`,
        [tenantId, input.academicSessionId, input.userId, input.classId, input.sectionId, input.kind, subjectId, administratorId]);
      id = inserted.rows[0].id;
    }
    await client.query(
      `INSERT INTO audit_events (id, tenant_id, actor_id, action, resource_type, resource_id, reason, metadata, occurred_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'academics.teacher_assignment', 'teacher_assignment', $3::text, $4::text, $5::jsonb, now())`,
      [tenantId, administratorId, id, input.reason, JSON.stringify(input)]);
    return { id };
  });
}
