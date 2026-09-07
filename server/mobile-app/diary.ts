import { z } from "zod";
import { withTenantDatabase } from "../runtime/postgres.ts";
import { readTeacherAssignments } from "../operations/teacher-assignment-repository.ts";
import type { MobileAuthenticatedPrincipal } from "../mobile-auth/types.ts";

export const diaryAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), id: z.string().uuid(), assignmentId: z.string().uuid(),
    title: z.string().trim().min(2).max(140), description: z.string().trim().min(2).max(4000),
    date: z.iso.date(), dueDate: z.iso.date() }).strict(),
  z.object({ action: z.literal('complete'), diaryId: z.string().uuid(), studentId: z.string().uuid(), completed: z.boolean() }).strict(),
]).refine(value => value.action !== 'create' || value.dueDate >= value.date, 'Invalid due date');

export function diaryForDate(principal: MobileAuthenticatedPrincipal, date: string) {
  return withTenantDatabase(principal.tenantId, async (_db, client) => {
    await client.query("SELECT set_config('app.mobile_auth_service','true',true)");
    const result = await client.query(`SELECT d.id,d.title,d.description,d.record_date::text AS "date",
      d.due_date::text AS "dueDate",su.name AS "subjectName",c.name AS "className",cs.name AS "sectionName",
      d.academic_session_id AS "academicSessionId",d.class_id AS "classId",d.section_id AS "sectionId",d.subject_id AS "subjectId"
      FROM mobile_diary d JOIN subjects su ON su.tenant_id=d.tenant_id AND su.id=d.subject_id
      JOIN school_classes c ON c.tenant_id=d.tenant_id AND c.id=d.class_id
      JOIN class_sections cs ON cs.tenant_id=d.tenant_id AND cs.id=d.section_id
      WHERE d.tenant_id=$1::uuid AND d.record_date=$2::date ORDER BY su.name,d.created_at`, [principal.tenantId,date]);
    if(principal.principalType === 'school') {
      const grants = await readTeacherAssignments(client,principal.tenantId,principal.userId);
      return result.rows.filter(d => grants.some(g => g.kind==='subject_teacher' && g.subjectId===d.subjectId
        && g.classId===d.classId && g.sectionId===d.sectionId && g.academicSessionId===d.academicSessionId));
    }
    const students = await client.query(`SELECT s.id,s.first_name AS name,s.class_name,s.section_name,s.academic_session_id
      FROM students s JOIN mobile_identity_assignments a ON a.tenant_id=s.tenant_id AND a.resource_id=s.id
      WHERE a.tenant_id=$1::uuid AND a.mobile_identity_id=$2::uuid AND a.resource_type='student' AND a.status='active'`,
      [principal.tenantId,principal.mobileIdentityId]);
    const completion = await client.query(`SELECT diary_id,student_id,completed FROM mobile_diary_completion
      WHERE tenant_id=$1::uuid AND student_id=ANY($2::uuid[])`, [principal.tenantId,students.rows.map(s=>s.id)]);
    return result.rows.flatMap(d => students.rows.filter(s => s.class_name===d.className && s.section_name===d.sectionName
      && s.academic_session_id===d.academicSessionId).map(s=>({...d,studentId:s.id,studentName:s.name,
        completed:completion.rows.some(r=>r.diary_id===d.id && r.student_id===s.id && r.completed)})));
  });
}

export function changeDiary(principal: MobileAuthenticatedPrincipal, input: z.infer<typeof diaryAction>) {
  return withTenantDatabase(principal.tenantId, async (_db,client)=>{
    await client.query("SELECT set_config('app.mobile_auth_service','true',true)");
    if(input.action==='create') {
      if(principal.principalType!=='school') throw new Error('Teaching access denied');
      const grants=await readTeacherAssignments(client,principal.tenantId,principal.userId);
      const grant=grants.find(g=>g.id===input.assignmentId && g.kind==='subject_teacher');
      if(!grant || grant.kind!=='subject_teacher') throw new Error('Subject assignment denied');
      const saved=await client.query(`INSERT INTO mobile_diary(id,tenant_id,academic_session_id,class_id,section_id,subject_id,
        title,description,record_date,due_date,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT(id) DO NOTHING RETURNING id`, [input.id,principal.tenantId,grant.academicSessionId,grant.classId,
          grant.sectionId,grant.subjectId,input.title,input.description,input.date,input.dueDate,principal.userId]);
      if(!saved.rowCount) {
        const prior=await client.query(`SELECT id FROM mobile_diary WHERE id=$1::uuid AND tenant_id=$2::uuid
          AND created_by=$3::uuid AND academic_session_id=$4::uuid AND class_id=$5::uuid AND section_id=$6::uuid
          AND subject_id=$7::uuid AND title=$8 AND description=$9 AND record_date=$10::date AND due_date=$11::date`,
          [input.id,principal.tenantId,principal.userId,grant.academicSessionId,grant.classId,grant.sectionId,
            grant.subjectId,input.title,input.description,input.date,input.dueDate]);
        if(!prior.rowCount) throw new Error('Invalid diary retry');
        return {saved:true};
      }
    } else {
      if(principal.principalType!=='parent') throw new Error('Parent identity required');
      const allowed=await client.query(`SELECT s.id FROM students s JOIN mobile_identity_assignments a
        ON a.tenant_id=s.tenant_id AND a.resource_id=s.id JOIN mobile_diary d ON d.tenant_id=s.tenant_id
        AND d.academic_session_id=s.academic_session_id JOIN school_classes c ON c.tenant_id=d.tenant_id
        AND c.id=d.class_id AND c.name=s.class_name JOIN class_sections cs ON cs.tenant_id=d.tenant_id
        AND cs.id=d.section_id AND cs.name=s.section_name
        WHERE s.tenant_id=$1::uuid AND s.id=$2::uuid AND d.id=$3::uuid
        AND a.mobile_identity_id=$4::uuid AND a.status='active' AND a.resource_type='student' FOR SHARE OF a,s,d`,
        [principal.tenantId,input.studentId,input.diaryId,principal.mobileIdentityId]);
      if(!allowed.rowCount) throw new Error('Diary student assignment denied');
      await client.query(`INSERT INTO mobile_diary_completion(tenant_id,diary_id,student_id,completed,updated_by)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,diary_id,student_id) DO UPDATE SET
        completed=EXCLUDED.completed,updated_by=EXCLUDED.updated_by,updated_at=now()`,
        [principal.tenantId,input.diaryId,input.studentId,input.completed,principal.userId]);
    }
    await client.query(`INSERT INTO audit_events(id,tenant_id,actor_id,action,resource_type,resource_id,reason,metadata,occurred_at)
      VALUES(gen_random_uuid(),$1,$2,$3,'mobile_diary',$4,'Mobile diary workflow',$5::jsonb,now())`,
      [principal.tenantId,principal.userId,`diary.${input.action}`,input.action==='create'?input.id:input.diaryId,
        JSON.stringify(input.action==='complete'?{studentId:input.studentId,completed:input.completed}:{assignmentId:input.assignmentId})]);
    return {saved:true};
  });
}
