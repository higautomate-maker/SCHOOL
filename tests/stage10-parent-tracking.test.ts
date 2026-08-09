import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const service = read("server/mobile-app/service.ts");
const repository = read("server/mobile-app/repository.ts");
const postgres = read("server/mobile-app/postgres-repository.ts");
const sqlite = read("server/mobile-app/sqlite-repository.ts");
const types = read("server/mobile-app/types.ts");
const core = read(
  "mobile/packages/hig_mobile_core/lib/hig_mobile_core.dart",
);
const parentMain = read("mobile/student_parent_app/lib/main.dart");

test("parent transport tracking requires entitled parent feature", () => {
  assert.match(service, /principal\.principalType === "parent"/);
  assert.match(
    service,
    /requireFeature\(access, "transport_tracking"\)/,
  );
  assert.match(
    service,
    /linkedStudents\.map\(\(student\) => student\.id\)/,
  );
  assert.match(service, /loadParentTransportTracking\(/);
  assert.match(service, /scope: "linked_students_only"/);
  assert.match(service, /latestLocationOnly: true/);
  assert.match(service, /locationHistoryExposed: false/);
  assert.match(service, /driverContactExposed: false/);
});

test("parent repository is tenant and linked-student scoped", () => {
  assert.match(
    repository,
    /loadParentTransportTracking\([\s\S]*studentIds: readonly string\[\]/,
  );
  assert.match(postgres, /principal\.principalType !== "parent"/);
  assert.match(postgres, /new Set\(studentIds\)/);
  assert.match(postgres, /\.slice\(0, 50\)/);
  assert.match(
    postgres,
    /student_assignment\.student_id = ANY\(\$2::uuid\[\]\)/,
  );
  assert.match(
    postgres,
    /student_assignment\.tenant_id = \$1::uuid/,
  );
});

test("parent read model returns latest active trip location only", () => {
  assert.match(postgres, /event\.event_type = 'location'/);
  assert.match(postgres, /trip\.status = 'active'/);
  assert.match(
    postgres,
    /ORDER BY event\.captured_at DESC, event\.created_at DESC[\s\S]*LIMIT 1/,
  );
  assert.match(types, /locationHistoryExposed: false/);
  assert.match(types, /driverContactExposed: false/);
  assert.match(types, /activeTripLocationOnly: true/);
});

test("ETA is freshness-aware and stop-targeted", () => {
  assert.match(postgres, /function distanceMeters\(/);
  assert.match(postgres, /earthRadiusMeters = 6_371_000/);
  assert.match(postgres, /ageSeconds <= 120/);
  assert.match(postgres, /ageSeconds <= 900/);
  assert.match(postgres, /freshness === "offline"/);
  assert.match(
    postgres,
    /Math\.min\(Math\.max\(speedKph, 10\), 60\)/,
  );
  assert.match(postgres, /row\.tripDirection === "drop"/);
});

test("Parent app uses dedicated live transport screen", () => {
  assert.match(
    parentMain,
    /allowedPrincipalTypes: \['student', 'parent'\]/,
  );
  assert.match(core, /class ParentTransportTrackingPage/);
  assert.match(
    core,
    /item\['key'\]\?\.toString\(\) == 'transport_tracking'/,
  );
  assert.match(core, /widget\.api\.transport\(\)/);
  assert.match(core, /Duration\(seconds: 15\)/);
  assert.match(core, /refreshTimer\?\.cancel\(\)/);
  assert.match(core, /only the latest/);
  assert.match(core, /active-trip location/);
});

test("Parent UI shows route vehicle freshness distance and ETA", () => {
  assert.match(core, /Live transport/);
  assert.match(core, /freshnessLabel/);
  assert.match(core, /distanceToStopMeters/);
  assert.match(core, /etaMinutes/);
  assert.match(core, /student\['fullName'\]/);
});

test("SQLite never fabricates live parent GPS", () => {
  assert.match(sqlite, /loadParentTransportTracking\(/);
  assert.match(sqlite, /children: \[\]/);
  assert.match(sqlite, /locationHistoryExposed: false/);
});
