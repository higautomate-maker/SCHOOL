import { mobileJson } from "../../../../../server/mobile-auth/http.ts";
import { authenticatedMobilePrincipal } from "../../../../../server/mobile-auth/service.ts";
import { mobileTodaySummary } from "../../../../../server/mobile-app/service.ts";
import { mobileAppErrorResponse } from "../../../../../server/mobile-app/http.ts";

export const dynamic = "force-dynamic";

// Read-only, role-aware "Today" summary. Tenant + role + module/feature
// enforcement happens inside mobileTodaySummary via effectiveAccessForPrincipal;
// only permitted COUNTS are returned (never records or cross-role data).
export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await authenticatedMobilePrincipal(request);
    if (!principal) return mobileJson({ error: "Authentication required" }, 401);
    return mobileJson({ today: await mobileTodaySummary(principal) });
  } catch (error) {
    return mobileAppErrorResponse(error, "Today summary unavailable");
  }
}
