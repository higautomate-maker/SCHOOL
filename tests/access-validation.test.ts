import assert from "node:assert/strict";
import test from "node:test";
import { roleActionSchema } from "../server/access/validation.ts";

test("accepts custom roles with known permissions", () => {
  assert.equal(roleActionSchema.safeParse({ action: "create", name: "Admission Officer", permissions: ["students.view", "students.manage"] }).success, true);
});

test("accepts complete permission replacement for a role", () => {
  assert.equal(roleActionSchema.safeParse({ action: "update_permissions", roleId: "9fb38af1-f57f-4515-8317-890cb24cc905", permissions: ["attendance.view"] }).success, true);
});

test("rejects unknown permissions and malformed role ids", () => {
  assert.equal(roleActionSchema.safeParse({ action: "create", name: "Unsafe", permissions: ["platform.impersonate"] }).success, false);
  assert.equal(roleActionSchema.safeParse({ action: "update_permissions", roleId: "not-a-uuid", permissions: [] }).success, false);
});
