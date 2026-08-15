import { authorize, authErrorResponse } from "../../../../../../server/auth/authorization.ts";
import { noStoreHeaders } from "../../../../../../server/auth/cookies.ts";
import { policies } from "../../../../../../server/auth/policies.ts";
import { isModuleEntitled } from "../../../../../../server/access/catalogue.ts";
import { getWorkspace } from "../../../../../../server/workspace/repository";
import { filterWorkspaceForActor } from "../../../../../../server/workspace/access.ts";
import { listNotificationInbox } from "../../../../../../server/notifications/inbox.ts";
import { buildTodaySummary, type TodayInputs } from "../../../../../../server/mobile-app/today-summary.ts";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ schoolId: string }> };

// Read-only, role-aware "Today" summary for the School web dashboard.
// Tenant + role enforcement via authorize(); each tile is additionally gated by
// the actor's module entitlement AND view permission (fail-closed). Counts only.
const VIEW_PERMISSION: Record<string, string> = {
  attendance: "attendance.view",
  fees_finance: "fees.view",
  communication: "communication.view",
  academics: "academics.view",
  lesson_planner: "lesson_planner.view",
  ptm_meetings: "ptm_meetings.view",
};

export async function GET(request: Request, context: Context) {
  const { schoolId } = await context.params;
  let actor;
  try {
    actor = await authorize(request, policies.workspaceView, schoolId);
  } catch (error) {
    return authErrorResponse(error);
  }

  try {
    const moduleKeys = new Set<string>();
    for (const [key, permission] of Object.entries(VIEW_PERMISSION)) {
      if (isModuleEntitled(actor.moduleEntitlements, key) && actor.rolePermissions.has(permission)) {
        moduleKeys.add(key);
      }
    }

    const workspace = filterWorkspaceForActor(
      await getWorkspace(schoolId, "Dashboard", null),
      actor,
    );

    const inputs: TodayInputs = {
      moduleKeys,
      tasksOverdue: workspace.metrics.overdue,
    };
    if (moduleKeys.has("communication")) {
      const inbox = await listNotificationInbox({ tenantId: schoolId, userId: actor.userId, limit: 1, cursor: null, unreadOnly: false });
      inputs.unreadNotices = inbox.unreadCount;
    }

    return Response.json(
      { today: buildTodaySummary("school", inputs) },
      { headers: noStoreHeaders() },
    );
  } catch {
    return Response.json(
      { error: "Today summary could not be loaded" },
      { status: 503, headers: noStoreHeaders() },
    );
  }
}
