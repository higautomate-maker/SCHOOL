import assert from "node:assert/strict";
import test from "node:test";
import { schoolActionSchema } from "../server/schools/management-validation.ts";

test("accepts plan and module policy changes", () => {
  assert.equal(schoolActionSchema.safeParse({ action: "update_plan", plan: "Enterprise" }).success, true);
  assert.equal(schoolActionSchema.safeParse({ action: "set_module", moduleKey: "attendance", enabled: false }).success, true);
});

test("accepts invitation lifecycle actions", () => {
  assert.equal(schoolActionSchema.safeParse({ action: "resend_invitation" }).success, true);
  assert.equal(schoolActionSchema.safeParse({ action: "revoke_invitation" }).success, true);
});

test("rejects unknown modules and actions", () => {
  assert.equal(schoolActionSchema.safeParse({ action: "set_module", moduleKey: "super_admin", enabled: true }).success, false);
  assert.equal(schoolActionSchema.safeParse({ action: "delete_tenant" }).success, false);
});
