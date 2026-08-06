import type { ChatGPTUser } from "../../app/chatgpt-auth.ts";
import { validIdempotencyKey } from "../http/idempotency.ts";
import {
  effectiveAccessForPrincipal,
  activeAssignmentsForPrincipal,
} from "../mobile-auth/service.ts";
import type {
  MobileAccessSummary,
  MobileAssignment,
  MobileAuthenticatedPrincipal,
} from "../mobile-auth/types.ts";
import {
  listMobileNotificationInbox,
  markMobileNotificationRead,
} from "../notifications/inbox.ts";
import {
  applyOperation,
  getOperations,
  type OperationsState,
} from "../operations/repository.ts";
import { operationActionSchema } from "../operations/validation.ts";
import { privacyHash } from "../auth/crypto.ts";
import { listStudents, type StudentRecord } from "../students/repository.ts";
import { loadDriverTransportSnapshot } from "../transport/repository.ts";
import {
  applyWorkspaceAction,
  getWorkspace,
  getWorkspaceRecordModuleKey,
  type ModuleRecord,
  type WorkspaceState,
} from "../workspace/repository.ts";
import { moduleKeys, type WorkspaceAction } from "../workspace/validation.ts";
import { encryptMobilePushToken } from "./crypto.ts";
import {
  listMobileTransportEvents,
  recordMobileTransportEvent,
  registerMobileDevice,
  revokeMobileDevice,
} from "./repository.ts";
import {
  mobileContentActionSchema,
  mobileContentQuerySchema,
  mobileDeviceRegistrationSchema,
  mobileTransportEventSchema,
} from "./validation.ts";

const featureWorkspaceModule: Record<string, string> = {
  child_overview: "Student Information",
  homework: "Study Center",
  timetable: "Academics",
  examinations: "Offline Examinations",
  results: "Assessment",
  notices: "Communicate",
  ptm_meetings: "PTM Meetings",
  leave_requests: "Front Office",
  transport_tracking: "Transport",
  library: "Library",
  school_events: "Communicate",
  contact_school: "Communicate",
  study_material: "Study Center",
  live_classes: "Live Classes",
  transport: "Transport",
  assigned_vehicle: "Transport",
  assigned_route: "Transport",
  pickup_list: "Transport",
  trip_control: "Transport",
  gps_tracking: "Transport",
  boarding: "Transport",
  emergency_alerts: "Transport",
  vehicle_documents: "Transport",
  fuel_maintenance: "Transport",
};

const schoolWorkspaceModule: Record<string, string> = {
  fees_finance: "Finance & Fees",
  student_information: "Student Information",
  academics: "Academics",
  front_office: "Front Office",
  lead_management: "Lead Management",
  examinations: "Offline Examinations",
  human_resources: "Human Resource",
  ptm_meetings: "PTM Meetings",
  lesson_planner: "Lesson Planner",
  osm: "OSM Module",
  attendance: "QR Code Attendance",
  assessment: "Assessment",
  live_classes: "Live Classes",
  study_center: "Study Center",
  certificates: "Certificates",
  communication: "Communicate",
  library: "Library",
  inventory: "Inventory",
  transport: "Transport",
  hostel: "Hostel",
  help_center: "Help Center",
  asset_management: "Asset Management",
  reports_analytics: "Reports & Analytics",
  settings_billing: "Settings & Billing",
};

export async function mobileHomeSnapshot(
  principal: MobileAuthenticatedPrincipal,
): Promise<Record<string, unknown>> {
  const access = await effectiveAccessForPrincipal(principal);
  const assignments = await activeAssignmentsForPrincipal(principal);
  const students = await allowedStudents(principal, access, assignments);
  const notifications = await mobileNotifications(principal, assignments, 5, false);
  const transportEvents = principal.principalType === "transporter"
    ? await listMobileTransportEvents(principal, 20)
    : [];
  return {
    generatedAt: new Date().toISOString(),
    tenantId: principal.tenantId,
    principalType: principal.principalType,
    user: {
      id: principal.userId,
      email: principal.email,
      name: principal.fullName,
    },
    access,
    students,
    assignments,
    notifications,
    transportEvents,
    offlinePolicy: {
      cacheReads: true,
      queueWrites: true,
      maximumQueueAgeHours: 72,
      conflictResolution: "server_authoritative",
    },
  };
}

export async function mobileOperationsSnapshot(
  principal: MobileAuthenticatedPrincipal,
): Promise<OperationsState> {
  const access = await effectiveAccessForPrincipal(principal);
  const operations = await getOperations(principal.tenantId);
  if (principal.principalType === "school") {
    return filterSchoolOperations(access, operations);
  }
  if (principal.principalType !== "parent" && principal.principalType !== "student") {
    return emptyOperations();
  }
  const featureKeys = new Set(access.features.map((feature) => feature.key));
  const assignments = await activeAssignmentsForPrincipal(principal);
  const studentIds = new Set(
    assignments.filter((entry) => entry.resourceType === "student")
      .map((entry) => entry.resourceId),
  );
  const attendanceAllowed = featureKeys.has("attendance");
  const feesAllowed = featureKeys.has("fees_payments") || featureKeys.has("fees_summary");
  const attendance = attendanceAllowed
    ? operations.attendance.filter((row) => studentIds.has(row.studentId))
    : [];
  const invoices = feesAllowed
    ? operations.invoices.filter((row) => studentIds.has(row.studentId))
    : [];
  const invoiceIds = new Set(invoices.map((row) => row.id));
  const payments = feesAllowed
    ? operations.payments.filter((row) => invoiceIds.has(row.invoiceId))
    : [];
  return summarizeOperations(attendance, invoices, payments);
}

export async function performMobileOperation(
  principal: MobileAuthenticatedPrincipal,
  value: unknown,
  idempotencyKey: string | null,
): Promise<OperationsState> {
  if (principal.principalType !== "school") throw new Error("School identity required");
  if (!idempotencyKey || !validIdempotencyKey(idempotencyKey)) {
    throw new Error("A valid Idempotency-Key header is required");
  }
  const action = operationActionSchema.parse(value);
  const access = await effectiveAccessForPrincipal(principal);
  const requiredModule = action.action === "mark_attendance" ? "attendance" : "fees_finance";
  requireSchoolModule(access, requiredModule, true);
  return filterSchoolOperations(
    access,
    await applyOperation(
      principal.tenantId,
      action,
      mobileActor(principal),
      idempotencyKey,
    ),
  );
}

export async function mobileContentSnapshot(
  principal: MobileAuthenticatedPrincipal,
  searchParams: URLSearchParams,
): Promise<{ moduleKey: string; records: ModuleRecord[]; metrics: WorkspaceState["metrics"] }> {
  const query = mobileContentQuerySchema.parse({
    featureKey: searchParams.get("featureKey") ?? undefined,
    moduleKey: searchParams.get("moduleKey") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  const access = await effectiveAccessForPrincipal(principal);
  const moduleKey = resolveWorkspaceModule(principal, access, query.featureKey, query.moduleKey);
  const workspace = await getWorkspace(principal.tenantId, moduleKey);
  const assignments = await activeAssignmentsForPrincipal(principal);
  const students = await allowedStudents(principal, access, assignments);
  const records = principal.principalType === "school"
    ? workspace.records
    : filterPersonaRecords(workspace.records, students, assignments, moduleKey);
  return {
    moduleKey,
    records: records.slice(0, query.limit),
    metrics: summarizeWorkspace(records),
  };
}

export async function performMobileContentAction(
  principal: MobileAuthenticatedPrincipal,
  value: unknown,
): Promise<{ moduleKey: string; records: ModuleRecord[]; metrics: WorkspaceState["metrics"] }> {
  const action = mobileContentActionSchema.parse(value);
  const access = await effectiveAccessForPrincipal(principal);
  if (action.action === "parent_request") {
    if (principal.principalType !== "parent") throw new Error("Parent identity required");
    const assignments = await activeAssignmentsForPrincipal(principal);
    if (!assignments.some((entry) => entry.resourceType === "student" && entry.resourceId === action.studentId)) {
      throw new Error("Student assignment required");
    }
    const featureKey = action.requestType === "leave_request"
      ? "leave_requests"
      : action.requestType === "ptm_request"
        ? "ptm_meetings"
        : "contact_school";
    requireFeature(access, featureKey);
    const moduleKey = featureWorkspaceModule[featureKey];
    const workspaceAction: WorkspaceAction = {
      action: "create_record",
      moduleKey: workspaceModuleKey(moduleKey),
      workflow: action.requestType.replaceAll("_", " "),
      title: action.title,
      description: `[Mobile request for student ${action.studentId}] ${action.description}`,
      recordDate: new Date().toISOString().slice(0, 10),
      dueDate: "",
      amountPaise: null,
      assignee: "School Administration",
      priority: action.requestType === "leave_request" ? "high" : "normal",
    } as WorkspaceAction;
    const workspace = await applyWorkspaceAction(principal.tenantId, workspaceAction, mobileActor(principal));
    return { moduleKey, records: workspace.records, metrics: workspace.metrics };
  }

  if (principal.principalType !== "school") throw new Error("School identity required");
  const requestedModule = action.action === "create_record"
    ? action.moduleKey
    : await getWorkspaceRecordModuleKey(principal.tenantId, action.recordId);
  if (!requestedModule) throw new Error("Workspace record not found");
  const canonical = access.modules.some((entry) => entry.key === requestedModule)
    ? requestedModule
    : schoolModuleForWorkspace(requestedModule);
  requireSchoolModule(access, canonical, true);
  const moduleKey = schoolWorkspaceModule[canonical] ?? requestedModule;
  const workspaceAction: WorkspaceAction = action.action === "create_record"
    ? { ...action, moduleKey: workspaceModuleKey(moduleKey) }
    : action;
  const workspace = await applyWorkspaceAction(principal.tenantId, workspaceAction, mobileActor(principal));
  return {
    moduleKey,
    records: workspace.records,
    metrics: workspace.metrics,
  };
}

export async function mobileNotifications(
  principal: MobileAuthenticatedPrincipal,
  assignments: MobileAssignment[] | null,
  limit: number,
  unreadOnly: boolean,
) {
  const active = assignments ?? await activeAssignmentsForPrincipal(principal);
  const recipientIds = principal.principalType === "school"
    ? []
    : active.map((entry) => entry.resourceId);
  const recipientTypes = principal.principalType === "school"
    ? []
    : [principal.principalType === "transporter" ? "driver" : principal.principalType];
  return listMobileNotificationInbox({
    tenantId: principal.tenantId,
    userId: principal.userId,
    recipientTypes,
    recipientIds,
    includeSchoolAudience: principal.principalType === "school",
    limit,
    unreadOnly,
  });
}

export async function readMobileNotification(
  principal: MobileAuthenticatedPrincipal,
  notificationId: string,
) {
  const assignments = await activeAssignmentsForPrincipal(principal);
  return markMobileNotificationRead({
    tenantId: principal.tenantId,
    userId: principal.userId,
    notificationId,
    recipientTypes: principal.principalType === "school"
      ? []
      : [principal.principalType === "transporter" ? "driver" : principal.principalType],
    recipientIds: assignments.map((entry) => entry.resourceId),
    includeSchoolAudience: principal.principalType === "school",
  });
}

export async function registerMobilePushDevice(
  principal: MobileAuthenticatedPrincipal,
  value: unknown,
) {
  const input = mobileDeviceRegistrationSchema.parse(value);
  return registerMobileDevice(principal, {
    ...input,
    tokenHash: privacyHash(input.token),
    tokenCiphertext: encryptMobilePushToken(input.token),
  });
}

export async function unregisterMobilePushDevice(
  principal: MobileAuthenticatedPrincipal,
  value: unknown,
): Promise<boolean> {
  const parsed = mobileDeviceRegistrationSchema.pick({ token: true }).parse(value);
  return revokeMobileDevice(principal, privacyHash(parsed.token));
}

export async function mobileTransportSnapshot(principal: MobileAuthenticatedPrincipal) {
  if (principal.principalType !== "transporter") throw new Error("Transporter identity required");
  const access = await effectiveAccessForPrincipal(principal);
  requireFeature(access, "assigned_route");
  const assignments = await activeAssignmentsForPrincipal(principal);
  const assignment = await loadDriverTransportSnapshot(principal);
  const students = assignment?.students ?? await allowedStudents(
    principal,
    access,
    assignments,
  );
  return {
    assignment,
    assignments,
    students,
    events: await listMobileTransportEvents(principal, 100),
    trackingPolicy: {
      mode: "foreground_only",
      backgroundTracking: false,
      geofencing: false,
      retentionAutomation: false,
      stage10Required: true,
    },
  };
}

export async function performMobileTransportEvent(
  principal: MobileAuthenticatedPrincipal,
  value: unknown,
  idempotencyKey: string | null,
) {
  if (principal.principalType !== "transporter") throw new Error("Transporter identity required");
  if (!idempotencyKey || !validIdempotencyKey(idempotencyKey)) {
    throw new Error("A valid Idempotency-Key header is required");
  }
  const input = mobileTransportEventSchema.parse(value);
  if (input.metadata.background === true) {
    throw new Error("Background tracking is reserved for Stage 10");
  }
  const access = await effectiveAccessForPrincipal(principal);
  const requiredFeature = input.eventType === "location"
    ? "gps_tracking"
    : input.eventType === "student_boarded" || input.eventType === "student_dropped"
      ? "boarding"
      : input.eventType === "sos"
        ? "emergency_alerts"
        : "trip_control";
  requireFeature(access, requiredFeature);
  const assignments = await activeAssignmentsForPrincipal(principal);
  const transport = await loadDriverTransportSnapshot(principal);
  const tripAllowed = !input.tripId ||
    hasAssignment(assignments, "trip", input.tripId) ||
    transport?.trip?.id === input.tripId;
  if (!tripAllowed) throw new Error("Trip assignment required");

  const studentAllowed = !input.studentId ||
    hasAssignment(assignments, "student", input.studentId) ||
    transport?.students.some((student) => student.id === input.studentId) === true;
  if (!studentAllowed) throw new Error("Student assignment required");
  return recordMobileTransportEvent(principal, { ...input, idempotencyKey });
}

function mobileActor(principal: MobileAuthenticatedPrincipal): ChatGPTUser {
  return {
    displayName: principal.fullName,
    fullName: principal.fullName,
    email: principal.email,
  };
}

async function allowedStudents(
  principal: MobileAuthenticatedPrincipal,
  access: MobileAccessSummary,
  assignments: MobileAssignment[],
): Promise<StudentRecord[]> {
  if (principal.principalType === "school") {
    return access.modules.some((entry) => entry.key === "student_information")
      ? (await listStudents(principal.tenantId)).slice(0, 500)
      : [];
  }
  const ids = new Set(
    assignments.filter((entry) => entry.resourceType === "student")
      .map((entry) => entry.resourceId),
  );
  if (!ids.size) return [];
  return (await listStudents(principal.tenantId)).filter((student) => ids.has(student.id));
}

function filterSchoolOperations(
  access: MobileAccessSummary,
  operations: OperationsState,
): OperationsState {
  const attendance = access.modules.some((entry) => entry.key === "attendance")
    ? operations.attendance
    : [];
  const invoices = access.modules.some((entry) => entry.key === "fees_finance")
    ? operations.invoices
    : [];
  const invoiceIds = new Set(invoices.map((entry) => entry.id));
  const payments = operations.payments.filter((entry) => invoiceIds.has(entry.invoiceId));
  return summarizeOperations(attendance, invoices, payments);
}

function summarizeOperations(
  attendance: OperationsState["attendance"],
  invoices: OperationsState["invoices"],
  payments: OperationsState["payments"],
): OperationsState {
  const today = new Date().toISOString().slice(0, 10);
  const todays = attendance.filter((row) => row.attendanceDate === today);
  const invoicedPaise = invoices.reduce((sum, row) => sum + row.amountPaise, 0);
  const collectedPaise = invoices.reduce((sum, row) => sum + row.paidPaise, 0);
  return {
    attendance,
    invoices,
    payments,
    metrics: {
      present: todays.filter((row) => row.status === "present").length,
      absent: todays.filter((row) => row.status === "absent").length,
      late: todays.filter((row) => row.status === "late").length,
      attendanceMarked: todays.length,
      invoicedPaise,
      collectedPaise,
      outstandingPaise: invoicedPaise - collectedPaise,
    },
  };
}

function emptyOperations(): OperationsState {
  return summarizeOperations([], [], []);
}

function resolveWorkspaceModule(
  principal: MobileAuthenticatedPrincipal,
  access: MobileAccessSummary,
  featureKey?: string,
  moduleKey?: string,
): string {
  if (principal.principalType === "school") {
    if (!moduleKey) throw new Error("moduleKey is required for School identities");
    requireSchoolModule(access, moduleKey, false);
    return schoolWorkspaceModule[moduleKey] ?? moduleKey;
  }
  if (!featureKey) throw new Error("featureKey is required for mobile personas");
  requireFeature(access, featureKey);
  const resolved = featureWorkspaceModule[featureKey];
  if (!resolved) throw new Error("Feature data is not available");
  return resolved;
}

function requireFeature(access: MobileAccessSummary, featureKey: string): void {
  if (!access.features.some((entry) => entry.key === featureKey)) {
    throw new Error("Feature access denied");
  }
}

function requireSchoolModule(
  access: MobileAccessSummary,
  moduleKey: string,
  manage: boolean,
): void {
  const moduleAccess = access.modules.find((entry) => entry.key === moduleKey);
  if (!moduleAccess || (manage && !moduleAccess.canManage)) {
    throw new Error("Module access denied");
  }
}

function workspaceModuleKey(value: string): typeof moduleKeys[number] {
  const found = moduleKeys.find((entry) => entry.toLowerCase() === value.trim().toLowerCase());
  if (!found) throw new Error("Unknown workspace module");
  return found;
}

function schoolModuleForWorkspace(moduleKey: string): string {
  const normalized = moduleKey.trim().toLowerCase().replaceAll("&", " ").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const entry = Object.entries(schoolWorkspaceModule).find(([, value]) =>
    value.toLowerCase() === moduleKey.toLowerCase()
  );
  return entry?.[0] ?? normalized;
}

function filterPersonaRecords(
  records: ModuleRecord[],
  students: StudentRecord[],
  assignments: MobileAssignment[],
  moduleKey: string,
): ModuleRecord[] {
  const allowed = new Set<string>(["schoolwide", "all", "all students", "everyone"]);
  for (const student of students) {
    allowed.add(normalize(student.id));
    allowed.add(normalize(student.fullName));
    allowed.add(normalize(student.className));
    allowed.add(normalize(`${student.className} ${student.sectionName}`));
  }
  for (const assignment of assignments) allowed.add(normalize(assignment.resourceId));
  const schoolwideModule = moduleKey === "Communicate" || moduleKey === "Transport";
  return records.filter((record) => {
    const assignee = normalize(record.assignee);
    if (!assignee) return false;
    if (schoolwideModule && allowed.has(assignee)) return true;
    return !["schoolwide", "all", "all students", "everyone"].includes(assignee)
      && allowed.has(assignee);
  });
}

function summarizeWorkspace(records: ModuleRecord[]): WorkspaceState["metrics"] {
  const today = new Date().toISOString().slice(0, 10);
  return {
    total: records.length,
    open: records.filter((record) => record.status === "open").length,
    inProgress: records.filter((record) => record.status === "in_progress").length,
    completed: records.filter((record) => record.status === "completed").length,
    urgent: records.filter((record) => record.priority === "urgent" && !["completed", "cancelled"].includes(record.status)).length,
    overdue: records.filter((record) => Boolean(record.dueDate && record.dueDate < today) && !["completed", "cancelled"].includes(record.status)).length,
    amountPaise: records.reduce((sum, record) => sum + (record.amountPaise ?? 0), 0),
  };
}

function hasAssignment(
  assignments: MobileAssignment[],
  resourceType: MobileAssignment["resourceType"],
  resourceId: string,
): boolean {
  return assignments.some((entry) => entry.resourceType === resourceType && entry.resourceId === resourceId);
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
