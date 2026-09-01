import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  dispatchNotificationDelivery,
  expandNotificationDeliveryPlans,
} from "../server/notifications/adapters.ts";
import type { DeliveryPlan, NotificationEvent } from "../server/notifications/contracts.ts";
import { readNotificationEnvironment } from "../server/notifications/environment.ts";
import {
  notificationWorkerHealth,
  writeNotificationWorkerHeartbeat,
} from "../server/notifications/heartbeat.ts";

const event: NotificationEvent = {
  eventId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  topic: "attendance.mark",
  aggregateType: "attendance",
  aggregateId: "33333333-3333-4333-8333-333333333333",
  occurredAt: "2026-08-01T00:00:00.000Z",
  schemaVersion: 1,
  payload: {},
  correlationId: "11111111-1111-4111-8111-111111111111",
  idempotencyKey: "notification:11111111-1111-4111-8111-111111111111",
};

const plan: DeliveryPlan = {
  recipientType: "parent",
  recipientId: "44444444-4444-4444-8444-444444444444",
  channel: "in_app",
  templateKey: "attendance.mark.parent",
  payload: { status: "present" },
};

test("delivery plans cover in-app, email, SMS, and push channels", () => {
  assert.deepEqual(
    expandNotificationDeliveryPlans([plan]).map((item) => item.channel),
    ["in_app", "email", "sms", "push"],
  );
});

test("in-app delivery is durable and disabled providers are explicitly skipped", async () => {
  const config = readNotificationEnvironment({});
  const internal = await dispatchNotificationDelivery(event, plan, config);
  assert.equal(internal.status, "delivered");
  assert.equal(internal.provider, "internal");
  const email = await dispatchNotificationDelivery(event, { ...plan, channel: "email" }, config);
  assert.equal(email.status, "skipped");
  assert.equal(email.provider, "disabled");
  assert.equal(email.errorCode, "notification_adapter_not_configured");
});

test("capture adapter writes a sanitized deterministic envelope", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hig-stage8-capture-"));
  const capturePath = join(directory, "deliveries.jsonl");
  const config = readNotificationEnvironment({
    HIG_DEPLOYMENT_ENV: "staging",
    NODE_ENV: "production",
    HIG_NOTIFICATION_EMAIL_ADAPTER: "capture",
    HIG_NOTIFICATION_CAPTURE_PATH: capturePath,
  });
  const outcome = await dispatchNotificationDelivery(
    event,
    { ...plan, channel: "email" },
    config,
  );
  assert.equal(outcome.status, "delivered");
  assert.equal(outcome.provider, "capture");
  const captured = JSON.parse((await readFile(capturePath, "utf8")).trim());
  assert.equal(captured.eventId, event.eventId);
  assert.equal(captured.channel, "email");
  assert.equal(captured.providerMessageId, outcome.providerMessageId);
  assert.equal("destination" in captured, false);
});

test("capture adapters fail closed in protected production", () => {
  assert.throws(() => readNotificationEnvironment({
    NODE_ENV: "production",
    HIG_DEPLOYMENT_ENV: "production",
    HIG_NOTIFICATION_EMAIL_ADAPTER: "capture",
  }));
});

test("worker heartbeat is atomic, fresh, and rejects stopped or stale workers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hig-stage8-heartbeat-"));
  const path = join(directory, "worker.json");
  const heartbeat = await writeNotificationWorkerHeartbeat(path, {
    workerId: "worker-test",
    status: "ready",
    processed: 2,
    code: null,
  });
  assert.equal((await notificationWorkerHealth(path, 90_000)).healthy, true);
  assert.equal((await notificationWorkerHealth(path, 1, Date.parse(heartbeat.timestamp) + 2)).healthy, false);
  await writeNotificationWorkerHeartbeat(path, {
    workerId: "worker-test",
    status: "stopped",
    processed: 0,
    code: null,
  });
  assert.equal((await notificationWorkerHealth(path, 90_000)).healthy, false);
});

test("worker image and staging compose expose health without a public port", () => {
  const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
  const compose = readFileSync(
    new URL("../deploy/hostinger-staging.compose.yml", import.meta.url),
    "utf8",
  );
  assert.match(dockerfile, /AS notification-worker/);
  assert.match(dockerfile, /stage8:worker:health/);
  assert.match(compose, /\n  worker:\n/);
  assert.match(compose, /target: notification-worker/);
  const worker = compose.split("\n  worker:\n")[1]?.split("\n  operator:\n")[0] ?? "";
  assert.match(worker, /restart: unless-stopped/);
  assert.match(worker, /stage8:worker:health/);
  assert.doesNotMatch(worker, /ports:/);
  const operator = compose.split("\n  operator:\n")[1]?.split("\nvolumes:\n")[0] ?? "";
  assert.match(operator, /staging_school_logs:\/logs\/staging-school:ro/);
});

test("delivery persistence records adapter status and provider without business-table access", () => {
  const source = readFileSync(
    new URL("../server/notifications/repository.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /outcome\.status/);
  assert.match(source, /outcome\.provider/);
  assert.match(source, /notification_delivery_attempts/);
  assert.doesNotMatch(source, /FROM\s+(students|fee_invoices|fee_payments|users|memberships)/i);
});
