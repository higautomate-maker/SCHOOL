import assert from "node:assert/strict";
import test from "node:test";
import { lessonAttendanceSchema } from "../server/operations/lesson-attendance-validation.ts";

const input = {
  academicSessionId: "11111111-1111-4111-8111-111111111111",
  classId: "22222222-2222-4222-8222-222222222222",
  sectionId: "33333333-3333-4333-8333-333333333333",
  subjectId: "44444444-4444-4444-8444-444444444444",
  lessonId: "2026-09-06-period-2",
  attendanceDate: "2026-09-06",
  entries: [{ studentId: "55555555-5555-4555-8555-555555555555", status: "present" }],
};

test("accepts a bounded lesson register", () => {
  const parsed = lessonAttendanceSchema.parse(input);
  assert.equal(parsed.entries[0].note, "");
});

test("rejects duplicate students and authority injection", () => {
  assert.equal(lessonAttendanceSchema.safeParse({ ...input, entries: [...input.entries, ...input.entries] }).success, false);
  assert.equal(lessonAttendanceSchema.safeParse({ ...input, isSchoolAdmin: true }).success, false);
});

test("rejects missing lesson scope and invalid status", () => {
  assert.equal(lessonAttendanceSchema.safeParse({ ...input, lessonId: "" }).success, false);
  assert.equal(lessonAttendanceSchema.safeParse({ ...input, entries: [{ ...input.entries[0], status: "holiday" }] }).success, false);
});
