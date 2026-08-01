import { z } from "zod";
import { authorize, authErrorResponse } from "../../../../../../../../server/auth/authorization.ts";
import { noStoreHeaders } from "../../../../../../../../server/auth/cookies.ts";
import { policies } from "../../../../../../../../server/auth/policies.ts";
import { markNotificationRead } from "../../../../../../../../server/notifications/inbox.ts";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ schoolId: string; notificationId: string }> };

export async function POST(request: Request, context: Context) {
  const { schoolId, notificationId } = await context.params;
  let actor;
  try {
    actor = await authorize(request, policies.notificationsRead, schoolId);
  } catch (error) {
    return authErrorResponse(error);
  }

  const parsedId = z.string().uuid().safeParse(notificationId);
  if (!parsedId.success) {
    return Response.json(
      { error: "Notification not found" },
      { status: 404, headers: noStoreHeaders() },
    );
  }

  try {
    const result = await markNotificationRead({
      tenantId: schoolId,
      userId: actor.userId,
      notificationId: parsedId.data,
    });
    return result
      ? Response.json({ notification: { ...result, read: true } }, { headers: noStoreHeaders() })
      : Response.json(
          { error: "Notification not found" },
          { status: 404, headers: noStoreHeaders() },
        );
  } catch {
    return Response.json(
      { error: "Notification could not be updated" },
      { status: 503, headers: noStoreHeaders() },
    );
  }
}
