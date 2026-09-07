import { mobileJson } from "../../../../../server/mobile-auth/http.ts";
import { z } from "zod";
import { authenticatedMobilePrincipal, effectiveAccessForPrincipal } from "../../../../../server/mobile-auth/service.ts";
import { mobileAppErrorResponse } from "../../../../../server/mobile-app/http.ts";
import { validIdempotencyKey } from "../../../../../server/http/idempotency.ts";
import { readLessonAttendance, saveLessonAttendance } from "../../../../../server/operations/lesson-attendance-repository.ts";
import { lessonAttendanceSchema } from "../../../../../server/operations/lesson-attendance-validation.ts";
import { repositoryBackend } from "../../../../../server/runtime/repository-backend.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await authenticatedMobilePrincipal(request);
    if (!principal) return mobileJson({ error: "Authentication required" }, 401);
    const access = await effectiveAccessForPrincipal(principal);
    if (principal.principalType !== "school" || !access.modules.some(m => m.key === "attendance")) {
      return mobileJson({ error: "Request rejected" }, 403);
    }
    if (repositoryBackend() !== "postgres") return mobileJson({ error: "Lesson attendance unavailable" }, 503);
    const date = z.iso.date().safeParse(new URL(request.url).searchParams.get('date'));
    if (!date.success) return mobileJson({ error: "Invalid attendance date" }, 400);
    return mobileJson({ attendance: await readLessonAttendance(principal.tenantId, principal.userId, date.data) });
  } catch (error) { return mobileAppErrorResponse(error, "Lesson attendance unavailable"); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const principal = await authenticatedMobilePrincipal(request);
    if (!principal) return mobileJson({ error: "Authentication required" }, 401);
    if (principal.principalType !== "school") return mobileJson({ error: "School identity required" }, 403);
    const key = request.headers.get("idempotency-key");
    if (!key || !validIdempotencyKey(key)) return mobileJson({ error: "Invalid request" }, 400);
    const input = lessonAttendanceSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return mobileJson({ error: "Invalid lesson attendance" }, 400);
    const access = await effectiveAccessForPrincipal(principal);
    const attendance = access.modules.find((module) => module.key === "attendance");
    if (attendance?.canManage !== true) return mobileJson({ error: "Request rejected" }, 403);
    if (repositoryBackend() !== "postgres") return mobileJson({ error: "Lesson attendance unavailable" }, 503);
    const result = await saveLessonAttendance({
      tenantId: principal.tenantId,
      userId: principal.userId,
      email: principal.email,
      fullName: principal.fullName,
      canManageAttendance: true,
      isSchoolAdmin: principal.roleKey === "school_admin",
    }, input.data, key);
    return mobileJson({ lessonAttendance: result });
  } catch (error) {
    return mobileAppErrorResponse(error, "Lesson attendance unavailable");
  }
}
