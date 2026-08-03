import { mobileJson } from "../../../../../../server/mobile-auth/http.ts";
import { authenticatedMobilePrincipal } from "../../../../../../server/mobile-auth/service.ts";
import { performMobileTransportEvent } from "../../../../../../server/mobile-app/service.ts";

import { mobileAppErrorResponse } from "../../../../../../server/mobile-app/http.ts";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const principal = await authenticatedMobilePrincipal(request);
    if (!principal) return mobileJson({ error: "Authentication required" }, 401);
    const result = await performMobileTransportEvent(
      principal,
      await request.json().catch(() => null),
      request.headers.get("idempotency-key"),
    );
    return mobileJson(result, result.replayed ? 200 : 201);
  } catch (error) {
    return mobileAppErrorResponse(error, "Transport event failed");
  }
}
