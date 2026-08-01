import { authorize, authErrorResponse } from "../../../../../../server/auth/authorization.ts";
import { noStoreHeaders } from "../../../../../../server/auth/cookies.ts";
import { policies } from "../../../../../../server/auth/policies.ts";
import {
  listNotificationInbox,
  parseNotificationListQuery,
} from "../../../../../../server/notifications/inbox.ts";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ schoolId: string }> };

export async function GET(request: Request, context: Context) {
  const { schoolId } = await context.params;
  let actor;
  try {
    actor = await authorize(request, policies.notificationsView, schoolId);
  } catch (error) {
    return authErrorResponse(error);
  }

  const parsed = parseNotificationListQuery(new URL(request.url).searchParams);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid notification pagination" },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  try {
    const page = await listNotificationInbox({
      tenantId: schoolId,
      userId: actor.userId,
      ...parsed.data,
    });
    return Response.json(page, { headers: noStoreHeaders() });
  } catch {
    return Response.json(
      { error: "Notifications could not be loaded" },
      { status: 503, headers: noStoreHeaders() },
    );
  }
}
