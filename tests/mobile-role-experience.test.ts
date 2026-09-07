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

test("mobile shell provides role-focused home actions and discoverable navigation", () => {
  assert.match(core, /HigRoleDashboardPage/);
  assert.match(core, /HigNotificationsView/);
  assert.match(core, /HigProfileView/);
  assert.match(roleUi, /Recently used/);
  assert.match(roleUi, /Home actions/);
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
    roleUi.indexOf("Home actions") < roleUi.indexOf("Recently used"),
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
  assert.match(roleUi, /Everything currently available to you/);
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

test("mobile navigation uses role-specific dedicated destinations", () => {
  assert.match(core, /principalType == 'school' \? 'Attendance' : 'Diary'/);
  assert.match(core, /principalType == 'school' \? 'Homework' : 'Notices'/);
  assert.match(core, /HigAttendancePage\(/);
  assert.match(core, /HigDiaryPage\(api: widget.api, role: principalType\)/);
  assert.doesNotMatch(core, /label: 'More'/);
  assert.match(roleUi, /take\(4\)/);
  assert.match(roleUi, /leave_requests/);
  assert.match(roleUi, /notices/);
});

test("mobile record rows open details instead of showing a dead chevron", () => {
  assert.match(core, /void showRecordDetails\(/);
  assert.match(core, /showModalBottomSheet<void>/);
  assert.match(core, /onTap: \(\) =>\s*showRecordDetails\(record, title\)/);
  assert.match(core, /_formatMobileDate\(\s*attendanceDate\)/);
});

test("parent attendance uses a date-browsable calendar and Diary is dedicated", () => {
  assert.match(core, /ParentAttendanceCalendarPage/);
  assert.match(core, /Previous month/);
  assert.match(core, /Next month/);
  assert.match(core, /P Present/);
  assert.match(core, /A Absent/);
  assert.match(core, /L Late/);
  assert.match(core, /HigDiaryPage\(api: widget.api, role: principalType\)/);
  assert.match(roleUi, /'child_overview'/);
  assert.doesNotMatch(roleUi, /Linked student profiles and class details/);
});

test("staging classroom fixture seeds mobile diary records and teacher scope", () => {
  const fixture = readFileSync("scripts/staging-classroom-fixture.sql", "utf8");
  assert.match(fixture, /INSERT INTO teacher_assignments/);
  assert.match(fixture, /kind = 'class_teacher'/);
  assert.match(fixture, /kind = 'subject_teacher'/);
  assert.match(fixture, /INSERT INTO mobile_diary/);
  assert.match(fixture, /Linear equations practice/);
  assert.match(fixture, /The Last Leaf/);
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
