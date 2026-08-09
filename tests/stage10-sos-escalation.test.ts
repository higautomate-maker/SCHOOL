import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeOutboxEvent,
  routeNotificationEvent,
} from "../server/notifications/contracts.ts";

const driver = readFileSync("mobile/driver_gps_app/lib/main.dart", "utf8");
const service = readFileSync("server/mobile-app/service.ts", "utf8");
const postgres = readFileSync("server/mobile-app/postgres-repository.ts", "utf8");
const contracts = readFileSync("server/notifications/contracts.ts", "utf8");
const school = readFileSync("app/school/transport-production.tsx", "utf8");

function sosEvent() {
  return normalizeOutboxEvent({
    id: "11111111-1111-4111-8111-111111111111",
    tenant_id: "22222222-2222-4222-8222-222222222222",
    topic: "transport.alert",
    aggregate_type: "mobile_transport_event",
    aggregate_id: "33333333-3333-4333-8333-333333333333",
    payload: {
      transportEventType: "sos",
      tripId: "44444444-4444-4444-8444-444444444444",
      routeName: "Greenfield Route A",
      vehicleNumber: "HR36AB1234",
      latitude: 28.194,
      longitude: 76.618,
      accuracyMeters: 12,
      severity: "critical",
    },
    created_at: "2026-08-08T00:00:00.000Z",
  });
}

test("Driver SOS requires current trip and prevents parallel sends", () => {
  assert.match(driver, /bool sendingSos = false/);
  assert.match(driver, /if \(sendingSos\) return/);
  assert.match(driver, /Start the assigned trip before sending SOS/);
  assert.match(driver, /onPressed: !sendingSos/);
});

test("Driver sends emergency even when fresh GPS lookup fails", () => {
  assert.match(driver, /Emergency transmission must continue even if GPS is unavailable/);
  assert.match(driver, /'emergency': true/);
  assert.match(driver, /'source': 'driver_sos_button'/);
});

test("server binds SOS to exact active or paused assigned trip", () => {
  assert.match(service, /const sosEvent = input\.eventType === "sos"/);
  assert.match(service, /"emergency_alerts"/);
  assert.match(service, /transport\.trip\.id !== input\.tripId/);
  assert.match(service, /transport\.trip\.status !== "paused"/);
  assert.match(service, /Active or paused assigned trip required for emergency SOS/);
});

test("PostgreSQL suppresses SOS bursts transactionally for sixty seconds", () => {
  assert.match(postgres, /async function findRecentSos/);
  assert.match(postgres, /pg_advisory_xact_lock/);
  assert.match(postgres, /event_type = 'sos'/);
  assert.match(postgres, /interval '60 seconds'/);
  assert.match(postgres, /const recentSos = await findRecentSos/);
});

test("new SOS creates critical transport alert with location", () => {
  assert.match(postgres, /eventType === "sos"/);
  assert.match(postgres, /severity: event\.eventType === "sos" \? "critical" : "normal"/);
  assert.match(postgres, /latitude: event\.latitude/);
  assert.match(contracts, /optionalFiniteNumber\(event\.payload\.latitude\)/);
});

test("SOS notification is School-only and marked emergency", () => {
  const plans = routeNotificationEvent(sosEvent());
  assert.deepEqual(
    plans.map((plan) => [plan.recipientType, plan.recipientId]),
    [["audience", null]],
  );
  assert.equal(plans[0]?.payload.severity, "critical");
  assert.match(String(plans[0]?.payload.message), /EMERGENCY SOS/);
  assert.match(String(plans[0]?.payload.message), /Open live tracking immediately/);
});

test("School audit exposes exact SOS location", () => {
  assert.match(school, /Recent SOS events/);
  assert.match(school, /event\.eventType === "sos" \? styles\.sosEvent/);
  assert.match(school, /Open emergency location/);
  assert.match(school, /Vehicle \$\{vehicle\.vehicleNumber\}/);
});
