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
const driver = readFileSync("mobile/driver_gps_app/lib/main.dart", "utf8");
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

test("transporter experience keeps trip and emergency controls prominent", () => {
  assert.match(driver, /Hig School Transport/);
  assert.match(driver, /START TRIP/);
  assert.match(driver, /PAUSE/);
  assert.match(driver, /SOS/);
  assert.match(driver, /Assigned students/);
  assert.match(driver, /label: 'Route'/);
  assert.match(driver, /higMobileTheme/);
});

test("final acceptance explicitly covers all mobile roles and real daily tasks", () => {
  for (const role of ["Parent", "Student", "Teacher", "Transporter"]) {
    assert.match(experience, new RegExp(role, "i"));
  }
  assert.match(experience, /server remains authoritative/i);
  assert.match(experience, /physical-device/i);
  assert.match(experience, /top three daily tasks without instruction/i);
});
