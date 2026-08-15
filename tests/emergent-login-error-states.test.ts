// Emergent UX redesign — focused tests for redesigned login error states and
// fail-closed role/module access. Dependency-free so it runs in the standard
// `npm run test:unit` runner (node --experimental-strip-types --test).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LOGIN_MESSAGES,
  messageForStatus,
  networkMessage,
  validateLoginFields,
} from "../app/login/error-messages.ts";
import {
  resolveEffectiveSchoolModuleAccess,
  resolveEffectiveAppFeatureAccess,
} from "../server/access/catalogue.ts";

test("wrong credentials show the exact required copy and never leak internals", () => {
  assert.equal(
    messageForStatus(401),
    "Incorrect email or password. Please check your details and try again.",
  );
  // 400/404/422 must not reveal whether the email exists — same generic copy.
  for (const status of [400, 404, 422]) {
    assert.equal(messageForStatus(status), LOGIN_MESSAGES.invalidCredentials);
  }
});

test("rate limit, outage and rejected requests map to safe distinct messages", () => {
  assert.equal(messageForStatus(429), LOGIN_MESSAGES.rateLimited);
  assert.equal(messageForStatus(503), LOGIN_MESSAGES.unavailable);
  assert.equal(messageForStatus(500), LOGIN_MESSAGES.unavailable);
  assert.equal(messageForStatus(403), LOGIN_MESSAGES.rejected);
});

test("network failures surface a friendly retry message", () => {
  assert.equal(networkMessage(), LOGIN_MESSAGES.network);
  assert.match(networkMessage(), /connect|connection|try again/i);
});

test("no login message exposes technical terms", () => {
  const banned = /(stack|trace|timeout|exception|sql|database|undefined|null|500|token|fetch)/i;
  for (const value of Object.values(LOGIN_MESSAGES)) {
    assert.ok(!banned.test(value), `unsafe login copy: ${value}`);
  }
});

test("required fields are validated before any request is sent", () => {
  assert.deepEqual(validateLoginFields("", ""), {
    email: LOGIN_MESSAGES.emailRequired,
    password: LOGIN_MESSAGES.passwordRequired,
  });
  assert.deepEqual(validateLoginFields("not-an-email", "secret"), {
    email: LOGIN_MESSAGES.emailInvalid,
  });
  assert.deepEqual(validateLoginFields("teacher@school.edu", "secret"), {});
});

test("school module access is fail-closed: needs company enable AND role permission", () => {
  const resolved = resolveEffectiveSchoolModuleAccess({
    policies: [
      { moduleKey: "student_information", enabled: true },
      { moduleKey: "fees_finance", enabled: false },
    ],
    rolePermissions: new Set(["students.view", "fees.view"]),
  });
  const students = resolved.find((m) => m.module.key === "student_information");
  const fees = resolved.find((m) => m.module.key === "fees_finance");
  // Enabled by company + permitted by role => accessible.
  assert.equal(students?.accessible, true);
  // Company disabled it => inaccessible even though the role could view it.
  assert.equal(fees?.accessible, false);
  assert.equal(fees?.permittedByRole, true);
});

test("a role without the view permission cannot reach an enabled module", () => {
  const resolved = resolveEffectiveSchoolModuleAccess({
    policies: [{ moduleKey: "transport", enabled: true }],
    rolePermissions: new Set(), // no permissions at all
  });
  const transport = resolved.find((m) => m.module.key === "transport");
  assert.equal(transport?.enabledByCompany, true);
  assert.equal(transport?.permittedByRole, false);
  assert.equal(transport?.accessible, false);
});

test("app features are fail-closed on their required school module dependency", () => {
  const resolved = resolveEffectiveAppFeatureAccess({
    audience: "transporter",
    planPolicies: [{ audience: "transporter", featureKey: "gps_tracking", enabled: true }],
    tenantPolicies: [],
    enabledSchoolModules: new Set(), // transport module NOT enabled
  });
  const gps = resolved.find((f) => f.feature.key === "gps_tracking");
  assert.equal(gps?.enabledByPolicy, true);
  assert.equal(gps?.dependencySatisfied, false);
  assert.equal(gps?.accessible, false);
});

test("app feature becomes accessible only when policy AND dependency are satisfied", () => {
  const resolved = resolveEffectiveAppFeatureAccess({
    audience: "parent",
    planPolicies: [{ audience: "parent", featureKey: "transport_tracking", enabled: true }],
    tenantPolicies: [],
    enabledSchoolModules: new Set(["transport"]),
  });
  const tracking = resolved.find((f) => f.feature.key === "transport_tracking");
  assert.equal(tracking?.accessible, true);
});
