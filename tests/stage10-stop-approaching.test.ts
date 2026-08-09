import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeOutboxEvent,
  routeNotificationEvent,
} from "../server/notifications/contracts.ts";

const types = readFileSync("server/mobile-app/types.ts", "utf8");
const validation = readFileSync("server/mobile-app/validation.ts", "utf8");
const service = readFileSync("server/mobile-app/service.ts", "utf8");
const postgres = readFileSync("server/mobile-app/postgres-repository.ts", "utf8");
const migration = readFileSync("drizzle-postgres/0012_transport_geofencing.sql", "utf8");
const driver = readFileSync("mobile/driver_gps_app/lib/main.dart", "utf8");

function approachingEvent(studentIds: string[]) {
  return normalizeOutboxEvent({
    id: "11111111-1111-4111-8111-111111111111",
    tenant_id: "22222222-2222-4222-8222-222222222222",
    topic: "transport.alert",
    aggregate_type: "mobile_transport_event",
    aggregate_id: "33333333-3333-4333-8333-333333333333",
    payload: {
      transportEventType: "stop_approaching",
      tripId: "66666666-6666-4666-8666-666666666666",
      stopId: "77777777-7777-4777-8777-777777777777",
      stopName: "Central Gate",
      vehicleNumber: "HR36AB1234",
      direction: "pickup",
      studentIds,
    },
    created_at: "2026-08-08T00:00:00.000Z",
  });
}

test("stop_approaching is a first-class GPS-derived transport event", () => {
  assert.match(types, /"stop_approaching"/);
  assert.match(validation, /value\.eventType === "stop_approaching"/);
  assert.match(service, /input\.eventType === "stop_approaching"/);
  assert.match(postgres, /eventType === "stop_approaching"/);
});

test("migration 0012 de-duplicates approach per tenant trip and stop", () => {
  assert.match(migration, /'stop_arrived', 'stop_departed', 'stop_approaching'/);
  assert.match(migration, /mobile_transport_events_stop_transition_uq/);
  assert.match(
    migration,
    /"tenant_id", "trip_id", "stop_id", "event_type"/,
  );
});

test("Driver approach threshold stays outside arrival radius with bounded lead", () => {
  assert.match(driver, /stopApproachThresholdMeters/);
  assert.match(driver, /radiusMeters \* 1\.5/);
  assert.match(driver, /\.clamp\(300\.0, 1500\.0\)/);
  assert.match(driver, /distanceMeters > radius/);
  assert.match(driver, /distanceMeters <= approachThreshold/);
});

test("Driver emits approach once per trip stop and restores dedupe state", () => {
  assert.match(driver, /geofenceEventKey\('stop_approaching', stopId\)/);
  assert.match(driver, /!emittedGeofenceEvents\.contains\(approachingKey\)/);
  assert.match(driver, /emittedGeofenceEvents\.add\(approachingKey\)/);
  assert.match(driver, /eventType != 'stop_approaching'/);
  assert.match(driver, /eventType == 'stop_approaching'/);
});

test("approach remains automatic active-trip GPS and background-safe", () => {
  assert.match(service, /const geofenceEvent =/);
  assert.match(service, /input\.metadata\.automatic !== true/);
  assert.match(service, /Geofence transitions must be GPS-derived/);
  assert.match(driver, /'stop_approaching'/);
  assert.match(driver, /'automatic': true/);
});

test("approach Parent recipients are server-derived from exact route stop", () => {
  assert.match(
    postgres,
    /\(event\.eventType === "stop_arrived" \|\| event\.eventType === "stop_approaching"\)/,
  );
  assert.match(postgres, /assignment\.pickup_stop_id = \$3::uuid/);
  assert.match(postgres, /assignment\.drop_stop_id = \$3::uuid/);
  assert.match(postgres, /assignment\.status = 'active'/);
});

test("approach notification routes only linked Parents plus School", () => {
  const first = "44444444-4444-4444-8444-444444444444";
  const second = "55555555-5555-4555-8555-555555555555";
  const plans = routeNotificationEvent(
    approachingEvent([first, second, first, "invalid"]),
  );

  assert.deepEqual(
    plans.map((plan) => [plan.recipientType, plan.recipientId]),
    [
      ["parent", first],
      ["parent", second],
      ["audience", null],
    ],
  );
  assert.match(String(plans[0]?.payload.message), /approaching/i);
  assert.match(String(plans[0]?.payload.message), /Please be ready/i);
});
