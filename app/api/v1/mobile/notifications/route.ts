import { mobileJson } from "../../../../../server/mobile-auth/http.ts";
import { authenticatedMobilePrincipal } from "../../../../../server/mobile-auth/service.ts";
import { mobileNotifications } from "../../../../../server/mobile-app/service.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await authenticatedMobilePrincipal(request);
    if (!principal) return mobileJson({ error: "Authentication required" }, 401);
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 25) || 25, 1), 100);
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";
    return mobileJson(await mobileNotifications(principal, null, limit, unreadOnly));
  } catch {
    return mobileJson({ error: "Notifications unavailable" }, 503);
  }
}
