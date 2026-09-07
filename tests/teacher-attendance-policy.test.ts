import assert from "node:assert/strict";
import test from "node:test";
import { evaluateTeacherAttendance, type TeacherAttendanceGrant } from "../server/operations/teacher-attendance-policy.ts";

const scope = { tenantId: "school-a", academicSessionId: "2026", classId: "grade-8", sectionId: "a" };
const actor = { tenantId: scope.tenantId, userId: "teacher", canManageAttendance: true, isSchoolAdmin: false };
const daily = { ...scope, kind: "daily" as const };
const lesson = { ...scope, kind: "lesson" as const, subjectId: "math", lessonId: "period-1" };
const classGrant: TeacherAttendanceGrant = { ...scope, userId: actor.userId, active: true, kind: "class_teacher" };
const subjectGrant: TeacherAttendanceGrant = { ...scope, userId: actor.userId, active: true, kind: "subject_teacher", subjectId: "math" };

test("daily attendance requires class assignment; subject assignment is insufficient", () => {
  assert.equal(evaluateTeacherAttendance(actor, daily, [classGrant]).allowed, true);
  assert.equal(evaluateTeacherAttendance(actor, daily, [subjectGrant]).allowed, false);
});

test("lesson attendance requires matching subject assignment even for a class teacher", () => {
  assert.equal(evaluateTeacherAttendance(actor, lesson, [subjectGrant]).allowed, true);
  assert.equal(evaluateTeacherAttendance(actor, lesson, [classGrant]).allowed, false);
  assert.equal(evaluateTeacherAttendance(actor, { ...lesson, subjectId: "english" }, [subjectGrant]).allowed, false);
});

test("grants cannot cross school, session, class, section or teacher boundaries", () => {
  for (const field of ["tenantId", "academicSessionId", "classId", "sectionId", "userId"] as const) {
    assert.equal(evaluateTeacherAttendance(actor, daily, [{ ...classGrant, [field]: "other" }]).allowed, false, field);
  }
  assert.equal(evaluateTeacherAttendance(actor, daily, [{ ...classGrant, active: false }]).allowed, false);
});

test("multiple assignments allow only their respective classes", () => {
  const second = { ...classGrant, classId: "grade-7" };
  assert.equal(evaluateTeacherAttendance(actor, { ...daily, classId: "grade-7" }, [classGrant, second]).allowed, true);
  assert.equal(evaluateTeacherAttendance(actor, { ...daily, classId: "grade-6" }, [classGrant, second]).allowed, false);
});

test("admin override requires permission, same tenant and an auditable reason", () => {
  const admin = { ...actor, isSchoolAdmin: true };
  assert.deepEqual(evaluateTeacherAttendance(admin, daily, [], " Covering absent teacher "),
    { allowed: true, basis: "admin_override", auditReason: "Covering absent teacher" });
  for (const reason of [undefined, "", "x", "x".repeat(241)]) {
    assert.equal(evaluateTeacherAttendance(admin, daily, [], reason).allowed, false);
  }
  assert.equal(evaluateTeacherAttendance({ ...admin, canManageAttendance: false }, daily, [], "Cover teacher").allowed, false);
  assert.equal(evaluateTeacherAttendance(admin, { ...daily, tenantId: "other" }, [], "Cover teacher").allowed, false);
  assert.equal(evaluateTeacherAttendance(actor, daily, [], "Claim admin override").allowed, false);
});

test("incomplete class/lesson context fails closed", () => {
  assert.equal(evaluateTeacherAttendance(actor, { ...daily, sectionId: "" }, [classGrant]).allowed, false);
  assert.equal(evaluateTeacherAttendance(actor, { ...lesson, lessonId: "" }, [subjectGrant]).allowed, false);
  assert.equal(evaluateTeacherAttendance(actor, { ...lesson, subjectId: "" }, [subjectGrant]).allowed, false);
});
