import assert from "node:assert/strict";
import test from "node:test";
import { enforceTenant, requirePermission, requireTenant, TenantAccessError } from "../server/tenancy.ts";

const context = { tenantId: "school-a", userId: "user-1", permissions: new Set(["students.view"]) };

test("accepts the authenticated tenant", () => assert.equal(requireTenant(context).tenantId, "school-a"));
test("rejects a forged tenant id", () => assert.throws(() => enforceTenant(context, "school-b"), TenantAccessError));
test("rejects missing tenant context", () => assert.throws(() => requireTenant(null), TenantAccessError));
test("allows granted permissions", () => assert.doesNotThrow(() => requirePermission(context, "students.view")));
test("denies ungranted permissions", () => assert.throws(() => requirePermission(context, "fees.export"), TenantAccessError));
