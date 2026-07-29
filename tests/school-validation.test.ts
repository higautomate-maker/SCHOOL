import assert from "node:assert/strict";
import test from "node:test";
import { createSchoolSchema } from "../server/schools/validation.ts";

test("accepts a complete school onboarding request", () => {
  const parsed = createSchoolSchema.safeParse({ name: "Greenfield Academy", city: "Mumbai", plan: "Growth", adminEmail: "admin@greenfield.edu" });
  assert.equal(parsed.success, true);
});

test("normalizes the administrator email", () => {
  const parsed = createSchoolSchema.parse({ name: "Greenfield Academy", city: "Mumbai", plan: "Starter", adminEmail: " Admin@Greenfield.EDU " });
  assert.equal(parsed.adminEmail, "admin@greenfield.edu");
});

test("rejects unsupported plans and malformed emails", () => {
  assert.equal(createSchoolSchema.safeParse({ name: "Greenfield Academy", city: "Mumbai", plan: "Unlimited", adminEmail: "not-an-email" }).success, false);
});
