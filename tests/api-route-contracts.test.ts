import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

type SecurityOperation = {
  id: string;
  file: string;
  method: string;
  scope: "platform" | "tenant";
  permission: string;
  module: string | null;
  tenantRequired: boolean;
  entitlementRequired: boolean;
  resourceScope: string;
  idempotency: "implemented" | "planned" | "not_applicable";
  stepUpMfa?: boolean;
};

const manifest = JSON.parse(
  readFileSync("tests/contracts/api-security.contract.json", "utf8"),
) as {
  authorizationOrder: string[];
  operations: SecurityOperation[];
};

const productionRouteFiles = [
  "app/api/v1/schools/route.ts",
  "app/api/v1/schools/[schoolId]/route.ts",
  "app/api/v1/schools/[schoolId]/configuration/route.ts",
  "app/api/v1/schools/[schoolId]/foundation/route.ts",
  "app/api/v1/schools/[schoolId]/operations/route.ts",
  "app/api/v1/schools/[schoolId]/roles/route.ts",
  "app/api/v1/schools/[schoolId]/students/route.ts",
  "app/api/v1/schools/[schoolId]/workspace/route.ts",
];

test("security manifest covers every current production API method", () => {
  const exported = new Set<string>();
  for (const file of productionRouteFiles) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/export async function (GET|POST|PATCH|DELETE)\b/g)) {
      exported.add(`${file}#${match[1]}`);
    }
  }

  const contracted = new Set(
    manifest.operations.map((operation) => `${operation.file}#${operation.method}`),
  );
  assert.deepEqual([...contracted].sort(), [...exported].sort());
  assert.equal(contracted.size, manifest.operations.length, "contract operations must be unique");
});

test("every current protected route retains the authentication boundary", () => {
  for (const file of productionRouteFiles) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /authorize\(/, `${file} does not use the central authorization resolver`);
    assert.match(source, /authErrorResponse/, `${file} does not preserve 401\/403 authorization responses`);
  }
});

test("tenant contracts require both entitlement and role/resource authorization", () => {
  const tenantOperations = manifest.operations.filter((operation) => operation.scope === "tenant");
  assert.ok(tenantOperations.length > 0);
  for (const operation of tenantOperations) {
    assert.equal(operation.tenantRequired, true, operation.id);
    assert.equal(operation.entitlementRequired, true, operation.id);
    assert.ok(operation.module, `${operation.id} has no module resolution contract`);
    assert.ok(operation.permission, `${operation.id} has no permission contract`);
    assert.match(operation.resourceScope, /^tenant/, operation.id);
  }
});

test("platform contracts stay separate from tenant wildcard authorization", () => {
  for (const operation of manifest.operations.filter((item) => item.scope === "platform")) {
    assert.equal(operation.tenantRequired, false, operation.id);
    assert.equal(operation.entitlementRequired, false, operation.id);
    assert.match(operation.permission, /^platform\./, operation.id);
  }
});

test("authorization order preserves the approved two-layer model", () => {
  assert.deepEqual(manifest.authorizationOrder, [
    "authenticated_identity",
    "client_identity_type",
    "tenant_membership",
    "company_module_entitlement",
    "school_role_permission",
    "resource_assignment",
  ]);
});

test("every mutation has an explicit idempotency decision", () => {
  const mutations = manifest.operations.filter((operation) =>
    ["POST", "PATCH", "PUT", "DELETE"].includes(operation.method),
  );
  for (const operation of mutations) {
    assert.notEqual(operation.idempotency, "not_applicable", operation.id);
  }
});

test("all contracted operations are attached to the central policy catalogue",()=>{const catalogue=readFileSync("server/auth/policies.ts","utf8");for(const operation of manifest.operations){assert.match(catalogue,new RegExp(operation.permission.startsWith("resolved_")?"operations|workspace|permission":operation.permission.replaceAll(".","\\.")),operation.id);}});
