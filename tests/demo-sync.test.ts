import assert from "node:assert/strict";
import test from "node:test";
import { POST as applyAction } from "../app/api/v1/demo/action/route.ts";
import { GET as readState } from "../app/api/v1/demo/state/route.ts";
import { releaseDemoStateMemoryCache } from "../server/demo-store.ts";
import { demoToken } from "./demo-environment.ts";

function request(path: string, token: string, body?: Record<string, unknown>) {
  return new Request(`http://localhost${path}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("school demo opens with complete cross-module sample data", async () => {
  const state = await (await readState(request("/api/v1/demo/state", demoToken("school_admin")))).json() as {
    students: unknown[];
    modules: Array<{ enabled: boolean }>;
    operations: { attendance: unknown[]; invoices: unknown[]; payments: unknown[] };
    records: Array<{ moduleKey: string; workflow: string }>;
  };
  assert.ok(state.students.length >= 9);
  assert.ok(state.operations.attendance.length >= 9);
  assert.ok(state.operations.invoices.length >= 6);
  assert.ok(state.operations.payments.length >= 5);
  assert.ok(state.records.length >= 20);
  assert.ok(state.modules.filter((module) => module.enabled).length >= 25);
  for (const moduleKey of ["Communicate", "Study Center", "PTM Meetings", "Offline Examinations", "Assessment", "Lesson Planner", "Library", "Transport", "Human Resource", "Asset Management"]) {
    assert.ok(state.records.some((record) => record.moduleKey === moduleKey), `${moduleKey} sample record is missing`);
  }
});

test("teacher attendance update is visible to the student client", async () => {
  const stateBefore = await (await readState(request("/api/v1/demo/state", demoToken("student")))).json() as { students: Array<{ id: string; fullName: string }>; version: number };
  const aarav = stateBefore.students.find((student) => student.fullName === "Aarav Sharma");
  assert.ok(aarav);

  const actionResponse = await applyAction(request("/api/v1/demo/action", demoToken("staff"), {
    action: "mark_attendance",
    studentId: aarav.id,
    attendanceDate: "2026-07-26",
    status: "late",
    note: "Integration test",
  }));
  assert.equal(actionResponse.status, 200);

  const stateAfter = await (await readState(request("/api/v1/demo/state", demoToken("student")))).json() as { version: number; operations: { attendance: Array<{ studentId: string; status: string }> } };
  assert.ok(stateAfter.version > stateBefore.version);
  assert.equal(stateAfter.operations.attendance.find((entry) => entry.studentId === aarav.id)?.status, "late");
});

test("attendance persists after memory reload and creates a parent notification", async () => {
  const before = await (await readState(request("/api/v1/demo/state", demoToken("staff")))).json() as { students: Array<{ id: string; fullName: string }> };
  const aarav = before.students.find((student) => student.fullName === "Aarav Sharma");
  assert.ok(aarav);
  const response = await applyAction(request("/api/v1/demo/action", demoToken("staff"), {
    action: "mark_attendance",
    studentId: aarav.id,
    attendanceDate: "2026-07-26",
    status: "present",
    note: "Persistence test",
  }));
  assert.equal(response.status, 200);

  releaseDemoStateMemoryCache();
  const parentState = await (await readState(request("/api/v1/demo/state", demoToken("parent")))).json() as {
    operations: { attendance: Array<{ studentId: string; status: string }> };
    notifications: Array<{ studentId: string; title: string; message: string }>;
  };
  assert.equal(parentState.operations.attendance.find((entry) => entry.studentId === aarav.id)?.status, "present");
  assert.ok(parentState.notifications.some((notification) => notification.studentId === aarav.id && notification.title === "Attendance updated" && notification.message.includes("present")));
});

test("company module policy is visible to the school client", async () => {
  const response = await applyAction(request("/api/v1/demo/action", demoToken("company"), {
    action: "set_module",
    moduleKey: "hostel",
    enabled: false,
  }));
  assert.equal(response.status, 200);

  const state = await (await readState(request("/api/v1/demo/state", demoToken("school_admin")))).json() as { modules: Array<{ key: string; enabled: boolean }> };
  assert.equal(state.modules.find((module) => module.key === "hostel")?.enabled, false);
});

test("parent can send a school request while student remains read-only", async () => {
  const parentResponse = await applyAction(request("/api/v1/demo/action", demoToken("parent"), {
    action: "parent_request",
    requestType: "Callback",
    title: "Parent callback request",
    description: "Please contact the linked guardian.",
  }));
  assert.equal(parentResponse.status, 200);
  const parentState = await parentResponse.json() as { records: Array<{ workflow: string; title: string }> };
  assert.ok(parentState.records.some((record) => record.workflow === "Callback" && record.title === "Parent callback request"));

  const studentResponse = await applyAction(request("/api/v1/demo/action", demoToken("student"), {
    action: "parent_request",
    title: "Not allowed",
  }));
  assert.equal(studentResponse.status, 403);
});
