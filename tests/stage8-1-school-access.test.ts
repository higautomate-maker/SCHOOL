import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canAccessNavigation,
  filterSchoolNavigation,
  filterSchoolNavigationItems,
  navigationModuleKey,
  type SchoolAccessSnapshot,
} from "../app/school/access-navigation.ts";
import { navigation } from "../app/school/navigation.ts";
import { schoolModuleDefinition } from "../server/access/catalogue.ts";

function access(
  modules: string[] = [],
  permissions: string[] = [],
): SchoolAccessSnapshot {
  return {
    moduleEntitlements: new Set(modules),
    rolePermissions: new Set(permissions),
  };
}

test("School navigation fails closed without Company modules and role permissions", () => {
  const visible = filterSchoolNavigation(navigation, access());
  assert.deepEqual(visible.map((group) => group.label), ["Dashboard"]);
  assert.deepEqual(
    filterSchoolNavigationItems(navigation, access()).map((item) => item.item),
    ["Dashboard"],
  );
});

test("Company entitlement and School role permission are both required", () => {
  assert.equal(
    canAccessNavigation(access(["student_information"]), "Student Information", "Student List"),
    false,
  );
  assert.equal(
    canAccessNavigation(access([], ["students.view"]), "Student Information", "Student List"),
    false,
  );
  assert.equal(
    canAccessNavigation(
      access(["student_information"], ["students.view"]),
      "Student Information",
      "Student List",
    ),
    true,
  );
});

test("attendance is independent from Student Information", () => {
  const studentOnly = access(["student_information"], ["students.view"]);
  assert.equal(
    canAccessNavigation(studentOnly, "Student Information", "Student Attendance"),
    false,
  );

  const attendanceOnly = access(["attendance"], ["attendance.view"]);
  assert.equal(
    canAccessNavigation(attendanceOnly, "Student Information", "Student Attendance"),
    true,
  );
  assert.equal(
    canAccessNavigation(attendanceOnly, "QR Code Attendance", "QR Attendance"),
    true,
  );
});

test("one Examinations entitlement controls offline and online examination pages", () => {
  const examinationAccess = access(["examinations"], ["exams.view"]);
  assert.equal(
    canAccessNavigation(examinationAccess, "Offline Examinations", "Exam Dashboard"),
    true,
  );
  assert.equal(
    canAccessNavigation(examinationAccess, "Online Examinations", "Manage Online Exams"),
    true,
  );
});

test("settings, access control and reports remain separate boundaries", () => {
  const settings = access(["settings_billing"], ["settings.view"]);
  assert.equal(canAccessNavigation(settings, "Settings & Billing", "School Settings"), true);
  assert.equal(canAccessNavigation(settings, "Settings & Billing", "Roles & Permissions"), false);
  assert.equal(canAccessNavigation(settings, "Settings & Billing", "Audit Trail"), false);

  const roles = access(["access_control"], ["roles.view"]);
  assert.equal(canAccessNavigation(roles, "Settings & Billing", "Roles & Permissions"), true);
  assert.equal(canAccessNavigation(roles, "Settings & Billing", "School Settings"), false);

  const reports = access(["reports_analytics"], ["reports.view"]);
  assert.equal(canAccessNavigation(reports, "Settings & Billing", "Audit Trail"), true);
});

test("fee management requires collection permission while export stays separate", () => {
  assert.deepEqual(
    schoolModuleDefinition("fees_finance")?.requiredManagementPermissions,
    ["fees.collect"],
  );
});

test("navigation aliases map to canonical module boundaries", () => {
  assert.equal(navigationModuleKey("Student Information", "Student Attendance"), "attendance");
  assert.equal(navigationModuleKey("Offline Examinations", "Exam Dashboard"), "examinations");
  assert.equal(navigationModuleKey("Online Examinations", "Question Bank"), "examinations");
  assert.equal(navigationModuleKey("Settings & Billing", "Roles & Permissions"), "access_control");
  assert.equal(navigationModuleKey("Settings & Billing", "Audit Trail"), "reports_analytics");
});

test("authenticated School UI has no preview-record fallback and filters all discovery surfaces", () => {
  const page = readFileSync("app/school/page.tsx", "utf8");
  assert.doesNotMatch(page, /previewStudents|previewFoundation|Saved in local preview|DEMO PREVIEW/);
  assert.match(page, /moduleEntitlements/);
  assert.match(page, /rolePermissions/);
  assert.match(page, /filterSchoolNavigation\(navigation,access\)/);
  assert.match(page, /filterSchoolNavigationItems\(navigation,access\)/);
  assert.match(page, /That module is not enabled for your School role/);
  assert.match(page, /SchoolRolesPage/);
  assert.match(page, /step-up authentication is required/i);
});

test("workspace API resolves module access for reads, creates and status updates", () => {
  const route = readFileSync(
    "app/api/v1/schools/[schoolId]/workspace/route.ts",
    "utf8",
  );
  assert.match(route, /assertSchoolModuleAccess\(actor, moduleKey, "view"\)/);
  assert.match(route, /getWorkspaceRecordModuleKey/);
  assert.match(route, /assertSchoolModuleAccess\(actor, moduleKey, "manage"\)/);
  assert.match(route, /filterWorkspaceForActor/);
});

test("operations API separates Attendance from Fees & Finance", () => {
  const route = readFileSync(
    "app/api/v1/schools/[schoolId]/operations/route.ts",
    "utf8",
  );
  assert.match(route, /actorCanAccessSchoolModule\(actor, "attendance", "view"\)/);
  assert.match(route, /actorCanAccessSchoolModule\(actor, "fees_finance", "view"\)/);
  assert.match(route, /parsed\.data\.action === "mark_attendance"/);
  assert.match(route, /filterOperationsForActor/);
});

test("School app policy endpoint is authorized and marks relationship enforcement", () => {
  const route = readFileSync(
    "app/api/v1/schools/[schoolId]/app-access/route.ts",
    "utf8",
  );
  assert.match(route, /authorize\(request, policies\.schoolAppAccessView, schoolId\)/);
  assert.match(route, /relationshipRequired: true/);
  assert.match(route, /Unknown app audience/);
});

test("dynamic authorization remains tenant-bound before module resolution", () => {
  const authorization = readFileSync("server/auth/authorization.ts", "utf8");
  const tenantBoundary = authorization.indexOf("actor.activeTenantId!==requestedTenantId");
  const dynamicPermission = authorization.indexOf('policy.permission.startsWith("resolved_")');
  assert.ok(tenantBoundary >= 0);
  assert.ok(dynamicPermission > tenantBoundary);
  assert.match(authorization, /schoolModuleDefinition\(moduleIdentifier\)/);
  assert.match(authorization, /isModuleEntitled\(actor\.moduleEntitlements, definition\.key\)/);
});
