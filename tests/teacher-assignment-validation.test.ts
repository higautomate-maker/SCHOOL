import assert from "node:assert/strict";
import test from "node:test";
import { teacherAssignmentSchema, requireAssignmentAdministrator } from "../server/operations/teacher-assignment-validation.ts";

const id = "1c602856-3fec-486f-b18d-a791f124b206";
const input = { academicSessionId: id, userId: id, classId: id, sectionId: id, kind: "class_teacher", active: true, reason: "Assign class teacher" };

test("class assignment accepts only explicit class scope without a subject", () => {
  assert.equal(teacherAssignmentSchema.safeParse(input).success, true);
  assert.equal(teacherAssignmentSchema.safeParse({ ...input, subjectId: id }).success, false);
});
test("subject assignment requires a subject and auditable reason", () => {
  assert.equal(teacherAssignmentSchema.safeParse({ ...input, kind: "subject_teacher", subjectId: id }).success, true);
  assert.equal(teacherAssignmentSchema.safeParse({ ...input, kind: "subject_teacher" }).success, false);
  assert.equal(teacherAssignmentSchema.safeParse({ ...input, reason: " " }).success, false);
});
test("assignment input rejects authority injection and malformed identifiers", () => {
  for (const extra of [{ tenantId: id }, { isSchoolAdmin: true }, { canManageAttendance: true }]) {
    assert.equal(teacherAssignmentSchema.safeParse({ ...input, ...extra }).success, false);
  }
  for (const field of ["academicSessionId", "userId", "classId", "sectionId"]) {
    assert.equal(teacherAssignmentSchema.safeParse({ ...input, [field]: "invalid" }).success, false);
  }
});
test("teachers, parents, other roles and admins without academics management cannot grant access", () => {
  assert.doesNotThrow(() => requireAssignmentAdministrator({ principalType: "school", roleKey: "school_admin" }, true));
  for (const principal of [
    { principalType: "school", roleKey: "teacher" },
    { principalType: "parent", roleKey: "school_admin" },
    { principalType: "school", roleKey: null },
  ]) assert.throws(() => requireAssignmentAdministrator(principal, true), /denied/);
  assert.throws(() => requireAssignmentAdministrator({ principalType: "school", roleKey: "school_admin" }, false), /denied/);
});
