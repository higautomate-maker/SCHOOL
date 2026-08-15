// Emergent — Today summary: role-aware, counts-only, fail-closed, safe zero-states.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTodaySummary } from "../server/mobile-app/today-summary.ts";

const keys = (s: string[]): Set<string> => new Set(s);

test("company: platform counts only when platform admin", () => {
  const s = buildTodaySummary("company", {
    isPlatformAdmin: true,
    schoolsActive: 12,
    subscriptionsDueSoon: 2,
    securityAlertsOpen: 0,
  });
  assert.equal(s.role, "company");
  const map = Object.fromEntries(s.items.map((i) => [i.key, i.count]));
  assert.equal(map.schools_active, 12);
  assert.equal(map.subscriptions_due, 2);
  assert.equal(map.security_alerts, 0); // safe zero-state still shown
  // Non-admin gets nothing (fail-closed).
  const denied = buildTodaySummary("company", { isPlatformAdmin: false, schoolsActive: 12 });
  assert.equal(denied.empty, true);
  assert.deepEqual(denied.items, []);
});

test("school: only enabled modules produce tiles (fail-closed)", () => {
  const s = buildTodaySummary("school", {
    moduleKeys: keys(["attendance", "fees_finance", "communication"]),
    attendanceToMark: 3,
    feesOutstandingCount: 7,
    unreadNotices: 4,
    ptmToday: 1, // ptm_meetings NOT enabled -> must be omitted
  });
  const present = new Set(s.items.map((i) => i.key));
  assert.ok(present.has("attendance_to_mark"));
  assert.ok(present.has("fees_outstanding"));
  assert.ok(present.has("unread_notices"));
  assert.ok(!present.has("ptm_today"), "PTM tile leaked without module");
});

test("teacher: academics gates homework tile; no fees module = no fees tile", () => {
  const s = buildTodaySummary("teacher", {
    moduleKeys: keys(["attendance", "academics"]),
    attendanceToMark: 2,
    homeworkDueToday: 5,
    feesOutstandingCount: 9, // fees_finance not enabled -> omitted
  });
  const present = new Set(s.items.map((i) => i.key));
  assert.ok(present.has("homework_due"));
  assert.ok(!present.has("fees_outstanding"));
});

test("parent: relationship features gate tiles; counts only", () => {
  const s = buildTodaySummary("parent", {
    featureKeys: keys(["attendance", "fees_payments", "notices"]),
    childAbsencesToday: 0,
    feesDue: 1,
    unreadNotices: 3,
    homeworkPending: 8, // homework feature NOT granted -> omitted
  });
  const present = new Set(s.items.map((i) => i.key));
  assert.ok(present.has("attendance_today"));
  assert.ok(present.has("fees_due"));
  assert.ok(present.has("unread_notices"));
  assert.ok(!present.has("homework_pending"));
  // counts only — no name/content fields
  for (const item of s.items) {
    assert.deepEqual(Object.keys(item).sort(), ["count", "hint", "key", "label"]);
    assert.equal(typeof item.count, "number");
  }
});

test("student: exams tile requires examinations/results feature", () => {
  const granted = buildTodaySummary("student", {
    featureKeys: keys(["results"]),
    examsThisWeek: 2,
  });
  assert.ok(granted.items.some((i) => i.key === "exams_week"));
  const denied = buildTodaySummary("student", { featureKeys: keys([]), examsThisWeek: 2 });
  assert.equal(denied.empty, true);
});

test("transporter: trip status + boarding/SOS gated by features", () => {
  const active = buildTodaySummary("transporter", {
    featureKeys: keys(["trip_control", "boarding", "emergency_alerts"]),
    tripActive: true,
    studentsToBoard: 4,
    sosOpen: 0,
  });
  const trip = active.items.find((i) => i.key === "trip_status");
  assert.equal(trip?.count, 1);
  assert.ok(active.items.some((i) => i.key === "students_to_board"));
  assert.ok(active.items.some((i) => i.key === "sos_open"));
  // Without boarding feature the boarding tile disappears.
  const noBoarding = buildTodaySummary("transporter", {
    featureKeys: keys(["trip_control"]),
    tripActive: false,
    studentsToBoard: 4,
  });
  assert.ok(!noBoarding.items.some((i) => i.key === "students_to_board"));
  const idle = noBoarding.items.find((i) => i.key === "trip_status");
  assert.equal(idle?.count, 0); // safe zero-state
});

test("counts are non-negative integers and undefined inputs are omitted", () => {
  const s = buildTodaySummary("school", {
    moduleKeys: keys(["attendance"]),
    attendanceToMark: -3.7, // sanitised
    // feesOutstandingCount undefined -> omitted
  });
  const tile = s.items.find((i) => i.key === "attendance_to_mark");
  assert.equal(tile?.count, 0);
  assert.ok(!s.items.some((i) => i.key === "fees_outstanding"));
});

test("empty authorized set yields a safe empty summary", () => {
  const s = buildTodaySummary("school", { moduleKeys: keys([]) });
  assert.equal(s.empty, true);
  assert.deepEqual(s.items, []);
});
