import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const core = readFileSync(
  "mobile/packages/hig_mobile_core/lib/hig_mobile_core.dart",
  "utf8",
);
const roleUi = readFileSync(
  "mobile/packages/hig_mobile_core/lib/src/hig_mobile_ui.dart",
  "utf8",
);
const attendanceUi = readFileSync(
  "mobile/packages/hig_mobile_core/lib/src/hig_attendance_ui.dart",
  "utf8",
);
const driver = readFileSync("mobile/driver_gps_app/lib/main.dart", "utf8");
const transportFixture = readFileSync(
  "scripts/stage10-greenfield-transport-seed.sql",
  "utf8",
);
const experience = readFileSync("docs/MOBILE-ROLE-EXPERIENCE.md", "utf8");

test("mobile shell provides role-focused daily work and discoverable navigation", () => {
  assert.match(core, /HigRoleDashboardPage/);
  assert.match(core, /HigRoleWorkspacePage/);
  assert.match(core, /HigNotificationsView/);
  assert.match(core, /HigProfileView/);
  assert.match(roleUi, /Recently used/);
  assert.match(roleUi, /Daily priorities/);
  assert.match(roleUi, /Search your workspace/);
  assert.match(roleUi, /Linked students/);
  assert.match(roleUi, /higMobileTheme/);
  assert.match(core, /HigStartupView/);
  assert.match(roleUi, /Preparing your secure workspace/);
  assert.doesNotMatch(
    core,
    /return const Scaffold\(body: Center\(child: CircularProgressIndicator\(\)\)\);/,
  );
});

test("mobile role screens prioritize work and remain readable on narrow devices", () => {
  assert.ok(
    roleUi.indexOf("Today’s work") < roleUi.indexOf("title: 'Linked students'"),
  );
  assert.match(roleUi, /width: double\.infinity/);
  assert.match(roleUi, /overflow: TextOverflow\.ellipsis/);
  assert.match(driver, /students\.length == 1 \? 'student' : 'students'/);
  assert.match(driver, /EdgeInsets\.fromLTRB\(16, 12, 16, 142\)/);
});

test("role workspace remains server-authoritative and permission-aware", () => {
  assert.match(core, /access\['modules'\]/);
  assert.match(core, /access\['features'\]/);
  assert.match(core, /item\['canManage'\] == true/);
  assert.match(roleUi, /Only actions currently allowed for you/);
  assert.match(roleUi, /HigRecentFeatureStore/);
  assert.doesNotMatch(roleUi, /eSchool|WRTeam|codecanyon/i);
});

test("teacher and parent actions use task language and guided selection", () => {
  assert.match(core, /Mark attendance/);
  assert.match(core, /Create fee invoice/);
  assert.match(core, /Send school request/);
  assert.match(core, /DropdownButtonFormField<String>/);
  assert.match(core, /availableStudents/);
});

test("teacher attendance is date-aware and supports class-wide exception marking", () => {
  assert.match(core, /HigAttendancePage/);
  assert.match(attendanceUi, /Take attendance/);
  assert.match(attendanceUi, /Class and section/);
  assert.match(attendanceUi, /showDatePicker/);
  assert.match(attendanceUi, /Attendance date/);
  assert.match(attendanceUi, /All present/);
  assert.match(attendanceUi, /Mark every student to save/);
  assert.match(attendanceUi, /\['present', 'absent', 'late', 'excused'\]/);
  assert.match(attendanceUi, /offset < pending\.length; offset \+= 4/);
  assert.match(attendanceUi, /completedWrites\.add/);
  assert.doesNotMatch(core, /Date \(YYYY-MM-DD\)/);
});

test("mobile navigation keeps daily work small and puts secondary tools under More", () => {
  assert.match(core, /label: 'More'/);
  assert.match(roleUi, /take\(4\)/);
  assert.match(roleUi, /More school tools/);
  assert.match(roleUi, /More family tools/);
  assert.match(roleUi, /More learning tools/);
});

test("mobile record rows open details instead of showing a dead chevron", () => {
  assert.match(core, /void showRecordDetails\(/);
  assert.match(core, /showModalBottomSheet<void>/);
  assert.match(core, /onTap: \(\) =>\s*showRecordDetails\(record, title\)/);
  assert.match(core, /_formatMobileDate\(\s*attendanceDate\)/);
});

test("transporter experience keeps trip and emergency controls prominent", () => {
  assert.match(driver, /Hig School Transport/);
  assert.match(driver, /START TRIP/);
  assert.match(driver, /PAUSE/);
  assert.match(driver, /SOS/);
  assert.match(driver, /Assigned students/);
  assert.match(driver, /label: 'Route'/);
  assert.match(driver, /higMobileTheme/);
  assert.match(transportFixture, /DELETE FROM mobile_transport_events/);
  assert.match(transportFixture, /status = 'scheduled'/);
});

test("final acceptance explicitly covers all mobile roles and real daily tasks", () => {
  for (const role of ["Parent", "Student", "Teacher", "Transporter"]) {
    assert.match(experience, new RegExp(role, "i"));
  }
  assert.match(experience, /server remains authoritative/i);
  assert.match(experience, /physical-device/i);
  assert.match(experience, /top three daily tasks without instruction/i);
});
