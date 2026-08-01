import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeOutboxEvent,
  routeNotificationEvent,
} from "../server/notifications/contracts.ts";
import { readNotificationEnvironment } from "../server/notifications/environment.ts";
import {
  notificationFailureCode,
  processNotificationBatch,
  retryDelay,
} from "../server/notifications/worker.ts";

const attendanceEvent = normalizeOutboxEvent({
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "22222222-2222-4222-8222-222222222222",
  topic: "attendance.mark",
  aggregate_type: "attendance",
  aggregate_id: "33333333-3333-4333-8333-333333333333",
  payload: {
    action: "mark_attendance",
    studentId: "44444444-4444-4444-8444-444444444444",
    attendanceDate: "2026-08-01",
    status: "present",
    note: "not copied to delivery payload",
  },
  created_at: "2026-08-01T00:00:00.000Z",
});

test("normalizes supported events and creates parent/student in-app plans", () => {
  const plans = routeNotificationEvent(attendanceEvent);
  assert.equal(attendanceEvent.schemaVersion, 1);
  assert.deepEqual(plans.map((plan) => plan.recipientType), ["parent", "student"]);
  assert.equal(plans[0]?.recipientId, "44444444-4444-4444-8444-444444444444");
  assert.equal("note" in (plans[0]?.payload ?? {}), false);
});

test("legacy payment events remain processable without recipient enrichment", () => {
  const event = normalizeOutboxEvent({
    id: "55555555-5555-4555-8555-555555555555",
    tenant_id: "22222222-2222-4222-8222-222222222222",
    topic: "fee.payment.collect",
    aggregate_type: "fee_payment",
    aggregate_id: "66666666-6666-4666-8666-666666666666",
    payload: { action: "collect_payment", amountPaise: 1000 },
    created_at: "2026-08-01T00:00:00.000Z",
  });
  const plans = routeNotificationEvent(event);
  assert.equal(plans.length, 1);
  assert.equal(plans[0]?.recipientType, "audience");
  assert.equal(plans[0]?.payload.legacyRecipientResolution, true);
});

test("rejects unsupported outbox topics", () => {
  assert.throws(() => normalizeOutboxEvent({
    id: "11111111-1111-4111-8111-111111111111",
    tenant_id: "22222222-2222-4222-8222-222222222222",
    topic: "unsupported.topic",
    aggregate_type: "record",
    aggregate_id: "record-1",
    payload: {},
    created_at: "2026-08-01T00:00:00.000Z",
  }));
});

test("validates bounded worker environment", () => {
  const defaults = readNotificationEnvironment({});
  assert.equal(defaults.HIG_QUEUE_BATCH_SIZE, 20);
  assert.throws(() => readNotificationEnvironment({
    HIG_QUEUE_WORKER_ENABLED: "true",
  }));
  assert.throws(() => readNotificationEnvironment({
    HIG_QUEUE_RETRY_BASE_MS: "2000",
    HIG_QUEUE_RETRY_MAX_MS: "1000",
  }));
});

test("retry delay is jittered and bounded", () => {
  assert.equal(retryDelay(1, 5_000, 900_000, () => 0), 5_000);
  assert.equal(retryDelay(30, 5_000, 900_000, () => 1), 900_000);
});

test("batch processing respects the configured concurrency groups", async () => {
  const config = readNotificationEnvironment({
    HIG_QUEUE_BATCH_SIZE: "10",
    HIG_QUEUE_CONCURRENCY: "2",
  });
  const claimed = [0, 1, 2].map((index) => ({
    event: { ...attendanceEvent, eventId: `11111111-1111-4111-8111-11111111111${index}` },
    attempts: 1,
    workerId: "worker-1",
  }));
  const completed: string[] = [];
  const processed = await processNotificationBatch(config, "worker-1", {
    recoverExpiredLeases: async () => 0,
    claimBatch: async () => claimed,
    completeEvent: async (item) => {
      completed.push(item.event.eventId);
      return 2;
    },
    failEvent: async () => "retry",
  });
  assert.equal(processed, 3);
  assert.equal(completed.length, 3);
});

test("worker failures expose stable codes without raw messages", () => {
  assert.equal(notificationFailureCode(new Error("password=secret")), "notification_processing_failed");
});

test("queue repository uses leases, SKIP LOCKED, and queue-service RLS only", () => {
  const source = readFileSync(
    new URL("../server/notifications/repository.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /FOR UPDATE SKIP LOCKED/);
  assert.match(source, /app\.queue_service/);
  assert.match(source, /lease_expires_at/);
  assert.doesNotMatch(source, /FROM\s+(students|fee_invoices|fee_payments|users|memberships)/i);
});
