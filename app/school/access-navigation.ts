import {
  schoolModuleDefinition,
  type SchoolModuleKey,
} from "../../server/access/catalogue.ts";
import type { NavGroup } from "./navigation";

export type SchoolAccessSnapshot = Readonly<{
  moduleEntitlements: ReadonlySet<string>;
  rolePermissions: ReadonlySet<string>;
}>;

const groupModuleKeys: Readonly<Record<string, SchoolModuleKey>> = {
  "Finance & Fees": "fees_finance",
  Accounts: "accounts",
  "Student Information": "student_information",
  Academics: "academics",
  "Front Office": "front_office",
  "Lead Management": "lead_management",
  "Offline Examinations": "examinations",
  "CBC Academics": "cbc_academics",
  "Online Examinations": "examinations",
  "Human Resource": "human_resources",
  "PTM Meetings": "ptm_meetings",
  "Lesson Planner": "lesson_planner",
  "OSM Module": "osm",
  "QR Code Attendance": "attendance",
  Assessment: "assessment",
  "Live Classes": "live_classes",
  "Study Center": "study_center",
  Certificates: "certificates",
  Communicate: "communication",
  Library: "library",
  Inventory: "inventory",
  Transport: "transport",
  Hostel: "hostel",
  "Help Center": "help_center",
  "Asset Management": "asset_management",
  "Reports & Analytics": "reports_analytics",
  "Settings & Billing": "settings_billing",
};

const itemModuleOverrides: Readonly<Record<string, SchoolModuleKey>> = {
  "Student Information::Student Attendance": "attendance",
  "Settings & Billing::Roles & Permissions": "access_control",
  "Settings & Billing::Audit Trail": "reports_analytics",
};

export function navigationModuleKey(
  group: string,
  item?: string,
): SchoolModuleKey | null {
  if (group === "Dashboard" || group === "Apps Center") return null;
  const override = item ? itemModuleOverrides[`${group}::${item}`] : undefined;
  return override ?? groupModuleKeys[group] ?? schoolModuleDefinition(group)?.key ?? null;
}

export function canAccessNavigation(
  access: SchoolAccessSnapshot,
  group: string,
  item?: string,
): boolean {
  if (group === "Dashboard") return true;
  if (group === "Apps Center") return false;
  const moduleKey = navigationModuleKey(group, item);
  if (!moduleKey || !access.moduleEntitlements.has(moduleKey)) return false;
  const definition = schoolModuleDefinition(moduleKey);
  return Boolean(definition?.requiredViewPermissions.every((permission) =>
    access.rolePermissions.has(permission)
  ));
}

export function filterSchoolNavigation(
  groups: readonly NavGroup[],
  access: SchoolAccessSnapshot,
): NavGroup[] {
  const visible = groups.flatMap((group) => {
    if (group.label === "Dashboard") return [group];
    if (group.label === "Apps Center") return [];
    const items = group.items.filter((item) => canAccessNavigation(access, group.label, item));
    return items.length ? [{ ...group, items }] : [];
  });
  return visible;
}

export function filterSchoolNavigationItems(
  groups: readonly NavGroup[],
  access: SchoolAccessSnapshot,
): Array<{ group: string; item: string; icon: string }> {
  return filterSchoolNavigation(groups, access).flatMap((group) =>
    group.items.map((item) => ({ group: group.label, item, icon: group.icon })),
  );
}

export function firstAccessibleSchoolRoute(
  groups: readonly NavGroup[],
  access: SchoolAccessSnapshot,
): { group: string; item: string } {
  const first = filterSchoolNavigation(groups, access)[0];
  return first
    ? { group: first.label, item: first.items[0] ?? first.label }
    : { group: "Dashboard", item: "Dashboard" };
}
