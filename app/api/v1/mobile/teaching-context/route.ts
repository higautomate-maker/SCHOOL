import { mobileJson } from "../../../../../server/mobile-auth/http.ts";
import { authenticatedMobilePrincipal, effectiveAccessForPrincipal } from "../../../../../server/mobile-auth/service.ts";
import { mobileAppErrorResponse } from "../../../../../server/mobile-app/http.ts";
import { repositoryBackend } from "../../../../../server/runtime/repository-backend.ts";
import { getTeacherContexts, setTeacherAssignment } from "../../../../../server/operations/teacher-assignment-repository.ts";
import { requireAssignmentAdministrator, teacherAssignmentSchema } from "../../../../../server/operations/teacher-assignment-validation.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await authenticatedMobilePrincipal(request);
    if (!principal) return mobileJson({ error: "Authentication required" }, 401);
    if (principal.principalType !== "school") return mobileJson({ error: "School identity required" }, 403);
    const access = await effectiveAccessForPrincipal(principal);
    const attendance = access.modules.find((item) => item.key === "attendance");
    const academics = access.modules.find((item) => item.key === "academics");
    if (!attendance && !academics && !access.modules.some(m => m.key === 'study_center')) return mobileJson({ error: "Teaching access denied" }, 403);
    if (repositoryBackend() !== "postgres") return mobileJson({ error: "Teaching assignments unavailable" }, 503);
    // No userId or tenantId query override: teachers can read only their own grants.
    const contexts = await getTeacherContexts(principal.tenantId, principal.userId);
    return mobileJson({ contexts, canManageAttendance: attendance?.canManage === true,
      canManageAssignments: principal.roleKey === "school_admin" && academics?.canManage === true });
  } catch (error) {
    return mobileAppErrorResponse(error, "Teaching assignments unavailable");
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const principal = await authenticatedMobilePrincipal(request);
    if (!principal) return mobileJson({ error: "Authentication required" }, 401);
    const access = await effectiveAccessForPrincipal(principal);
    requireAssignmentAdministrator(principal, access.modules.some((item) => item.key === "academics" && item.canManage));
    const input = teacherAssignmentSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return mobileJson({ error: "Invalid teacher assignment" }, 400);
    if (repositoryBackend() !== "postgres") return mobileJson({ error: "Teaching assignments unavailable" }, 503);
    return mobileJson({ assignment: await setTeacherAssignment(principal.tenantId, principal.userId, input.data) });
  } catch (error) {
    return mobileAppErrorResponse(error, "Teacher assignment update failed");
  }
}
