import assert from "node:assert/strict";
import test from "node:test";
import { createStudentSchema, updateStudentSchema } from "../server/students/validation.ts";

const validStudent = {
  admissionNumber: "HIG-24019", rollNumber: "19", firstName: "Diya", lastName: "Verma",
  gender: "female", dateOfBirth: "2014-06-18", admissionDate: "2026-07-22",
  className: "Grade 7", sectionName: "A", guardianName: "Ritu Verma", guardianPhone: "98765 43210",
};

test("accepts a complete student admission", () => {
  assert.equal(createStudentSchema.safeParse(validStudent).success, true);
});

test("rejects malformed dates and guardian phone numbers", () => {
  assert.equal(createStudentSchema.safeParse({ ...validStudent, dateOfBirth: "18/06/2014" }).success, false);
  assert.equal(createStudentSchema.safeParse({ ...validStudent, guardianPhone: "call-me" }).success, false);
});

test("student updates permit contact and class changes but not admission identity changes", () => {
  const updated = updateStudentSchema.parse({ ...validStudent, className: "Grade 8", status: "active" });
  assert.equal(updated.className, "Grade 8");
  assert.equal("admissionNumber" in updated, false);
  assert.equal("admissionDate" in updated, false);
  assert.equal(updateStudentSchema.safeParse({ ...validStudent, status: "deleted" }).success, false);
  assert.equal(updateStudentSchema.safeParse({ ...validStudent, guardianPhone: "bad", status: "active" }).success, false);
});
