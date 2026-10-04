import assert from "node:assert/strict";
import test from "node:test";
import { mobileContentActionSchema } from "../server/mobile-app/validation.ts";

const studentId = "c1000000-0000-4000-8000-000000000001";
const leave = {
  action: "parent_request",
  requestType: "leave_request",
  studentId,
  title: "Leave request",
  description: "Family appointment",
};

test("dated parent leave requires an ordered, bounded range", () => {
  assert.equal(mobileContentActionSchema.safeParse({
    ...leave, startDate: "2026-10-05", endDate: "2026-10-07",
  }).success, true);
  for (const dates of [
    { startDate: "2026-10-07", endDate: "2026-10-05" },
    { startDate: "2026-10-05", endDate: "2027-01-05" },
    { startDate: "2026-10-05" },
    { endDate: "2026-10-05" },
  ]) {
    assert.equal(mobileContentActionSchema.safeParse({ ...leave, ...dates }).success, false);
  }
});

test("already-published parent clients remain able to send undated requests", () => {
  assert.equal(mobileContentActionSchema.safeParse(leave).success, true);
  assert.equal(mobileContentActionSchema.safeParse({
    ...leave, requestType: "contact_school", title: "Question",
  }).success, true);
});
