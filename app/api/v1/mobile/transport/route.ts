import { mobileJson } from "../../../../../server/mobile-auth/http.ts";
import { authenticatedMobilePrincipal } from "../../../../../server/mobile-auth/service.ts";
import { mobileTransportSnapshot } from "../../../../../server/mobile-app/service.ts";

import { mobileAppErrorResponse } from "../../../../../server/mobile-app/http.ts";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await authenticatedMobilePrincipal(request);
    if (!principal) return mobileJson({ error: "Authentication required" }, 401);
    return mobileJson({ transport: await mobileTransportSnapshot(principal) });
  } catch (error) {
    return mobileAppErrorResponse(error, "Transport unavailable");
  }
}
