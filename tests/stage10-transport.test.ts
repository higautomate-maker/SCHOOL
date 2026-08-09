import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transportActionSchema } from "../server/transport/validation.ts";

const read = (path: string) => readFileSync(path, "utf8");

test("Stage 10 Module 1 migration creates tenant-isolated transport records", () => {
  const migration = read("drizzle-postgres/0011_transport_master_data.sql");
  for (const table of [
    "transport_drivers",
    "transport_vehicles",
    "transport_routes",
    "transport_route_stops",
    "transport_driver_assignments",
    "transport_student_assignments",
    "transport_trips",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
    assert.match(migration, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`));
    assert.match(migration, new RegExp(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`));
  }
  assert.match(
    migration,
    /CREATE POLICY "mobile_transport_events_transport_admin_read"/,
  );
  assert.match(
    migration,
    /ON "mobile_transport_events" FOR SELECT/,
  );
  assert.match(
    migration,
    /"tenant_id" = app_current_tenant_id\(\)/,
  );
  assert.match(
    migration,
    /FOREIGN KEY \("tenant_id", "route_id", "pickup_stop_id"\)/,
  );
  assert.match(
    migration,
    /FOREIGN KEY \("tenant_id", "route_id", "driver_assignment_id"\)/,
  );
});

test("transport actions validate bounded production input", () => {
  const valid = [
    {
      action: "create_vehicle",
      vehicleNumber: "Bus 01",
      registrationNumber: "HR36AB1234",
      vehicleType: "school_bus",
      capacity: 40,
      gpsDeviceId: null,
    },
    {
      action: "create_route",
      routeName: "Greenfield Route A",
      routeCode: "GFA",
      direction: "both",
      shift: "morning",
    },
    {
      action: "create_stop",
      routeId: "43000000-0000-4000-8000-000000000001",
      stopName: "Main Market",
      sequenceNumber: 1,
      latitude: 28.197,
      longitude: 76.619,
      pickupTime: "07:15",
      dropTime: "15:10",
      geofenceRadiusMeters: 200,
    },
  ];
  for (const action of valid) {
    assert.equal(transportActionSchema.safeParse(action).success, true);
  }

  assert.equal(
    transportActionSchema.safeParse({
      ...valid[0],
      capacity: 0,
    }).success,
    false,
  );
  assert.equal(
    transportActionSchema.safeParse({
      ...valid[2],
      latitude: 120,
    }).success,
    false,
  );
});

test("transport API preserves view and management authorization boundaries", () => {
  const route = read(
    "app/api/v1/schools/[schoolId]/transport/route.ts",
  );
  assert.match(route, /authorize\(request, policies\.transportView, schoolId\)/);
  assert.match(route, /authorize\(request, policies\.transportManage, schoolId\)/);
  assert.match(route, /transportActionSchema\.safeParse/);
  assert.match(route, /listTransportAdminSnapshot\(schoolId\)/);
  assert.match(route, /applyTransportAction\(schoolId, parsed\.data\)/);
});

test("admin repository exposes real GPS and safety events with tenant predicates", () => {
  const repository = read("server/transport/postgres-repository.ts");
  assert.match(repository, /latestLocations/);
  assert.match(repository, /recentEvents/);
  assert.match(repository, /FROM mobile_transport_events/);
  assert.match(repository, /event_type = 'location'/);
  assert.match(repository, /event_type <> 'location'/);
  assert.match(repository, /WHERE event\.tenant_id = \$1::uuid/);
  assert.match(repository, /FROM memberships membership/);
  assert.match(repository, /membership\.tenant_id = \$1::uuid/);
  assert.match(repository, /Selected driver must be an active school user/);
  assert.match(repository, /Selected stops must belong to the assigned route/);
  assert.match(repository, /Driver assignment does not match the scheduled route/);
});

test("School Transport UI uses the authenticated production endpoint", () => {
  const page = read("app/school/page.tsx");
  const workspace = read("app/school/transport-production.tsx");
  assert.match(page, /TransportProductionPage/);
  assert.doesNotMatch(page, /const previewVehicles:TransportVehicle\[\]/);
  assert.match(workspace, /authenticatedFetch/);
  assert.match(
    workspace,
    /\/api\/v1\/schools\/\$\{encodeURIComponent\(schoolId\)\}\/transport/,
  );
  assert.match(workspace, /Latest Driver Positions/);
  assert.match(workspace, /Recent Trip & Safety Events/);
  assert.match(workspace, /active-trip background GPS/i);
});

test("Stage 10 command remains separately runnable", () => {
  const packageJson = JSON.parse(read("package.json")) as {
    scripts?: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts?.["stage10:test"],
    "node --experimental-strip-types --test tests/stage10-*.test.ts",
  );
});
