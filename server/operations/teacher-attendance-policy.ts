/** Server-owned assignment policy. Never build these grants from request data.
 * This module is the policy foundation; endpoint/repository integration is pending.
 */
export type AttendanceScope = {
  tenantId: string;
  academicSessionId: string;
  classId: string;
  sectionId: string;
};

export type TeacherAttendanceGrant = AttendanceScope & {
  userId: string;
  active: boolean;
} & ({ kind: "class_teacher" } | { kind: "subject_teacher"; subjectId: string });

export type TeacherAttendanceRequest = AttendanceScope & (
  | { kind: "daily" }
  | { kind: "lesson"; subjectId: string; lessonId: string }
);

export type AttendancePolicyActor = {
  tenantId: string;
  userId: string;
  canManageAttendance: boolean;
  isSchoolAdmin: boolean;
};

export type AttendanceDecision =
  | { allowed: true; basis: "class_assignment" | "subject_assignment" | "admin_override"; auditReason: string }
  | { allowed: false; reason: "invalid_scope" | "permission_denied" | "assignment_required" | "override_reason_required" };

const populated = (value: string) => typeof value === "string" && value.trim().length > 0;

export function evaluateTeacherAttendance(
  actor: AttendancePolicyActor,
  request: TeacherAttendanceRequest,
  grants: readonly TeacherAttendanceGrant[],
  overrideReason?: string,
): AttendanceDecision {
  if (![actor.tenantId, actor.userId, request.tenantId, request.academicSessionId,
    request.classId, request.sectionId].every(populated)
    || !["daily", "lesson"].includes(request.kind)
    || (request.kind === "lesson" && (!populated(request.subjectId) || !populated(request.lessonId)))) {
    return { allowed: false, reason: "invalid_scope" };
  }
  if (actor.tenantId !== request.tenantId || !actor.canManageAttendance) {
    return { allowed: false, reason: "permission_denied" };
  }
  const matching = grants.some((grant) => grant.active
    && grant.userId === actor.userId
    && grant.tenantId === request.tenantId
    && grant.academicSessionId === request.academicSessionId
    && grant.classId === request.classId
    && grant.sectionId === request.sectionId
    && (request.kind === "daily"
      ? grant.kind === "class_teacher"
      : grant.kind === "subject_teacher" && grant.subjectId === request.subjectId));
  if (matching) {
    return { allowed: true,
      basis: request.kind === "daily" ? "class_assignment" : "subject_assignment",
      auditReason: request.kind === "daily" ? "Assigned class teacher" : "Assigned subject teacher" };
  }
  if (!actor.isSchoolAdmin) return { allowed: false, reason: "assignment_required" };
  const reason = overrideReason?.trim() ?? "";
  if (reason.length < 3 || reason.length > 240) {
    return { allowed: false, reason: "override_reason_required" };
  }
  return { allowed: true, basis: "admin_override", auditReason: reason };
}
