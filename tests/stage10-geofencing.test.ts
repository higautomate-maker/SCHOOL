import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const migration = read("drizzle-postgres/0012_transport_geofencing.sql");
const journal = read("drizzle-postgres/meta/_journal.json");
const types = read("server/mobile-app/types.ts");
const validation = read("server/mobile-app/validation.ts");
const service = read("server/mobile-app/service.ts");
const mobilePostgres = read("server/mobile-app/postgres-repository.ts");
const transportPostgres = read("server/transport/postgres-repository.ts");
const driver = read("mobile/driver_gps_app/lib/main.dart");
const manifest = read(
  "mobile/driver_gps_app/android/app/src/main/AndroidManifest.xml",
);

test("Stage 10 geofencing migration adds tenant-bound stop identity and dedupe", () => {
  assert.match(migration, /ADD COLUMN "stop_id" uuid/);
  assert.match(
    migration,
    /FOREIGN KEY \("tenant_id", "stop_id"\)[\s\S]*REFERENCES "transport_route_stops"\("tenant_id", "id"\)/,
  );
  assert.match(migration, /'stop_arrived', 'stop_departed'/);
  assert.match(migration, /mobile_transport_events_geofence_stop_ck/);
  assert.match(migration, /mobile_transport_events_stop_transition_uq/);
  assert.match(
    migration,
    /"tenant_id", "trip_id", "stop_id", "event_type"/,
  );
  assert.match(journal, /"tag": "0012_transport_geofencing"/);
});

test("mobile transport contract requires stop identity for geofence transitions", () => {
  assert.match(types, /"stop_arrived"/);
  assert.match(types, /"stop_departed"/);
  assert.match(types, /stopId: string \| null/);
  assert.match(validation, /stopId: z\.string\(\)\.uuid\(\)/);
  assert.match(
    validation,
    /Geofence events require an active trip and route stop/,
  );
});

test("server allows only GPS-derived geofence transitions for the assigned active trip", () => {
  assert.match(service, /const geofenceEvent =/);
  assert.match(service, /input\.metadata\.automatic !== true/);
  assert.match(service, /Geofence transitions must be GPS-derived/);
  assert.match(
    service,
    /transport\?\.stops\.some\(\(stop\) => stop\.id === input\.stopId\)/,
  );
  assert.match(service, /Route stop assignment required/);
  assert.match(
    service,
    /input\.eventType === "location" \|\| geofenceEvent/,
  );
  assert.match(service, /transport\.trip\.status !== "active"/);
  assert.match(service, /geofencing: true/);
});

test("PostgreSQL persists and de-duplicates stop transitions", () => {
  assert.match(mobilePostgres, /stop_id AS "stopId"/);
  assert.match(mobilePostgres, /async function findStopTransition\(/);
  assert.match(mobilePostgres, /trip_id = \$2::uuid/);
  assert.match(mobilePostgres, /stop_id = \$3::uuid/);
  assert.match(mobilePostgres, /event_type = \$4::text/);
  assert.match(mobilePostgres, /ON CONFLICT DO NOTHING/);
  assert.match(mobilePostgres, /const stopReplay = await findStopTransition/);
});

test("Driver derives stop arrival and departure from the active GPS stream with hysteresis", () => {
  assert.match(driver, /Geolocator\.distanceBetween\(/);
  assert.match(driver, /geofenceRadiusMeters/);
  assert.match(driver, /geofenceHysteresis/);
  assert.match(driver, /\.clamp\(25\.0, 100\.0\)/);
  assert.match(driver, /'stop_arrived'/);
  assert.match(driver, /'stop_departed'/);
  assert.match(driver, /'automatic': true/);
  assert.match(driver, /insideStopGeofences/);
  assert.match(driver, /emittedGeofenceEvents/);
  assert.match(driver, /restoreGeofenceStateFromSnapshot/);
  assert.match(driver, /pendingGeofencePosition/);
});

test("geofencing reuses active-trip foreground service without always-on background location", () => {
  assert.doesNotMatch(
    manifest,
    /android\.permission\.ACCESS_BACKGROUND_LOCATION/,
  );
  assert.match(manifest, /android\.permission\.FOREGROUND_SERVICE_LOCATION/);
  assert.doesNotMatch(driver, /AndroidGeofencing|GeofenceService|BOOT_COMPLETED/);
});

test("School transport event feed resolves stop names for automatic transitions", () => {
  assert.match(transportPostgres, /event\.stop_id AS "stopId"/);
  assert.match(transportPostgres, /stop\.stop_name AS "stopName"/);
  assert.match(transportPostgres, /LEFT JOIN transport_route_stops stop/);
});
