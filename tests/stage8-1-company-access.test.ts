import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  appFeatureCatalogue,
  schoolModuleCatalogue,
} from "../server/access/catalogue.ts";
import { buildConfiguration } from "../server/access/company-policy-repository.ts";
import { companyAccessActionSchema } from "../server/access/company-policy-validation.ts";

const tenantId = "11111111-1111-4111-8111-111111111111";

test("Company module response always contains the full canonical catalogue and fails closed", () => {
  const access = buildConfiguration({
    tenantId,
    schoolName: "Access Test School",
    plan: "Growth",
    moduleRows: [{ moduleKey: "student_information", enabled: true, source: "plan" }],
    planAppRows: [],
    tenantAppRows: [],
  });

  assert.equal(access.modules.length, schoolModuleCatalogue.length);
  assert.equal(access.modules.find((moduleDefinition) => moduleDefinition.key === "student_information")?.enabled, true);
  assert.equal(access.modules.find((moduleDefinition) => moduleDefinition.key === "transport")?.enabled, false);
  assert.equal(access.modules.find((moduleDefinition) => moduleDefinition.key === "transport")?.source, "missing");
});

test("tenant app override wins and a disabled module blocks the effective feature", () => {
  const access = buildConfiguration({
    tenantId,
    schoolName: "Access Test School",
    plan: "Enterprise",
    moduleRows: [{ moduleKey: "communication", enabled: true, source: "override" }],
    planAppRows: [
      { audience: "parent", featureKey: "notices", enabled: true },
      { audience: "parent", featureKey: "transport_tracking", enabled: true },
    ],
    tenantAppRows: [
      { audience: "parent", featureKey: "notices", enabled: false },
    ],
  });

  const notices = access.appFeatures.parent.find((feature) => feature.key === "notices");
  assert.equal(notices?.source, "tenant");
  assert.equal(notices?.policyEnabled, false);
  assert.equal(notices?.effectiveEnabled, false);

  const tracking = access.appFeatures.parent.find((feature) => feature.key === "transport_tracking");
  assert.equal(tracking?.source, "plan");
  assert.equal(tracking?.policyEnabled, true);
  assert.equal(tracking?.dependencySatisfied, false);
  assert.equal(tracking?.effectiveEnabled, false);
  assert.match(tracking?.blockedReason ?? "", /Transport is disabled/);
});

test("app response is complete and ordered for every persona", () => {
  const access = buildConfiguration({
    tenantId,
    schoolName: "Access Test School",
    plan: "Starter",
    moduleRows: schoolModuleCatalogue.map((moduleDefinition) => ({
      moduleKey: moduleDefinition.key,
      enabled: true,
      source: "override",
    })),
    planAppRows: [],
    tenantAppRows: [],
  });

  for (const audience of ["parent", "student", "transporter"] as const) {
    const expected = appFeatureCatalogue.filter((feature) => feature.persona === audience);
    assert.equal(access.appFeatures[audience].length, expected.length);
    assert.deepEqual(
      access.appFeatures[audience].map((feature) => feature.displayOrder),
      [...access.appFeatures[audience].map((feature) => feature.displayOrder)].sort((left, right) => left - right),
    );
  }
});

test("Company access validation accepts canonical actions and rejects persona mismatch", () => {
  assert.equal(companyAccessActionSchema.safeParse({
    action: "set_module",
    moduleKey: "asset_management",
    enabled: true,
  }).success, true);
  assert.equal(companyAccessActionSchema.safeParse({
    action: "set_app_feature",
    audience: "transporter",
    featureKey: "gps_tracking",
    enabled: true,
  }).success, true);
  assert.equal(companyAccessActionSchema.safeParse({
    action: "set_app_feature",
    audience: "student",
    featureKey: "gps_tracking",
    enabled: true,
  }).success, false);
});

test("Company access API is platform-authorized, validated and idempotent", () => {
  const route = readFileSync("app/api/v1/schools/[schoolId]/access/route.ts", "utf8");
  assert.match(route, /policies\.companyAccessView/);
  assert.match(route, /policies\.companyAccessManage/);
  assert.match(route, /validIdempotencyKey/);
  assert.match(route, /companyAccessActionSchema/);
  assert.match(route, /applyCompanyAccessAction/);
});

test("PostgreSQL policy writes use transaction-local platform and tenant context", () => {
  const runtime = readFileSync("server/runtime/postgres.ts", "utf8");
  const repository = readFileSync("server/access/company-policy-postgres-repository.ts", "utf8");
  assert.match(runtime, /withPlatformPolicyManagementDatabase/);
  assert.match(runtime, /set_config\('app\.tenant_id'/);
  assert.match(runtime, /set_config\('app\.platform_policy_management'/);
  assert.match(repository, /ON CONFLICT \(tenant_id, module_key\) DO UPDATE/);
  assert.match(repository, /ON CONFLICT \(tenant_id, audience, feature_key\) DO UPDATE/);
  assert.match(repository, /app_feature\.policy_change/);
  assert.match(repository, /Company access administration/);
});

test("legacy SQLite migration creates plan and tenant app policy storage", () => {
  const migration = readFileSync("drizzle/0009_access_policy_foundation.sql", "utf8");
  assert.match(migration, /CREATE TABLE `plan_module_policies`/);
  assert.match(migration, /CREATE TABLE `plan_app_feature_policies`/);
  assert.match(migration, /CREATE TABLE `tenant_app_feature_policies`/);
  assert.match(migration, /PRIMARY KEY\(`tenant_id`, `audience`, `feature_key`\)/);
});

test("Company UI uses live school policies and keeps School roles in the School workspace", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  assert.match(page, /School Web Modules/);
  assert.match(page, /Parent App/);
  assert.match(page, /Student App/);
  assert.match(page, /Transporter App/);
  assert.match(page, /\/access`/);
  assert.match(page, /School role boundary/);
  assert.doesNotMatch(page, /New custom role/);
  assert.doesNotMatch(page, /Sign in through the school workspace to manage tenant roles/);
});

test("all canonical Company modules are accepted by school management validation", () => {
  const validation = readFileSync("server/schools/management-validation.ts", "utf8");
  assert.match(validation, /schoolModuleKeys/);
  assert.doesNotMatch(validation, /z\.enum\(\["student_information"/);
});
