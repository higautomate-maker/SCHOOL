// Emergent — staff self-attendance punch safeguards (security-critical, pure).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateStaffPunch,
  haversineMeters,
  MAX_CLOCK_SKEW_SECONDS,
  type StaffPunchAttempt,
} from "../server/attendance/staff-punch-safeguards.ts";

const CAMPUS = { latitude: 12.9716, longitude: 77.5946 };
const NOW = 1_800_000_000_000;

function attempt(overrides: Partial<StaffPunchAttempt> = {}): StaffPunchAttempt {
  return {
    deviceLocation: CAMPUS,
    geofence: { center: CAMPUS, radiusMeters: 150 },
    deviceTimeMs: NOW,
    serverTimeMs: NOW,
    lastPunchType: null,
    requestedType: "in",
    ...overrides,
  };
}

test("haversine distance is ~0 for identical points and grows with separation", () => {
  assert.ok(haversineMeters(CAMPUS, CAMPUS) < 1);
  const far = { latitude: 12.9800, longitude: 77.5946 }; // ~930m north
  assert.ok(haversineMeters(CAMPUS, far) > 800 && haversineMeters(CAMPUS, far) < 1100);
});

test("accepts an on-premises punch-in with a trusted clock", () => {
  const d = evaluateStaffPunch(attempt());
  assert.equal(d.accepted, true);
  assert.equal(d.withinGeofence, true);
  assert.ok(d.distanceMeters !== null && d.distanceMeters < 5);
});

test("rejects punching the same state twice and out-before-in", () => {
  assert.equal(evaluateStaffPunch(attempt({ lastPunchType: "in", requestedType: "in" })).accepted, false);
  assert.equal(evaluateStaffPunch(attempt({ requestedType: "out", lastPunchType: null })).accepted, false);
  assert.equal(evaluateStaffPunch(attempt({ requestedType: "out", lastPunchType: "in" })).accepted, true);
});

test("rejects a spoofed/incorrect device clock beyond the skew threshold", () => {
  const d = evaluateStaffPunch(attempt({ deviceTimeMs: NOW + (MAX_CLOCK_SKEW_SECONDS + 30) * 1000 }));
  assert.equal(d.accepted, false);
  assert.ok(d.clockSkewSeconds !== null && d.clockSkewSeconds > MAX_CLOCK_SKEW_SECONDS);
  assert.match(d.reason, /clock/i);
});

test("rejects when outside the campus geofence and never leaks coordinates", () => {
  const outside = { latitude: 12.9900, longitude: 77.5946 }; // ~2km away
  const d = evaluateStaffPunch(attempt({ deviceLocation: outside }));
  assert.equal(d.accepted, false);
  assert.equal(d.withinGeofence, false);
  assert.match(d.reason, /school premises/i);
  assert.ok(!/12\.99|77\.59/.test(d.reason)); // no coordinates in the message
});

test("rejects when location or device time is missing", () => {
  assert.equal(evaluateStaffPunch(attempt({ deviceLocation: null })).accepted, false);
  assert.equal(evaluateStaffPunch(attempt({ deviceTimeMs: null })).accepted, false);
});

test("all rejection reasons are safe, non-technical strings", () => {
  const cases = [
    attempt({ lastPunchType: "in", requestedType: "in" }),
    attempt({ deviceTimeMs: NOW + 999_000 }),
    attempt({ deviceLocation: { latitude: 12.99, longitude: 77.59 } }),
    attempt({ deviceTimeMs: null }),
  ];
  const banned = /(stack|trace|exception|sql|database|undefined|null|http|token)/i;
  for (const c of cases) {
    const d = evaluateStaffPunch(c);
    assert.equal(d.accepted, false);
    assert.ok(!banned.test(d.reason), `unsafe reason: ${d.reason}`);
  }
});
