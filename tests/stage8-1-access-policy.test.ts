import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  appAudiences,
  appFeatureCatalogue,
  canonicalModuleKey,
  defaultEnabledSchoolModuleKeys,
  permissionCatalogue,
  resolveEffectiveAppFeatureAccess,
  resolveEffectiveSchoolModuleAccess,
  schoolModuleCatalogue,
} from "../server/access/catalogue.ts";

const migration = readFileSync(
  new URL("../drizzle-postgres/0007_access_policy_foundation.sql", import.meta.url),
  "utf8",
);

const postgresSchoolRepository = readFileSync(
  new URL("../server/schools/postgres-repository.ts", import.meta.url),
  "utf8",
);

const legacySchoolRepository = readFileSync(
  new URL("../server/schools/repository.ts", import.meta.url),
  "utf8",
);

const legacyAccessRepository = readFileSync(
  new URL("../server/access/repository.ts", import.meta.url),
  "utf8",
);

test("canonical School module keys are stable, unique and ordered", () => {
  const keys = schoolModuleCatalogue.map((module) => module.key);
  assert.equal(keys.length, 27);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(
    [...schoolModuleCatalogue].sort((left, right) => left.displayOrder - right.displayOrder),
    schoolModuleCatalogue,
  );
  assert.deepEqual([...defaultEnabledSchoolModuleKeys].sort(), [
    "academics",
    "access_control",
    "attendance",
    "communication",
    "examinations",
    "fees_finance",
    "settings_billing",
    "student_information",
  ]);
});

test("app feature keys are unique within each persona and ordered", () => {
  for (const audience of appAudiences) {
    const features = appFeatureCatalogue.filter((feature) => feature.persona === audience);
    const keys = features.map((feature) => feature.key);
    assert.ok(features.length > 0);
    assert.equal(new Set(keys).size, keys.length);
    assert.deepEqual(
      [...features].sort((left, right) => left.displayOrder - right.displayOrder),
      features,
    );
  }
});

test("legacy labels resolve to canonical entitlement keys", () => {
  assert.equal(canonicalModuleKey("student_information"), "student_information");
  assert.equal(canonicalModuleKey("Finance & Fees"), "fees_finance");
  assert.equal(canonicalModuleKey("QR Code Attendance"), "attendance");
  assert.equal(canonicalModuleKey("Offline Examinations"), "examinations");
  assert.equal(canonicalModuleKey("Online Examinations"), "examinations");
  assert.equal(canonicalModuleKey("Communicate"), "communication");
  assert.equal(canonicalModuleKey("Comms Wallet"), "communication");
  assert.equal(canonicalModuleKey("unknown module"), null);
});

test("School module access fails closed and needs Company entitlement plus role permission", () => {
  const missing = resolveEffectiveSchoolModuleAccess({
    policies: [],
    rolePermissions: new Set(["students.view"]),
  }).find((result) => result.module.key === "student_information");
  assert.equal(missing?.enabledByCompany, false);
  assert.equal(missing?.accessible, false);

  const companyOnly = resolveEffectiveSchoolModuleAccess({
    policies: [{ moduleKey: "student_information", enabled: true }],
    rolePermissions: new Set(),
  }).find((result) => result.module.key === "student_information");
  assert.equal(companyOnly?.enabledByCompany, true);
  assert.equal(companyOnly?.permittedByRole, false);
  assert.equal(companyOnly?.accessible, false);

  const effective = resolveEffectiveSchoolModuleAccess({
    policies: [{ moduleKey: "Student Information", enabled: true }],
    rolePermissions: new Set(["students.view"]),
  }).find((result) => result.module.key === "student_information");
  assert.equal(effective?.accessible, true);
});

test("tenant app policy overrides plan policy and missing policies are disabled", () => {
  const enabledModules = new Set(["attendance"]);
  const planOnly = resolveEffectiveAppFeatureAccess({
    audience: "parent",
    planPolicies: [{ audience: "parent", featureKey: "attendance", enabled: true }],
    tenantPolicies: [],
    enabledSchoolModules: enabledModules,
  }).find((result) => result.feature.key === "attendance");
  assert.equal(planOnly?.source, "plan");
  assert.equal(planOnly?.accessible, true);

  const overridden = resolveEffectiveAppFeatureAccess({
    audience: "parent",
    planPolicies: [{ audience: "parent", featureKey: "attendance", enabled: true }],
    tenantPolicies: [{ audience: "parent", featureKey: "attendance", enabled: false }],
    enabledSchoolModules: enabledModules,
  }).find((result) => result.feature.key === "attendance");
  assert.equal(overridden?.source, "tenant");
  assert.equal(overridden?.enabledByPolicy, false);
  assert.equal(overridden?.accessible, false);

  const missing = resolveEffectiveAppFeatureAccess({
    audience: "parent",
    planPolicies: [],
    tenantPolicies: [],
    enabledSchoolModules: enabledModules,
  }).find((result) => result.feature.key === "attendance");
  assert.equal(missing?.source, "missing");
  assert.equal(missing?.accessible, false);
});

test("disabled School module blocks a dependent app feature", () => {
  const result = resolveEffectiveAppFeatureAccess({
    audience: "parent",
    planPolicies: [{ audience: "parent", featureKey: "transport_tracking", enabled: true }],
    tenantPolicies: [],
    enabledSchoolModules: new Set(),
  }).find((entry) => entry.feature.key === "transport_tracking");
  assert.equal(result?.enabledByPolicy, true);
  assert.equal(result?.dependencySatisfied, false);
  assert.equal(result?.accessible, false);
});

test("permission catalogue remains unique and contains new module permissions", () => {
  const permissions = permissionCatalogue.map(([permission]) => permission);
  assert.equal(new Set(permissions).size, permissions.length);
  assert.ok(permissions.includes("transport.view"));
  assert.ok(permissions.includes("communication.manage"));
  assert.ok(permissions.includes("reports.manage"));
});

test("migration creates forced-RLS policy tables with no ordinary tenant writes", () => {
  for (const table of [
    "plan_module_policies",
    "plan_app_feature_policies",
    "tenant_app_feature_policies",
  ]) {
    assert.match(migration, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`));
    assert.match(migration, new RegExp(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`));
  }
  assert.match(migration, /app_platform_policy_management_enabled\(\)/);
  assert.match(migration, /app_access_policy_service_enabled\(\)/);
  assert.match(migration, /tenant_app_feature_policies_service_read/);
  assert.match(migration, /"tenant_id" = app_current_tenant_id\(\)/);
  assert.doesNotMatch(migration, /tenant_app_feature_policies_tenant_(?:insert|update|delete)/);
  assert.match(migration, /REVOKE ALL ON "plan_module_policies", "plan_app_feature_policies", "tenant_app_feature_policies" FROM PUBLIC;/);
});

test("School Admin permissions are backfilled while custom roles are untouched", () => {
  assert.match(migration, /role\."system" = true/);
  assert.match(migration, /role\."key" = 'school_admin'/);
  assert.match(migration, /ON CONFLICT \("tenant_id", "role_id", "permission"\) DO NOTHING/);
  assert.doesNotMatch(migration, /WHERE role\."system" = false/);
  assert.match(legacyAccessRepository, /ON CONFLICT\(role_id, permission\) DO NOTHING/);
});

test("new PostgreSQL and legacy schools create every module policy with only eight defaults enabled", () => {
  for (const source of [postgresSchoolRepository, legacySchoolRepository]) {
    assert.match(source, /schoolModuleCatalogue/);
    assert.match(source, /defaultEnabledSchoolModuleKeys\.has\(moduleDefinition\.key\)/);
    assert.doesNotMatch(source, /const moduleKeys = \[/);
    assert.doesNotMatch(source, /tenant_app_feature_policies[\s\S]*INSERT/i);
  }
});
