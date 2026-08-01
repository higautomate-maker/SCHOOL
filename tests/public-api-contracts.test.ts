import assert from "node:assert/strict";
import test from "node:test";
import "./demo-environment.ts";
import { POST as demoAction } from "../app/api/v1/demo/action/route.ts";
import { POST as demoLogin } from "../app/api/v1/demo/login/route.ts";
import { GET as demoSession } from "../app/api/v1/demo/session/route.ts";
import { GET as demoState } from "../app/api/v1/demo/state/route.ts";
import { GET as realSession } from "../app/api/v1/auth/session/route.ts";
import { GET as health } from "../app/api/v1/health/route.ts";
import { GET as readiness } from "../app/api/v1/readiness/route.ts";
import {
  evaluateReadiness,
  publicReadinessBody,
} from "../server/runtime/readiness.ts";
import {
  sanitizedConfigurationError,
  validateProductionEnvironment,
} from "../server/runtime/production-environment.ts";

test("health endpoint preserves its public response shape", async () => {
  const response = await health();
  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(body).sort(), ["service", "status", "timestamp"]);
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

test("real and sales-demo authentication namespaces cannot authenticate each other", async () => {
  const configured = JSON.parse(process.env.HIG_DEMO_ACCOUNTS_JSON ?? "[]") as Array<{ token: string }>;
  assert.ok(configured[0]?.token);
  assert.equal((await demoSession(new Request("http://localhost/api/v1/demo/session", {
    headers: { cookie: "__Host-hig_session=not-a-demo-session" },
  }))).status, 401);
  assert.equal((await realSession(new Request("http://localhost/api/v1/auth/session", {
    headers: { authorization: `Bearer ${configured[0].token}` },
  }))).status, 401);
});

const productionEnvironment = {
  HIG_REPOSITORY_BACKEND: "postgres",
  DATABASE_URL: "postgresql://service:database-password@db.internal:5432/hig",
  PG_SSL: "require",
  PG_POOL_MAX: "8",
  PG_IDLE_TIMEOUT_MS: "10000",
  PG_CONNECTION_TIMEOUT_MS: "5000",
  APP_URL: "https://school.example.com",
  SESSION_SECRET: "session-secret-with-at-least-thirty-two-characters",
  REDIS_URL: "rediss://:redis-password@redis.internal:6379",
  HIG_QUEUE_MODE: "redis",
  HIG_KEY_PROVIDER: "environment",
  HIG_ENCRYPTION_KEY: "encryption-key-with-at-least-thirty-two-characters",
};

test("readiness verifies PostgreSQL, migration state, Redis, queue, and key-provider configuration", async () => {
  const calls: string[] = [];
  const result = await evaluateReadiness(productionEnvironment, {
    postgres: async () => { calls.push("postgres"); },
    migrations: async () => { calls.push("migrations"); },
    redis: async () => { calls.push("redis"); },
  });
  assert.deepEqual(result, { ready: true });
  assert.deepEqual(calls, ["postgres", "migrations", "redis"]);
  assert.equal(validateProductionEnvironment(productionEnvironment)?.queueMode, "redis");
});

test("production health/readiness errors disclose no deployment-sensitive detail", async () => {
  const result = await evaluateReadiness(productionEnvironment, {
    postgres: async () => {
      throw new Error(`could not connect to ${productionEnvironment.DATABASE_URL}`);
    },
  });
  const body = publicReadinessBody(result.ready);
  const serialized = JSON.stringify(body);
  assert.equal(result.internalReason, "postgres");
  assert.doesNotMatch(serialized, /database-password|db\.internal|DATABASE_URL/);
  assert.deepEqual(Object.keys(body.checks).sort(), ["application", "tenantGuard"]);
  assert.equal(
    sanitizedConfigurationError(new Error(productionEnvironment.REDIS_URL)),
    "Production configuration is invalid",
  );
});
