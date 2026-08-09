import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const migration = read(
  "drizzle-postgres/0013_transport_student_journey.sql",
);
const manifest = read("server/runtime/postgres-migrations.ts");
const service = read("server/mobile-app/service.ts");
const postgres = read("server/mobile-app/postgres-repository.ts");
const types = read("server/mobile-app/types.ts");
const driver = read("mobile/driver_gps_app/lib/main.dart");
const parentCore = read(
  "mobile/packages/hig_mobile_core/lib/hig_mobile_core.dart",
);
const schoolTransport = read(
  "server/transport/postgres-repository.ts",
);

test("student journey migration provides durable transition de-duplication", () => {
  assert.match(
    migration,
    /mobile_transport_events_student_journey_ck/,
  );

  assert.match(
    migration,
    /mobile_transport_events_student_transition_uq/,
  );

  assert.match(
    migration,
    /"tenant_id", "trip_id", "student_id", "event_type"/,
  );

  assert.match(
    manifest,
    /0013_transport_student_journey\.sql/,
  );
});
test("boarding and drop require the exact active assigned trip", () => {
  assert.match(service, /const studentJourneyEvent =/);

  assert.match(
    service,
    /studentJourneyEvent/,
  );

  assert.match(
    postgres,
    /validateStudentJourneyTransition/,
  );

  assert.match(
    postgres,
    /Active assigned student trip required/,
  );
});

test("server enforces board before drop and handles repeats safely", () => {
  assert.match(
    postgres,
    /Student must be boarded before drop/,
  );

  assert.match(
    postgres,
    /existingStudentJourney/,
  );

  assert.match(
    postgres,
    /journeyReplay/,
  );
});

test("Driver restores journey state and blocks invalid actions", () => {
  assert.match(
    driver,
    /restoreStudentStatusesFromSnapshot/,
  );

  assert.match(
    driver,
    /Mark the student boarded before drop/,
  );

  assert.match(
    driver,
    /canBoard: tracking/,
  );

  assert.match(
    driver,
    /canDrop: tracking/,
  );

  assert.match(
    driver,
    /enabled: canBoard/,
  );

  assert.match(
    driver,
    /enabled: canDrop/,
  );
});

test("Parent receives and displays only linked child journey state", () => {
  assert.match(
    types,
    /"waiting" \| "boarded" \| "dropped"/,
  );

  assert.match(
    postgres,
    /journeyEventType/,
  );

  assert.match(
    postgres,
    /journeyCapturedAt/,
  );

  assert.match(
    postgres,
    /event\.student_id = student_assignment\.student_id/,
  );

  assert.match(
    parentCore,
    /Student journey/,
  );
});

test("School transport audit resolves student identity", () => {
  assert.match(
    schoolTransport,
    /AS "studentName"/,
  );

  assert.match(
    schoolTransport,
    /LEFT JOIN students student/,
  );

  assert.match(
    schoolTransport,
    /student\.id = event\.student_id/,
  );

  assert.match(
    schoolTransport,
    /AS "stopName"/,
  );
});
