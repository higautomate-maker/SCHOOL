import assert from "node:assert/strict";
import test from "node:test";
import {
  referenceAuthorizationDecision,
  type ReferenceActor,
} from "./helpers/reference-authorization.ts";

const attendanceEntitlement = new Set(["attendance"]);
const teacher: ReferenceActor = {
  identityType: "teacher",
  tenantId: "school-a",
  platformPermissions: new Set(),
  rolePermissions: new Set(["attendance.manage"]),
  assignments: new Set(["class-8-a"]),
};

test("authorization contract rejects unauthenticated access first", () => {
  assert.deepEqual(
    referenceAuthorizationDecision(null, {
      scope: "tenant",
      tenantId: "school-a",
      module: "attendance",
      permission: "attendance.manage",
      resourceAssignment: "class-8-a",
    }, attendanceEntitlement),
    { allowed: false, reason: "unauthenticated" },
  );
});

test("Company platform access requires a platform permission", () => {
  const company: ReferenceActor = {
    identityType: "company",
    tenantId: null,
    platformPermissions: new Set(["platform.schools.view"]),
    rolePermissions: new Set(),
    assignments: new Set(),
  };
  assert.deepEqual(referenceAuthorizationDecision(company, {
    scope: "platform",
    tenantId: null,
    module: null,
    permission: "platform.schools.view",
    resourceAssignment: null,
  }, new Set()), { allowed: true });
  assert.deepEqual(referenceAuthorizationDecision(company, {
    scope: "platform",
    tenantId: null,
    module: null,
    permission: "platform.schools.manage",
    resourceAssignment: null,
  }, new Set()), { allowed: false, reason: "permission_denied" });
});

test("School and mobile identities cannot enter Company scope", () => {
  assert.deepEqual(referenceAuthorizationDecision(teacher, {
    scope: "platform",
    tenantId: null,
    module: null,
    permission: "platform.schools.view",
    resourceAssignment: null,
  }, new Set()), { allowed: false, reason: "wrong_client_scope" });
});

test("tenant mismatch is rejected before module and role checks", () => {
  assert.deepEqual(referenceAuthorizationDecision(teacher, {
    scope: "tenant",
    tenantId: "school-b",
    module: "attendance",
    permission: "attendance.manage",
    resourceAssignment: "class-8-a",
  }, attendanceEntitlement), { allowed: false, reason: "tenant_mismatch" });
});

test("Company entitlement limits what a School role can grant", () => {
  assert.deepEqual(referenceAuthorizationDecision(teacher, {
    scope: "tenant",
    tenantId: "school-a",
    module: "fees",
    permission: "attendance.manage",
    resourceAssignment: "class-8-a",
  }, attendanceEntitlement), { allowed: false, reason: "module_not_entitled" });
});

test("School role permission is required inside an entitled module", () => {
  assert.deepEqual(referenceAuthorizationDecision(teacher, {
    scope: "tenant",
    tenantId: "school-a",
    module: "attendance",
    permission: "fees.view",
    resourceAssignment: "class-8-a",
  }, attendanceEntitlement), { allowed: false, reason: "permission_denied" });
});

test("Teacher access is narrowed to assigned classes", () => {
  assert.deepEqual(referenceAuthorizationDecision(teacher, {
    scope: "tenant",
    tenantId: "school-a",
    module: "attendance",
    permission: "attendance.manage",
    resourceAssignment: "class-9-b",
  }, attendanceEntitlement), { allowed: false, reason: "resource_not_assigned" });
  assert.deepEqual(referenceAuthorizationDecision(teacher, {
    scope: "tenant",
    tenantId: "school-a",
    module: "attendance",
    permission: "attendance.manage",
    resourceAssignment: "class-8-a",
  }, attendanceEntitlement), { allowed: true });
});

test("Parent and Transporter resource assignments use the same final boundary", () => {
  const parent: ReferenceActor = {
    ...teacher,
    identityType: "parent",
    rolePermissions: new Set(["students.view"]),
    assignments: new Set(["student-aarav"]),
  };
  const transporter: ReferenceActor = {
    ...teacher,
    identityType: "transporter",
    rolePermissions: new Set(["transport.update"]),
    assignments: new Set(["route-a"]),
  };

  assert.deepEqual(referenceAuthorizationDecision(parent, {
    scope: "tenant",
    tenantId: "school-a",
    module: "student_information",
    permission: "students.view",
    resourceAssignment: "student-other",
  }, new Set(["student_information"])), { allowed: false, reason: "resource_not_assigned" });

  assert.deepEqual(referenceAuthorizationDecision(transporter, {
    scope: "tenant",
    tenantId: "school-a",
    module: "transport",
    permission: "transport.update",
    resourceAssignment: "route-a",
  }, new Set(["transport"])), { allowed: true });
});
