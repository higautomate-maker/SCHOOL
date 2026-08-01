import assert from "node:assert/strict";
import { validateStagingEnvironment } from "../server/runtime/staging-environment.ts";

const staging = validateStagingEnvironment(process.env);
const authEmail = process.env.HIG_STAGING_SMOKE_AUTH_EMAIL?.trim().toLowerCase();
if (!authEmail || !authEmail.endsWith("@higschool.test")) {
  throw new Error(
    "HIG_STAGING_SMOKE_AUTH_EMAIL is required and must be a synthetic staging identity",
  );
}
const baseUrl = staging.appUrl.toString().replace(/\/$/, "");
const authenticatedHeaders = {
  "oai-authenticated-user-email": authEmail,
  "oai-authenticated-user-full-name": encodeURIComponent("Stage 6 Platform"),
  "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
};

await expectStatus("/api/v1/health", 200);
await expectStatus("/api/v1/readiness", 200);
await expectStatus("/api/v1/schools", 401);

const schoolsResponse = await requestJson<{
  schools: Array<{ tenantId: string; name: string }>;
}>("/api/v1/schools?limit=20", { headers: authenticatedHeaders });
assert.ok(schoolsResponse.schools.length >= 2, "At least two staging schools are required");
const school = schoolsResponse.schools.find(
  (record) => record.name === "HIG Greenfield Acceptance School",
);
assert.ok(school, "Greenfield staging school was not found");

const schoolPath = `/api/v1/schools/${encodeURIComponent(school.tenantId)}`;
await requestJson(`${schoolPath}`);
await requestJson(`${schoolPath}/configuration`);
await requestJson(`${schoolPath}/foundation`);
const roles = await requestJson<{ roles: Array<{ key: string }> }>(
  `${schoolPath}/roles`,
);
assert.ok(roles.roles.some((role) => role.key === "school_admin"));
const students = await requestJson<{ students: Array<{ id: string }> }>(
  `${schoolPath}/students`,
);
assert.ok(students.students.length > 0);
const operations = await requestJson<{
  operations: {
    attendance: unknown[];
    invoices: unknown[];
    payments: unknown[];
  };
}>(`${schoolPath}/operations`);
assert.ok(operations.operations.attendance.length > 0);
assert.ok(operations.operations.invoices.length > 0);
assert.ok(operations.operations.payments.length > 0);
const workspace = await requestJson<{ workspace: { records: unknown[] } }>(
  `${schoolPath}/workspace?moduleKey=Communicate`,
);
assert.ok(workspace.workspace.records.length > 0);

const replayKey = `stage6-staging-smoke-module-replay-${crypto.randomUUID()}`;
const replayRequest = {
  method: "PATCH",
  headers: {
    ...authenticatedHeaders,
    "content-type": "application/json",
    "idempotency-key": replayKey,
  },
  body: JSON.stringify({
    action: "set_module",
    moduleKey: "communication",
    enabled: true,
  }),
};
const firstReplay = await requestJson<{ school: unknown }>(schoolPath, replayRequest);
const secondReplay = await requestJson<{ school: unknown }>(schoolPath, replayRequest);
assert.deepEqual(secondReplay, firstReplay);

console.log(
  "Staging health, readiness, trusted-platform boundary, school APIs, business records, and idempotency smoke checks passed.",
);

async function expectStatus(path: string, expected: number): Promise<void> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: path === "/api/v1/schools" ? {} : undefined,
    redirect: "manual",
  });
  if (response.status !== expected) {
    throw new Error(`${path} returned HTTP ${response.status}; expected ${expected}`);
  }
}

async function requestJson<Result>(
  path: string,
  init: RequestInit = {},
): Promise<Result> {
  const headers = new Headers(authenticatedHeaders);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    redirect: "manual",
  });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return await response.json() as Result;
}
