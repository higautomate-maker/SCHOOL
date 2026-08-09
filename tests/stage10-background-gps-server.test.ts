import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const service = read("server/mobile-app/service.ts");
const postgres = read("server/mobile-app/postgres-repository.ts");
const sqliteTransport = read("server/transport/sqlite-repository.ts");

test("Stage 10 server restricts background events to active-trip GPS-derived tracking", () => {
  assert.match(
    service,
    /const backgroundLocation = input\.metadata\.background === true/,
  );
  assert.match(
    service,
    /backgroundLocation && !backgroundSafeEvent/,
  );
  assert.match(
    service,
    /Background events are restricted to active-trip GPS and geofencing/,
  );
  assert.doesNotMatch(
    service,
    /Background tracking is reserved for Stage 10/,
  );
  assert.match(service, /input\.eventType === "location"/);
  assert.match(service, /transport\.trip\.id !== input\.tripId/);
  assert.match(service, /transport\.trip\.status !== "active"/);
  assert.match(service, /Active assigned trip required for GPS location/);
});

test("mobile transport policy advertises only the implemented Android active-trip model", () => {
  assert.match(
    service,
    /mode: "android_active_trip_foreground_service"/,
  );
  assert.match(service, /backgroundTracking: true/);
  assert.match(service, /backgroundLocationPermissionRequired: false/);
  assert.match(service, /geofencing: true/);
  assert.match(service, /retentionAutomation: true/);
});

test("PostgreSQL trip state changes are atomic with newly inserted mobile events", () => {
  assert.match(postgres, /function tripTransition\(/);
  assert.match(postgres, /case "trip_started"/);
  assert.match(postgres, /allowedStatuses: \["scheduled", "paused"\]/);
  assert.match(postgres, /case "trip_paused"/);
  assert.match(postgres, /allowedStatuses: \["active"\]/);
  assert.match(postgres, /case "trip_completed"/);
  assert.match(postgres, /allowedStatuses: \["active", "paused"\]/);
  assert.match(postgres, /async function applyTransportTripTransition\(/);
  assert.match(
    postgres,
    /await applyTransportTripTransition\(client, principal, input\)/,
  );
});

test("trip transition SQL remains tenant and driver bound", () => {
  assert.match(postgres, /trip\.tenant_id = \$1::uuid/);
  assert.match(postgres, /trip\.id = \$2::uuid/);
  assert.match(postgres, /assignment\.tenant_id = trip\.tenant_id/);
  assert.match(postgres, /assignment\.id = trip\.driver_assignment_id/);
  assert.match(postgres, /driver\.user_id = \$3::uuid/);
  assert.match(postgres, /assignment\.status = 'active'/);
  assert.match(postgres, /driver\.status = 'active'/);
  assert.match(postgres, /trip\.status = ANY\(\$5::text\[\]\)/);
});

test("trip timestamps follow valid state transitions without resetting original start", () => {
  assert.match(
    postgres,
    /COALESCE\(trip\.started_at, \$6::timestamptz\)/,
  );
  assert.match(
    postgres,
    /WHEN \$4::text = 'completed'[\s\S]*THEN \$6::timestamptz/,
  );
  assert.match(postgres, /updated_at = now\(\)/);
  assert.match(
    postgres,
    /Invalid or unauthorized transport trip transition/,
  );
});

test("legacy SQLite transport master data remains fail-closed", () => {
  assert.match(
    sqliteTransport,
    /Transport master data requires the PostgreSQL backend/,
  );
});
