import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeOutboxEvent,
  routeNotificationEvent,
} from "../server/notifications/contracts.ts";

const mobilePostgres = readFileSync(
  "server/mobile-app/postgres-repository.ts",
  "utf8",
);

function transportEvent(payload: Record<string, unknown>) {
  return normalizeOutboxEvent({
    id: "11111111-1111-4111-8111-111111111111",
    tenant_id: "22222222-2222-4222-8222-222222222222",
    topic: "transport.alert",
    aggregate_type: "mobile_transport_event",
    aggregate_id: "33333333-3333-4333-8333-333333333333",
    payload,
    created_at: "2026-08-08T00:00:00.000Z",
  });
}

test("new transport alerts are inserted atomically with accepted mobile events", () => {
  assert.match(mobilePostgres, /async function insertTransportAlertOutbox/);
  assert.match(
    mobilePostgres,
    /await applyTransportTripTransition\(client, principal, input\);\s+await insertTransportAlertOutbox\(client, principal, event\)/,
  );
  assert.match(mobilePostgres, /INSERT INTO outbox_events/);
  assert.match(mobilePostgres, /'transport\.alert'/);
});

test("notification worker wake happens only after the transport transaction commits", () => {
  assert.match(
    mobilePostgres,
    /const committed = await transaction\(principal\.tenantId/,
  );
  assert.match(
    mobilePostgres,
    /if \(!committed\.replayed && shouldCreateTransportAlert\(committed\.event\.eventType\)\)/,
  );
  assert.match(mobilePostgres, /wakeNotificationWorker/);
});

test("stop arrival recipients are resolved from active route stop assignments", () => {
  assert.match(mobilePostgres, /assignment\.pickup_stop_id = \$3::uuid/);
  assert.match(mobilePostgres, /assignment\.drop_stop_id = \$3::uuid/);
  assert.match(mobilePostgres, /assignment\.status = 'active'/);
  assert.match(mobilePostgres, /assignment\.effective_from <= current_date/);
});

test("stop arrival creates linked parent plans plus one School audience plan", () => {
  const first = "44444444-4444-4444-8444-444444444444";
  const second = "55555555-5555-4555-8555-555555555555";
  const plans = routeNotificationEvent(transportEvent({
    transportEventType: "stop_arrived",
    stopName: "Central Gate",
    vehicleNumber: "HR36AB1234",
    studentIds: [first, second, first, "not-a-uuid"],
  }));
  assert.deepEqual(
    plans.map((plan) => [plan.recipientType, plan.recipientId]),
    [
      ["parent", first],
      ["parent", second],
      ["audience", null],
    ],
  );
  assert.match(String(plans[0]?.payload.message), /arrived/i);
  assert.equal(plans[0]?.payload.studentId, first);
});

test("student boarding and drop alert only assigned child Parent plus School", () => {
  const studentId = "44444444-4444-4444-8444-444444444444";
  for (const transportEventType of ["student_boarded", "student_dropped"]) {
    const plans = routeNotificationEvent(transportEvent({
      transportEventType,
      studentId,
      studentIds: [studentId],
      studentName: "Greenfield Student",
    }));
    assert.deepEqual(
      plans.map((plan) => [plan.recipientType, plan.recipientId]),
      [
        ["parent", studentId],
        ["audience", null],
      ],
    );
  }
});

test("stop departure remains School-only and avoids Parent spam", () => {
  const plans = routeNotificationEvent(transportEvent({
    transportEventType: "stop_departed",
    stopName: "Central Gate",
    studentIds: ["44444444-4444-4444-8444-444444444444"],
  }));
  assert.deepEqual(
    plans.map((plan) => [plan.recipientType, plan.recipientId]),
    [["audience", null]],
  );
});
