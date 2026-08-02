export const permissionCatalogue = [
  ["academics.view", "View academic setup", "Academics"],
  ["academics.manage", "Manage academic setup", "Academics"],
  ["students.view", "View students", "Students"],
  ["students.manage", "Manage students", "Students"],
  ["attendance.view", "View attendance", "Attendance"],
  ["attendance.manage", "Manage attendance", "Attendance"],
  ["fees.view", "View fees", "Finance"],
  ["fees.collect", "Collect fees", "Finance"],
  ["fees.export", "Export fees", "Finance"],
  ["exams.view", "View examinations", "Academics"],
  ["exams.publish", "Publish examinations and results", "Academics"],
  ["reports.view", "View reports", "Reporting"],
  ["reports.manage", "Manage reports and exports", "Reporting"],
  ["settings.manage", "Manage settings", "Administration"],
  ["settings.view", "View settings", "Administration"],
  ["roles.view", "View roles", "Administration"],
  ["roles.manage", "Manage roles", "Administration"],
  ["operations.view", "View operations", "Operations"],
  ["operations.manage", "Manage operations", "Operations"],
  ["workspace.view", "View workspace", "Workspace"],
  ["workspace.manage", "Manage workspace", "Workspace"],
  ["accounts.view", "View accounts", "Finance"],
  ["accounts.manage", "Manage accounts", "Finance"],
  ["front_office.view", "View front office", "Operations"],
  ["front_office.manage", "Manage front office", "Operations"],
  ["lead_management.view", "View admission leads", "Admissions"],
  ["lead_management.manage", "Manage admission leads", "Admissions"],
  ["cbc_academics.view", "View CBC academics", "Academics"],
  ["cbc_academics.manage", "Manage CBC academics", "Academics"],
  ["human_resources.view", "View human resources", "Administration"],
  ["human_resources.manage", "Manage human resources", "Administration"],
  ["ptm_meetings.view", "View parent-teacher meetings", "Communication"],
  ["ptm_meetings.manage", "Manage parent-teacher meetings", "Communication"],
  ["lesson_planner.view", "View lesson plans", "Academics"],
  ["lesson_planner.manage", "Manage lesson plans", "Academics"],
  ["osm.view", "View OSM module", "Academics"],
  ["osm.manage", "Manage OSM module", "Academics"],
  ["assessment.view", "View assessments", "Academics"],
  ["assessment.manage", "Manage assessments", "Academics"],
  ["live_classes.view", "View live classes", "Academics"],
  ["live_classes.manage", "Manage live classes", "Academics"],
  ["study_center.view", "View study center", "Academics"],
  ["study_center.manage", "Manage study center", "Academics"],
  ["certificates.view", "View certificates", "Administration"],
  ["certificates.manage", "Manage certificates", "Administration"],
  ["communication.view", "View communication", "Communication"],
  ["communication.manage", "Manage communication", "Communication"],
  ["library.view", "View library", "Operations"],
  ["library.manage", "Manage library", "Operations"],
  ["inventory.view", "View inventory", "Operations"],
  ["inventory.manage", "Manage inventory", "Operations"],
  ["transport.view", "View transport", "Operations"],
  ["transport.manage", "Manage transport", "Operations"],
  ["hostel.view", "View hostel", "Operations"],
  ["hostel.manage", "Manage hostel", "Operations"],
  ["help_center.view", "View help center", "Support"],
  ["help_center.manage", "Manage help center", "Support"],
  ["asset_management.view", "View assets", "Operations"],
  ["asset_management.manage", "Manage assets", "Operations"],
] as const;

export type PermissionKey = typeof permissionCatalogue[number][0];

export const schoolModuleKeys = [
  "student_information",
  "fees_finance",
  "accounts",
  "attendance",
  "academics",
  "front_office",
  "lead_management",
  "examinations",
  "cbc_academics",
  "human_resources",
  "ptm_meetings",
  "lesson_planner",
  "osm",
  "assessment",
  "live_classes",
  "study_center",
  "certificates",
  "communication",
  "library",
  "inventory",
  "transport",
  "hostel",
  "help_center",
  "asset_management",
  "reports_analytics",
  "settings_billing",
  "access_control",
] as const;

export type SchoolModuleKey = typeof schoolModuleKeys[number];
export type NavigationCategory =
  | "School Management"
  | "Finance"
  | "Academics"
  | "People"
  | "Communication"
  | "Operations"
  | "Reporting"
  | "Administration";

export type SchoolModuleDefinition = Readonly<{
  key: SchoolModuleKey;
  label: string;
  category: NavigationCategory;
  displayOrder: number;
  description: string;
  requiredViewPermissions: readonly PermissionKey[];
  requiredManagementPermissions: readonly PermissionKey[];
  coreAdministrative: boolean;
  routeAliases: readonly string[];
}>;

export const schoolModuleCatalogue = [
  {
    key: "student_information",
    label: "Student Information",
    category: "School Management",
    displayOrder: 10,
    description: "Admissions, student records, guardians and student lifecycle administration.",
    requiredViewPermissions: ["students.view"],
    requiredManagementPermissions: ["students.manage"],
    coreAdministrative: true,
    routeAliases: ["Student Information", "Students", "Student List", "Admissions"],
  },
  {
    key: "fees_finance",
    label: "Fees & Finance",
    category: "Finance",
    displayOrder: 20,
    description: "Fee structures, invoices, collections, dues and payment records.",
    requiredViewPermissions: ["fees.view"],
    requiredManagementPermissions: ["fees.collect"],
    coreAdministrative: true,
    routeAliases: ["Finance & Fees", "Fees", "Search Due Fees", "All Transactions", "Online Transactions"],
  },
  {
    key: "accounts",
    label: "Accounts",
    category: "Finance",
    displayOrder: 30,
    description: "Income, expenses, ledgers and school accounting operations.",
    requiredViewPermissions: ["accounts.view"],
    requiredManagementPermissions: ["accounts.manage"],
    coreAdministrative: false,
    routeAliases: ["Accounts", "Accounts Dashboard", "Income", "Expense"],
  },
  {
    key: "attendance",
    label: "Attendance",
    category: "School Management",
    displayOrder: 40,
    description: "Student attendance, QR attendance and attendance reporting.",
    requiredViewPermissions: ["attendance.view"],
    requiredManagementPermissions: ["attendance.manage"],
    coreAdministrative: true,
    routeAliases: ["Attendance", "QR Code Attendance", "Student Attendance"],
  },
  {
    key: "academics",
    label: "Academics",
    category: "Academics",
    displayOrder: 50,
    description: "Academic sessions, classes, sections, subjects and timetables.",
    requiredViewPermissions: ["academics.view"],
    requiredManagementPermissions: ["academics.manage"],
    coreAdministrative: true,
    routeAliases: ["Academics", "Academic Dashboard", "Academic Sessions", "Classes", "Subjects", "Timetable"],
  },
  {
    key: "front_office",
    label: "Front Office",
    category: "School Management",
    displayOrder: 60,
    description: "Visitor, enquiry, reception and front-desk workflows.",
    requiredViewPermissions: ["front_office.view"],
    requiredManagementPermissions: ["front_office.manage"],
    coreAdministrative: false,
    routeAliases: ["Front Office", "Visitors", "Enquiries", "Reception"],
  },
  {
    key: "lead_management",
    label: "Lead Management",
    category: "School Management",
    displayOrder: 70,
    description: "Admissions pipeline, follow-ups, applications and conversion tracking.",
    requiredViewPermissions: ["lead_management.view"],
    requiredManagementPermissions: ["lead_management.manage"],
    coreAdministrative: false,
    routeAliases: ["Lead Management", "Lead Pipeline Board", "All Leads", "Lead Follow-ups"],
  },
  {
    key: "examinations",
    label: "Examinations",
    category: "Academics",
    displayOrder: 80,
    description: "Offline and online examinations, marks, results and publishing.",
    requiredViewPermissions: ["exams.view"],
    requiredManagementPermissions: ["exams.publish"],
    coreAdministrative: true,
    routeAliases: ["Examinations", "Offline Examinations", "Online Examinations", "Manage Offline Exams", "Results"],
  },
  {
    key: "cbc_academics",
    label: "CBC Academics",
    category: "Academics",
    displayOrder: 90,
    description: "Competency-based curriculum and academic planning.",
    requiredViewPermissions: ["cbc_academics.view"],
    requiredManagementPermissions: ["cbc_academics.manage"],
    coreAdministrative: false,
    routeAliases: ["CBC Academics", "Competency Based Curriculum"],
  },
  {
    key: "human_resources",
    label: "Human Resources",
    category: "People",
    displayOrder: 100,
    description: "Staff records, attendance, payroll, leave and HR administration.",
    requiredViewPermissions: ["human_resources.view"],
    requiredManagementPermissions: ["human_resources.manage"],
    coreAdministrative: false,
    routeAliases: ["Human Resource", "Human Resources", "Staff", "Employee Management"],
  },
  {
    key: "ptm_meetings",
    label: "PTM Meetings",
    category: "Communication",
    displayOrder: 110,
    description: "Parent-teacher meeting schedules, slots and meeting records.",
    requiredViewPermissions: ["ptm_meetings.view"],
    requiredManagementPermissions: ["ptm_meetings.manage"],
    coreAdministrative: false,
    routeAliases: ["PTM Meetings", "Parent Teacher Meetings"],
  },
  {
    key: "lesson_planner",
    label: "Lesson Planner",
    category: "Academics",
    displayOrder: 120,
    description: "Lesson plans, progress tracking and classroom planning.",
    requiredViewPermissions: ["lesson_planner.view"],
    requiredManagementPermissions: ["lesson_planner.manage"],
    coreAdministrative: false,
    routeAliases: ["Lesson Planner", "Lesson Plans"],
  },
  {
    key: "osm",
    label: "OSM Module",
    category: "Academics",
    displayOrder: 130,
    description: "School-specific OSM academic workflows.",
    requiredViewPermissions: ["osm.view"],
    requiredManagementPermissions: ["osm.manage"],
    coreAdministrative: false,
    routeAliases: ["OSM", "OSM Module"],
  },
  {
    key: "assessment",
    label: "Assessment",
    category: "Academics",
    displayOrder: 140,
    description: "Assessments, rubrics, grading and learning outcomes.",
    requiredViewPermissions: ["assessment.view"],
    requiredManagementPermissions: ["assessment.manage"],
    coreAdministrative: false,
    routeAliases: ["Assessment", "Assessments"],
  },
  {
    key: "live_classes",
    label: "Live Classes",
    category: "Academics",
    displayOrder: 150,
    description: "Online classes, class links and live learning schedules.",
    requiredViewPermissions: ["live_classes.view"],
    requiredManagementPermissions: ["live_classes.manage"],
    coreAdministrative: false,
    routeAliases: ["Live Classes", "Online Classes"],
  },
  {
    key: "study_center",
    label: "Study Center",
    category: "Academics",
    displayOrder: 160,
    description: "Study material, learning resources and academic content.",
    requiredViewPermissions: ["study_center.view"],
    requiredManagementPermissions: ["study_center.manage"],
    coreAdministrative: false,
    routeAliases: ["Study Center", "Study Material"],
  },
  {
    key: "certificates",
    label: "Certificates",
    category: "Administration",
    displayOrder: 170,
    description: "Certificate templates, generation and issued-document records.",
    requiredViewPermissions: ["certificates.view"],
    requiredManagementPermissions: ["certificates.manage"],
    coreAdministrative: false,
    routeAliases: ["Certificates", "Generated Documents"],
  },
  {
    key: "communication",
    label: "Communication",
    category: "Communication",
    displayOrder: 180,
    description: "Notices, messages, events, notifications and communication wallet.",
    requiredViewPermissions: ["communication.view"],
    requiredManagementPermissions: ["communication.manage"],
    coreAdministrative: true,
    routeAliases: ["Communication", "Communicate", "Notice Board", "Comms Wallet", "Notifications"],
  },
  {
    key: "library",
    label: "Library",
    category: "Operations",
    displayOrder: 190,
    description: "Books, circulation, requests and library reporting.",
    requiredViewPermissions: ["library.view"],
    requiredManagementPermissions: ["library.manage"],
    coreAdministrative: false,
    routeAliases: ["Library", "Library Dashboard", "Manage Books", "Issue/Return Book"],
  },
  {
    key: "inventory",
    label: "Inventory",
    category: "Operations",
    displayOrder: 200,
    description: "Inventory, suppliers, purchases, stock and issue workflows.",
    requiredViewPermissions: ["inventory.view"],
    requiredManagementPermissions: ["inventory.manage"],
    coreAdministrative: false,
    routeAliases: ["Inventory", "Inventory Dashboard", "Purchase Orders", "Suppliers"],
  },
  {
    key: "transport",
    label: "Transport",
    category: "Operations",
    displayOrder: 210,
    description: "Vehicles, routes, transport fees and live tracking.",
    requiredViewPermissions: ["transport.view"],
    requiredManagementPermissions: ["transport.manage"],
    coreAdministrative: false,
    routeAliases: ["Transport", "Transport Dashboard", "Manage Vehicles", "Manage Routes", "Live Vehicle Tracking"],
  },
  {
    key: "hostel",
    label: "Hostel",
    category: "Operations",
    displayOrder: 220,
    description: "Hostels, rooms, allocations and occupancy.",
    requiredViewPermissions: ["hostel.view"],
    requiredManagementPermissions: ["hostel.manage"],
    coreAdministrative: false,
    routeAliases: ["Hostel", "Hostel Dashboard", "Student Allocation", "Manage Rooms"],
  },
  {
    key: "help_center",
    label: "Help Center",
    category: "Administration",
    displayOrder: 230,
    description: "Knowledge base, support content and school help resources.",
    requiredViewPermissions: ["help_center.view"],
    requiredManagementPermissions: ["help_center.manage"],
    coreAdministrative: false,
    routeAliases: ["Help Center", "Knowledge Base", "Browse Articles", "AI Chatbot"],
  },
  {
    key: "asset_management",
    label: "Asset Management",
    category: "Operations",
    displayOrder: 240,
    description: "Asset register, assignments, depreciation, maintenance and audits.",
    requiredViewPermissions: ["asset_management.view"],
    requiredManagementPermissions: ["asset_management.manage"],
    coreAdministrative: false,
    routeAliases: ["Asset Management", "Asset Dashboard", "Asset Register", "Asset Audits"],
  },
  {
    key: "reports_analytics",
    label: "Reports & Analytics",
    category: "Reporting",
    displayOrder: 250,
    description: "Cross-module reports, analytics and exports.",
    requiredViewPermissions: ["reports.view"],
    requiredManagementPermissions: ["reports.manage"],
    coreAdministrative: true,
    routeAliases: ["Reports & Analytics", "Reports", "Analytics", "Audit Trail"],
  },
  {
    key: "settings_billing",
    label: "Settings & Billing",
    category: "Administration",
    displayOrder: 260,
    description: "School settings, billing preferences and configuration.",
    requiredViewPermissions: ["settings.view"],
    requiredManagementPermissions: ["settings.manage"],
    coreAdministrative: true,
    routeAliases: ["Settings & Billing", "School Settings", "Billing", "My Settings"],
  },
  {
    key: "access_control",
    label: "Access Control",
    category: "Administration",
    displayOrder: 270,
    description: "School users, roles and permission administration.",
    requiredViewPermissions: ["roles.view"],
    requiredManagementPermissions: ["roles.manage"],
    coreAdministrative: true,
    routeAliases: ["Access Control", "Roles & Permissions", "Users and Roles"],
  },
] as const satisfies readonly SchoolModuleDefinition[];

export const defaultEnabledSchoolModuleKeys: ReadonlySet<SchoolModuleKey> = new Set([
  "student_information",
  "fees_finance",
  "attendance",
  "academics",
  "examinations",
  "communication",
  "settings_billing",
  "access_control",
]);

export const appAudiences = ["parent", "student", "transporter"] as const;
export type AppAudience = typeof appAudiences[number];

export type AppFeatureDefinition = Readonly<{
  key: string;
  persona: AppAudience;
  label: string;
  description: string;
  displayOrder: number;
  requiredSchoolModule: SchoolModuleKey | null;
}>;

export const appFeatureCatalogue = [
  { key: "child_overview", persona: "parent", label: "Child Overview", description: "A consolidated overview for linked children.", displayOrder: 10, requiredSchoolModule: "student_information" },
  { key: "attendance", persona: "parent", label: "Attendance", description: "View the linked child's attendance.", displayOrder: 20, requiredSchoolModule: "attendance" },
  { key: "homework", persona: "parent", label: "Homework", description: "View homework and assignments.", displayOrder: 30, requiredSchoolModule: "academics" },
  { key: "timetable", persona: "parent", label: "Timetable", description: "View class and examination timetables.", displayOrder: 40, requiredSchoolModule: "academics" },
  { key: "examinations", persona: "parent", label: "Examinations", description: "View examination schedules.", displayOrder: 50, requiredSchoolModule: "examinations" },
  { key: "results", persona: "parent", label: "Results", description: "View published results.", displayOrder: 60, requiredSchoolModule: "examinations" },
  { key: "fees_payments", persona: "parent", label: "Fees & Payments", description: "View fees and make supported payments.", displayOrder: 70, requiredSchoolModule: "fees_finance" },
  { key: "notices", persona: "parent", label: "Notices", description: "View school notices and alerts.", displayOrder: 80, requiredSchoolModule: "communication" },
  { key: "ptm_meetings", persona: "parent", label: "PTM Meetings", description: "View and manage parent-teacher meeting slots.", displayOrder: 90, requiredSchoolModule: "ptm_meetings" },
  { key: "leave_requests", persona: "parent", label: "Leave Requests", description: "Submit and track student leave requests.", displayOrder: 100, requiredSchoolModule: "front_office" },
  { key: "transport_tracking", persona: "parent", label: "Transport Tracking", description: "Track the vehicle assigned to a linked child.", displayOrder: 110, requiredSchoolModule: "transport" },
  { key: "library", persona: "parent", label: "Library", description: "View linked-child library activity.", displayOrder: 120, requiredSchoolModule: "library" },
  { key: "school_events", persona: "parent", label: "School Events", description: "View school events and announcements.", displayOrder: 130, requiredSchoolModule: "communication" },
  { key: "contact_school", persona: "parent", label: "Contact School", description: "Send an authorized request to the school.", displayOrder: 140, requiredSchoolModule: "communication" },

  { key: "attendance", persona: "student", label: "Attendance", description: "View personal attendance.", displayOrder: 10, requiredSchoolModule: "attendance" },
  { key: "homework", persona: "student", label: "Homework", description: "View assigned homework.", displayOrder: 20, requiredSchoolModule: "academics" },
  { key: "timetable", persona: "student", label: "Timetable", description: "View class timetable.", displayOrder: 30, requiredSchoolModule: "academics" },
  { key: "examinations", persona: "student", label: "Examinations", description: "View examination schedules.", displayOrder: 40, requiredSchoolModule: "examinations" },
  { key: "results", persona: "student", label: "Results", description: "View personal published results.", displayOrder: 50, requiredSchoolModule: "examinations" },
  { key: "notices", persona: "student", label: "Notices", description: "View school notices.", displayOrder: 60, requiredSchoolModule: "communication" },
  { key: "fees_summary", persona: "student", label: "Fees Summary", description: "View a read-only fees summary.", displayOrder: 70, requiredSchoolModule: "fees_finance" },
  { key: "study_material", persona: "student", label: "Study Material", description: "View authorized learning resources.", displayOrder: 80, requiredSchoolModule: "study_center" },
  { key: "live_classes", persona: "student", label: "Live Classes", description: "Join authorized live classes.", displayOrder: 90, requiredSchoolModule: "live_classes" },
  { key: "transport", persona: "student", label: "Transport", description: "View assigned transport details.", displayOrder: 100, requiredSchoolModule: "transport" },
  { key: "library", persona: "student", label: "Library", description: "View personal library activity.", displayOrder: 110, requiredSchoolModule: "library" },

  { key: "assigned_vehicle", persona: "transporter", label: "Assigned Vehicle", description: "View the assigned vehicle.", displayOrder: 10, requiredSchoolModule: "transport" },
  { key: "assigned_route", persona: "transporter", label: "Assigned Route", description: "View assigned routes and stops.", displayOrder: 20, requiredSchoolModule: "transport" },
  { key: "pickup_list", persona: "transporter", label: "Pickup List", description: "View the assigned student pickup list.", displayOrder: 30, requiredSchoolModule: "transport" },
  { key: "trip_control", persona: "transporter", label: "Trip Control", description: "Start and stop authorized trips.", displayOrder: 40, requiredSchoolModule: "transport" },
  { key: "gps_tracking", persona: "transporter", label: "GPS Tracking", description: "Transmit location during an active trip.", displayOrder: 50, requiredSchoolModule: "transport" },
  { key: "boarding", persona: "transporter", label: "Boarding", description: "Record boarding and drop-off events.", displayOrder: 60, requiredSchoolModule: "transport" },
  { key: "emergency_alerts", persona: "transporter", label: "Emergency Alerts", description: "Send authorized emergency alerts.", displayOrder: 70, requiredSchoolModule: "transport" },
  { key: "vehicle_documents", persona: "transporter", label: "Vehicle Documents", description: "View assigned vehicle documents.", displayOrder: 80, requiredSchoolModule: "transport" },
  { key: "fuel_maintenance", persona: "transporter", label: "Fuel & Maintenance", description: "Record authorized fuel and maintenance updates.", displayOrder: 90, requiredSchoolModule: "transport" },
] as const satisfies readonly AppFeatureDefinition[];

export type AppFeatureKey = typeof appFeatureCatalogue[number]["key"];

const moduleByKey = new Map<SchoolModuleKey, SchoolModuleDefinition>(
  schoolModuleCatalogue.map((moduleDefinition) => [moduleDefinition.key, moduleDefinition] as const),
);

const moduleAliases = new Map<string, SchoolModuleKey>();
for (const moduleDefinition of schoolModuleCatalogue) {
  moduleAliases.set(
    normalizeAccessIdentifier(moduleDefinition.key),
    moduleDefinition.key,
  );
  moduleAliases.set(
    normalizeAccessIdentifier(moduleDefinition.label),
    moduleDefinition.key,
  );
  for (const alias of moduleDefinition.routeAliases) {
    moduleAliases.set(
      normalizeAccessIdentifier(alias),
      moduleDefinition.key,
    );
  }
}
moduleAliases.set(normalizeAccessIdentifier("Finance Fees"), "fees_finance");
moduleAliases.set(normalizeAccessIdentifier("Fees Finance"), "fees_finance");
moduleAliases.set(normalizeAccessIdentifier("QR Code Attendance"), "attendance");
moduleAliases.set(normalizeAccessIdentifier("Offline Examinations"), "examinations");
moduleAliases.set(normalizeAccessIdentifier("Online Examinations"), "examinations");
moduleAliases.set(normalizeAccessIdentifier("Communicate"), "communication");
moduleAliases.set(normalizeAccessIdentifier("Comms Wallet"), "communication");

export function normalizeAccessIdentifier(value: string): string {
  return value.replaceAll("&", " ").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}

export function canonicalModuleKey(value: string): SchoolModuleKey | null {
  return moduleAliases.get(normalizeAccessIdentifier(value)) ?? null;
}

export function schoolModuleDefinition(value: string): SchoolModuleDefinition | null {
  const key = canonicalModuleKey(value);
  return key ? moduleByKey.get(key) ?? null : null;
}

export type SchoolModulePolicyInput = Readonly<{
  moduleKey: string;
  enabled: boolean;
}>;

export type EffectiveSchoolModuleAccess = Readonly<{
  module: SchoolModuleDefinition;
  enabledByCompany: boolean;
  permittedByRole: boolean;
  accessible: boolean;
}>;

export function resolveEffectiveSchoolModuleAccess(input: {
  policies: readonly SchoolModulePolicyInput[];
  rolePermissions: ReadonlySet<string>;
}): EffectiveSchoolModuleAccess[] {
  const policies = new Map<SchoolModuleKey, boolean>();
  for (const policy of input.policies) {
    const key = canonicalModuleKey(policy.moduleKey);
    if (key) policies.set(key, policy.enabled);
  }

  return schoolModuleCatalogue.map((module) => {
    const enabledByCompany = policies.get(module.key) ?? false;
    const permittedByRole = module.requiredViewPermissions.every((permission) =>
      input.rolePermissions.has(permission)
    );
    return {
      module,
      enabledByCompany,
      permittedByRole,
      accessible: enabledByCompany && permittedByRole,
    };
  });
}

export function isModuleEntitled(
  entitlements: ReadonlySet<string>,
  requestedModule: string,
): boolean {
  const expected = canonicalModuleKey(requestedModule);
  if (!expected) return false;
  for (const entitlement of entitlements) {
    if (canonicalModuleKey(entitlement) === expected) return true;
  }
  return false;
}

export type AppFeaturePolicyInput = Readonly<{
  audience: AppAudience;
  featureKey: string;
  enabled: boolean;
}>;

export type EffectiveAppFeatureAccess = Readonly<{
  feature: AppFeatureDefinition;
  source: "tenant" | "plan" | "missing";
  enabledByPolicy: boolean;
  dependencySatisfied: boolean;
  accessible: boolean;
}>;

export function resolveEffectiveAppFeatureAccess(input: {
  audience: AppAudience;
  planPolicies: readonly AppFeaturePolicyInput[];
  tenantPolicies: readonly AppFeaturePolicyInput[];
  enabledSchoolModules: ReadonlySet<string>;
}): EffectiveAppFeatureAccess[] {
  const plan = featurePolicyMap(input.planPolicies, input.audience);
  const tenant = featurePolicyMap(input.tenantPolicies, input.audience);

  return appFeatureCatalogue
    .filter((feature) => feature.persona === input.audience)
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((feature) => {
      const tenantValue = tenant.get(feature.key);
      const planValue = plan.get(feature.key);
      const source = tenantValue !== undefined
        ? "tenant"
        : planValue !== undefined
          ? "plan"
          : "missing";
      const enabledByPolicy = tenantValue ?? planValue ?? false;
      const dependencySatisfied = feature.requiredSchoolModule === null
        || isModuleEntitled(input.enabledSchoolModules, feature.requiredSchoolModule);
      return {
        feature,
        source,
        enabledByPolicy,
        dependencySatisfied,
        accessible: enabledByPolicy && dependencySatisfied,
      };
    });
}

function featurePolicyMap(
  policies: readonly AppFeaturePolicyInput[],
  audience: AppAudience,
): Map<string, boolean> {
  const result = new Map<string, boolean>();
  for (const policy of policies) {
    if (policy.audience === audience) result.set(policy.featureKey, policy.enabled);
  }
  return result;
}
