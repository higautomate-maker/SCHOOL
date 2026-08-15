// Read-only, role-aware "Today" summary builder.
//
// This module is PURE: it turns already-authorized aggregate counts into a
// small list of summary tiles. It performs NO data access and NO authorization
// by itself — callers must pass only counts the user is already permitted to
// see (tenant + role + module/feature enforcement happens upstream). It returns
// COUNTS ONLY (never records, names, amounts of individuals, or cross-role
// data), and always yields safe zero-states.

export type TodayRole =
  | "company"
  | "school"
  | "teacher"
  | "parent"
  | "student"
  | "transporter";

export type TodaySummaryItem = {
  key: string;
  label: string;
  count: number;
  hint: string;
};

export type TodaySummary = {
  role: TodayRole;
  generatedAt: string;
  items: TodaySummaryItem[];
  empty: boolean;
};

// Authorized aggregate inputs. Every field is optional; a missing/undefined
// value means "not authorized or not applicable" and the related tile is
// omitted. A present value of 0 is shown as a safe zero-state tile.
export type TodayInputs = {
  // Access gates (already resolved upstream).
  featureKeys?: ReadonlySet<string>;
  moduleKeys?: ReadonlySet<string>;
  isPlatformAdmin?: boolean;

  // Shared
  unreadNotices?: number;

  // Company (platform)
  schoolsActive?: number;
  subscriptionsDueSoon?: number;
  securityAlertsOpen?: number;

  // School / Teacher
  attendanceToMark?: number;
  homeworkDueToday?: number;
  ptmToday?: number;
  feesOutstandingCount?: number;
  tasksOverdue?: number;

  // Parent / Student
  childAbsencesToday?: number;
  homeworkPending?: number;
  feesDue?: number;
  examsThisWeek?: number;

  // Transporter
  tripActive?: boolean;
  studentsToBoard?: number;
  sosOpen?: number;
};

function push(
  items: TodaySummaryItem[],
  gate: boolean,
  value: number | undefined,
  key: string,
  label: string,
  hint: string,
): void {
  if (!gate || value === undefined) return;
  items.push({ key, label, count: Math.max(0, Math.trunc(value)), hint });
}

export function buildTodaySummary(
  role: TodayRole,
  inputs: TodayInputs,
  now: Date = new Date(),
): TodaySummary {
  const features = inputs.featureKeys ?? new Set<string>();
  const modules = inputs.moduleKeys ?? new Set<string>();
  const items: TodaySummaryItem[] = [];

  if (role === "company") {
    const admin = inputs.isPlatformAdmin === true;
    push(items, admin, inputs.schoolsActive, "schools_active", "Active schools", "Schools currently live on the platform");
    push(items, admin, inputs.subscriptionsDueSoon, "subscriptions_due", "Renewals due soon", "Subscriptions needing attention");
    push(items, admin, inputs.securityAlertsOpen, "security_alerts", "Security alerts", "Open items in the audit/security feed");
  } else if (role === "school" || role === "teacher") {
    push(items, modules.has("attendance"), inputs.attendanceToMark, "attendance_to_mark", "Attendance to mark", "Classes still to be marked today");
    push(items, modules.has("academics") || modules.has("lesson_planner"), inputs.homeworkDueToday, "homework_due", "Homework due today", "Homework items due today");
    push(items, modules.has("ptm_meetings"), inputs.ptmToday, "ptm_today", "PTMs today", "Parent meetings scheduled today");
    push(items, modules.has("fees_finance"), inputs.feesOutstandingCount, "fees_outstanding", "Fees outstanding", "Invoices with a balance");
    push(items, true, inputs.tasksOverdue, "tasks_overdue", "Tasks overdue", "Workspace items past their due date");
    push(items, modules.has("communication"), inputs.unreadNotices, "unread_notices", "Unread notices", "New notices you haven’t opened");
  } else if (role === "parent" || role === "student") {
    push(items, features.has("attendance"), inputs.childAbsencesToday, "attendance_today", role === "parent" ? "Absences today" : "Attendance flags", "Attendance needing attention today");
    push(items, features.has("homework"), inputs.homeworkPending, "homework_pending", "Homework pending", "Homework not yet completed");
    push(items, features.has("examinations") || features.has("results"), inputs.examsThisWeek, "exams_week", "Exams this week", "Upcoming examinations");
    push(items, features.has("fees_payments") || features.has("fees_summary"), inputs.feesDue, "fees_due", "Fees due", "Invoices with a balance");
    push(items, features.has("notices"), inputs.unreadNotices, "unread_notices", "Unread notices", "New notices you haven’t opened");
  } else if (role === "transporter") {
    if (features.has("trip_control")) {
      items.push({ key: "trip_status", label: inputs.tripActive ? "Trip in progress" : "No active trip", count: inputs.tripActive ? 1 : 0, hint: inputs.tripActive ? "You have a trip running" : "Start your assigned trip when ready" });
    }
    push(items, features.has("boarding"), inputs.studentsToBoard, "students_to_board", "Students to board", "Students not yet boarded on this trip");
    push(items, features.has("emergency_alerts"), inputs.sosOpen, "sos_open", "Open SOS alerts", "Emergency alerts awaiting resolution");
  }

  return {
    role,
    generatedAt: now.toISOString(),
    items,
    empty: items.length === 0,
  };
}
