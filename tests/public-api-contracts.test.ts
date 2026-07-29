import assert from "node:assert/strict";
import test from "node:test";
import { POST as demoAction } from "../app/api/v1/demo/action/route.ts";
import { POST as demoLogin } from "../app/api/v1/demo/login/route.ts";
import { GET as demoSession } from "../app/api/v1/demo/session/route.ts";
import { GET as demoState } from "../app/api/v1/demo/state/route.ts";
import { GET as health } from "../app/api/v1/health/route.ts";
import { GET as readiness } from "../app/api/v1/readiness/route.ts";

test("health endpoint preserves its public response shape", async () => {
  const response = await health();
  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(body).sort(), ["region", "service", "status", "timestamp"]);
  assert.equal(body.status, "ok");
  assert.equal(body.service, "hig-school");
  assert.ok(!Number.isNaN(Date.parse(String(body.timestamp))));
});

test("readiness endpoint preserves its current response shape", async () => {
  const response = await readiness();
  const body = await response.json() as { status: string; checks: Record<string, string>; timestamp: string };
  assert.equal(response.status, 200);
  assert.equal(body.status, "ready");
  assert.deepEqual(Object.keys(body.checks).sort(), ["application", "tenantGuard"]);
  assert.ok(!Number.isNaN(Date.parse(body.timestamp)));
});

test("demo endpoints reject missing authentication", async () => {
  const request = new Request("http://localhost/api/v1/demo/state");
  assert.equal((await demoSession(request)).status, 401);
  assert.equal((await demoState(request)).status, 401);
  assert.equal((await demoAction(new Request("http://localhost/api/v1/demo/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "mark_attendance" }),
  }))).status, 401);
});

test("demo login rejects invalid credentials without disclosing an account", async () => {
  const response = await demoLogin(new Request("http://localhost/api/v1/demo/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "unknown@example.com", password: "incorrect" }),
  }));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Incorrect demo email or password" });
});

test.todo("readiness verifies PostgreSQL, Redis, queue, and key-provider dependencies");
test.todo("production health/readiness responses disclose no deployment-sensitive detail");
