// Disposable local PostgreSQL only. Never accepts an external DATABASE_URL.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import pg from "pg";

const port = process.env.HIG_TEACHER_TEST_PORT;
assert.match(port ?? "", /^\d{1,5}$/);
assert.ok(Number(port) > 1024 && Number(port) < 65536);
const database = "hig_teacher_assignment_test";
const adminUrl = `postgresql://postgres:local-test-only@127.0.0.1:${port}/${database}`;
const admin = new pg.Client({ connectionString: adminUrl, ssl: false });
let runtimePool;
await admin.connect();
try {
  assert.equal((await admin.query("SELECT to_regclass('public.tenants') AS name")).rows[0].name, null,
    "Use a fresh disposable test database; this script will not reset an existing one");
  const migrate = spawnSync(process.execPath, ["scripts/migrate-postgres.mjs"], {
    env: { ...process.env, MIGRATION_DATABASE_URL: adminUrl, PG_SSL: "disable" }, encoding: "utf8",
  });
  assert.equal(migrate.status, 0, migrate.stderr || migrate.stdout);
  await admin.query(readFileSync("db/postgres/seed-demo.sql", "utf8"));
  await admin.query(`
    INSERT INTO school_classes (id, tenant_id, name, code, active) VALUES
      ('80000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Grade 8', 'G8', true);
    INSERT INTO class_sections (id, tenant_id, class_id, name, capacity) VALUES
      ('81000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 'A', 40);
    INSERT INTO subjects (id, tenant_id, name, code, type, active) VALUES
      ('82000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Mathematics', 'MATH', 'core', true);
    INSERT INTO students (id, tenant_id, campus_id, academic_session_id, admission_number,
      roll_number, first_name, last_name, gender, date_of_birth, admission_date,
      class_name, section_name, guardian_name, guardian_phone, status, created_by)
    VALUES ('83000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001',
      'LOCAL-001', '1', 'Local', 'Student', 'other', '2013-01-01', '2026-04-01',
      'Grade 8', 'A', 'Local Guardian', '+919999999999', 'active',
      '10000000-0000-4000-8000-000000000002');
    CREATE ROLE hig_teacher_test_app LOGIN PASSWORD 'local-runtime-only' NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public TO hig_teacher_test_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hig_teacher_test_app;
  `);
  process.env.DATABASE_URL = `postgresql://hig_teacher_test_app:local-runtime-only@127.0.0.1:${port}/${database}`;
  process.env.PG_SSL = "disable";
  process.env.PG_POOL_MAX = "2";
  process.env.HIG_REPOSITORY_BACKEND = "postgres";
  const { getTeacherContexts, setTeacherAssignment } = await import("../server/operations/teacher-assignment-repository.ts");
  const { saveLessonAttendance, readLessonAttendance } = await import("../server/operations/lesson-attendance-repository.ts");
  const { changeDiary, diaryForDate } = await import("../server/mobile-app/diary.ts");
  const { getPostgresPool } = await import("../server/runtime/postgres.ts");
  runtimePool = getPostgresPool();
  const tenant = "30000000-0000-4000-8000-000000000001";
  const administrator = "10000000-0000-4000-8000-000000000002";
  const teacher = "10000000-0000-4000-8000-000000000003";
  const input = { academicSessionId: "50000000-0000-4000-8000-000000000001", userId: teacher,
    classId: "80000000-0000-4000-8000-000000000001", sectionId: "81000000-0000-4000-8000-000000000001",
    kind: "class_teacher", active: true, reason: "Integration test assignment" };
  const first = await setTeacherAssignment(tenant, administrator, input);
  assert.equal((await getTeacherContexts(tenant, teacher)).length, 1);
  assert.equal((await getTeacherContexts(tenant, administrator)).length, 0);
  assert.equal((await setTeacherAssignment(tenant, administrator, input)).id, first.id);
  assert.equal((await getTeacherContexts(tenant, teacher)).length, 1, "repeat setter must not duplicate");
  const lessonInput = { academicSessionId: input.academicSessionId, classId: input.classId,
    sectionId: input.sectionId, subjectId: "82000000-0000-4000-8000-000000000001",
    lessonId: "2026-09-06-period-2", attendanceDate: "2026-09-06",
    entries: [{ studentId: "83000000-0000-4000-8000-000000000001", status: "present", note: "" }] };
  const lessonActor = { tenantId: tenant, userId: teacher, email: "teacher.demo@higschool.test",
    fullName: "Neha Kapoor", canManageAttendance: true, isSchoolAdmin: false };
  await assert.rejects(saveLessonAttendance(lessonActor, lessonInput, "lesson-before-subject"), /assignment/);
  const subject = { ...input, kind: "subject_teacher", subjectId: "82000000-0000-4000-8000-000000000001" };
  const subjectAssignment=await setTeacherAssignment(tenant, administrator, subject);
  assert.equal((await getTeacherContexts(tenant, teacher)).length, 2);
  const lesson = await saveLessonAttendance(lessonActor, lessonInput, "lesson-save-1");
  assert.equal(lesson.saved, 1);
  assert.deepEqual(await saveLessonAttendance(lessonActor, lessonInput, "lesson-save-1"), lesson,
    "lesson attendance must be idempotent");
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM lesson_attendance")).rows[0].n, 1);
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM student_attendance")).rows[0].n, 0,
    "lesson attendance must not alter daily attendance");
  await assert.rejects(saveLessonAttendance(lessonActor,{...lessonInput,attendanceDate:'2026-09-07'},'lesson-save-1'),/Idempotency/);
  await saveLessonAttendance(lessonActor,{...lessonInput,attendanceDate:'2026-09-07'},'lesson-next-date');
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM lesson_attendance')).rows[0].n,2,'same period on another date must not overwrite');
  assert.equal((await readLessonAttendance(tenant,teacher,'2026-09-06')).length,1);
  assert.equal((await readLessonAttendance(tenant,administrator,'2026-09-06')).length,0);

  const parent='10000000-0000-4000-8000-000000000004';
  const identity='84000000-0000-4000-8000-000000000001';
  await admin.query(`INSERT INTO mobile_identities(id,tenant_id,user_id,audience,status) VALUES($1,$2,$3,'parent','active')`,[identity,tenant,parent]);
  await admin.query(`INSERT INTO mobile_identity_assignments(tenant_id,mobile_identity_id,resource_type,resource_id,status)
    VALUES($1,$2,'student',$3,'active')`,[tenant,identity,lessonInput.entries[0].studentId]);
  const teacherPrincipal={tenantId:tenant,userId:teacher,principalType:'school',mobileIdentityId:null};
  const parentPrincipal={tenantId:tenant,userId:parent,principalType:'parent',mobileIdentityId:identity};
  const homework={action:'create',id:'85000000-0000-4000-8000-000000000001',assignmentId:subjectAssignment.id,
    title:'Fractions',description:'Complete exercises 1–5',date:'2026-09-06',dueDate:'2026-09-07'};
  await changeDiary(teacherPrincipal,homework);
  await changeDiary(teacherPrincipal,homework);
  await assert.rejects(changeDiary(teacherPrincipal,{...homework,title:'Different title'}),/Invalid diary retry/);
  assert.equal((await diaryForDate(parentPrincipal,'2026-09-06')).length,1);
  assert.equal((await diaryForDate(parentPrincipal,'2026-09-07')).length,0);
  await changeDiary(parentPrincipal,{action:'complete',diaryId:homework.id,studentId:lessonInput.entries[0].studentId,completed:true});
  assert.equal((await diaryForDate(parentPrincipal,'2026-09-06'))[0].completed,true);
  await assert.rejects(changeDiary(parentPrincipal,{...homework,id:'85000000-0000-4000-8000-000000000002'}),/denied/);
  await admin.query("UPDATE mobile_identity_assignments SET status='suspended' WHERE mobile_identity_id=$1",[identity]);
  assert.equal((await diaryForDate(parentPrincipal,'2026-09-06')).length,0);
  await assert.rejects(changeDiary(parentPrincipal,{action:'complete',diaryId:homework.id,studentId:lessonInput.entries[0].studentId,completed:false}),/denied/);
  for(const table of ['mobile_diary','mobile_diary_completion','mobile_profile_photos']) {
    assert.equal((await runtimePool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,0,'no tenant context must deny reads');
  }
  await assert.rejects(setTeacherAssignment(tenant, teacher, input), /denied/);
  await assert.rejects(setTeacherAssignment(tenant, administrator, { ...input, userId: "10000000-0000-4000-8000-000000000004" }), /membership/);
  await assert.rejects(setTeacherAssignment(tenant, administrator, { ...input, sectionId: "81000000-0000-4000-8000-000000000099" }), /invalid/);
  await setTeacherAssignment(tenant, administrator, { ...input, active: false, reason: "Revoke test assignment" });
  assert.equal((await getTeacherContexts(tenant, teacher)).length, 1);
  await admin.query("UPDATE memberships SET status = 'suspended' WHERE tenant_id = $1 AND user_id = $2", [tenant, teacher]);
  assert.equal((await getTeacherContexts(tenant, teacher)).length, 0, "suspended teacher must have no contexts");
  await setTeacherAssignment(tenant, administrator, { ...subject, active: false, reason: "Revoke suspended teacher" });
  // Runtime role without tenant context cannot see rows, even though grants exist.
  assert.equal((await runtimePool.query("SELECT count(*)::int AS n FROM teacher_assignments")).rows[0].n, 0);
  const events = await admin.query("SELECT count(*)::int AS n FROM audit_events WHERE action = 'academics.teacher_assignment'");
  assert.equal(events.rows[0].n, 5, "denied attempts must not leave assignment audit writes");
  console.log("TEACHER_ASSIGNMENT_DATABASE_TESTS=PASSED (migration, runtime RLS, assignment/revocation, lesson isolation/idempotency, scope, membership, audit)");
} finally {
  if (runtimePool) await runtimePool.end();
  await admin.end();
}
