import { mobileJson } from "../../../../../../../server/mobile-auth/http.ts";
import { authenticatedMobilePrincipal } from "../../../../../../../server/mobile-auth/service.ts";
import { readMobileNotification } from "../../../../../../../server/mobile-app/service.ts";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ notificationId: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  const { notificationId } = await context.params;
  try {
    const principal = await authenticatedMobilePrincipal(request);
    if (!principal) return mobileJson({ error: "Authentication required" }, 401);
    const result = await readMobileNotification(principal, notificationId);
    return result
      ? mobileJson({ notification: { ...result, read: true } })
      : mobileJson({ error: "Notification not found" }, 404);
  } catch {
    return mobileJson({ error: "Notification update unavailable" }, 503);
  }
}
