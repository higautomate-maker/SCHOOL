import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { validateStagingEnvironment } from "../server/runtime/staging-environment.ts";

const staging = validateStagingEnvironment(process.env);
const platformCredential = credential("PLATFORM");
const schoolCredential = credential("SCHOOL");

const baseUrl = staging.appUrl.toString().replace(/\/$/, "");
const origin = new URL(baseUrl).origin;
let session = await login(platformCredential);

await expectStatus("/api/v1/health", 200, false);
await expectStatus("/api/v1/readiness", 200, false);
await expectStatus("/api/v1/schools", 401, false);

const schoolsResponse = await requestJson<{
  schools: Array<{ tenantId: string; name: string }>;
}>("/api/v1/schools?limit=20");
assert.ok(schoolsResponse.schools.length >= 2, "At least two staging schools are required");
const school = schoolsResponse.schools.find(
  (record) => record.name === "HIG Greenfield Acceptance School",
);
assert.ok(school, "Greenfield staging school was not found");

const schoolPath = `/api/v1/schools/${encodeURIComponent(school.tenantId)}`;
await requestJson(schoolPath);
const replayKey = `stage7-staging-smoke-module-replay-${crypto.randomUUID()}`;
const replayRequest = {
  method: "PATCH",
  headers: { "content-type": "application/json", "idempotency-key": replayKey },
  body: JSON.stringify({ action: "set_module", moduleKey: "communication", enabled: true }),
};
const firstReplay = await requestJson<{ school: unknown }>(schoolPath, replayRequest);
const secondReplay = await requestJson<{ school: unknown }>(schoolPath, replayRequest);
assert.deepEqual(secondReplay, firstReplay);

session = await login(schoolCredential);
const resolved = await requestJson<{ activeTenantId: string | null; user: { identityType: string } }>(
  "/api/v1/auth/session",
);
assert.equal(resolved.user.identityType, "school");
assert.equal(resolved.activeTenantId, school.tenantId);
await requestJson(`${schoolPath}/configuration`);
await requestJson(`${schoolPath}/foundation`);
const roles = await requestJson<{ roles: Array<{ key: string }> }>(`${schoolPath}/roles`);
assert.ok(roles.roles.some((role) => role.key === "school_admin"));
const students = await requestJson<{ students: Array<{ id: string }> }>(`${schoolPath}/students`);
assert.ok(students.students.length > 0);
const operations = await requestJson<{
  operations: { attendance: unknown[]; invoices: unknown[]; payments: unknown[] };
}>(`${schoolPath}/operations`);
assert.ok(operations.operations.attendance.length > 0);
assert.ok(operations.operations.invoices.length > 0);
assert.ok(operations.operations.payments.length > 0);
const workspace = await requestJson<{ workspace: { records: unknown[] } }>(
  `${schoolPath}/workspace?moduleKey=Communicate`,
);
assert.ok(workspace.workspace.records.length > 0);

console.log(
  "Stage 7 staging health, readiness, platform and school authentication, school APIs, business records, and idempotency smoke checks passed.",
);

async function login(credential: { email: string; password: string }): Promise<{ cookie: string; csrf: string }> {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(credential),
    redirect: "manual",
  });
  if (!response.ok) throw new Error(`Real staging login returned HTTP ${response.status}`);
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const values = getSetCookie ? getSetCookie.call(response.headers) : [response.headers.get("set-cookie") ?? ""];
  const cookiePairs = values.flatMap((value) => value.split(/,(?=\s*__Host-)/)).map((value) => value.split(";", 1)[0]?.trim()).filter(Boolean);
  const csrf = cookiePairs.find((value) => value.startsWith("__Host-hig_csrf="))?.slice("__Host-hig_csrf=".length);
  assert.ok(cookiePairs.some((value) => value.startsWith("__Host-hig_session=")), "Session cookie missing");
  assert.ok(csrf, "CSRF cookie missing");
  return { cookie: cookiePairs.join("; "), csrf };
}

function credential(kind: "PLATFORM" | "SCHOOL"): { email: string; password: string } {
  const email = process.env[`HIG_STAGING_${kind}_AUTH_EMAIL`]?.trim().toLowerCase();
  if (!email || !email.endsWith("@higschool.test")) {
    throw new Error(`HIG_STAGING_${kind}_AUTH_EMAIL must be a synthetic staging identity`);
  }
  const path = process.env[`HIG_STAGING_${kind}_PASSWORD_FILE`]?.trim();
  if (!path) throw new Error(`HIG_STAGING_${kind}_PASSWORD_FILE is required`);
  if ((statSync(path).mode & 0o077) !== 0) {
    throw new Error(`The ${kind.toLowerCase()} password file must not be group/world accessible`);
  }
  const password = readFileSync(path, "utf8").replace(/[\r\n]+$/, "");
  if (!password) throw new Error(`The ${kind.toLowerCase()} password file is empty`);
  return { email, password };
}

async function expectStatus(path: string, expected: number, authenticated = true): Promise<void> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: authenticated ? { cookie: session.cookie } : undefined,
    redirect: "manual",
  });
  if (response.status !== expected) {
    throw new Error(`${path} returned HTTP ${response.status}; expected ${expected}`);
  }
}

async function requestJson<Result>(path: string, init: RequestInit = {}): Promise<Result> {
  const headers = new Headers(init.headers);
  headers.set("cookie", session.cookie);
  if (!['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase())) {
    headers.set("origin", origin);
    headers.set("x-csrf-token", session.csrf);
  }
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers, redirect: "manual" });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return await response.json() as Result;
}
