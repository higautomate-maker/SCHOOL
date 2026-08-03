import { mobileJson } from "../../../../../server/mobile-auth/http.ts";
import { authenticatedMobilePrincipal } from "../../../../../server/mobile-auth/service.ts";
import {
  mobileOperationsSnapshot,
  performMobileOperation,
} from "../../../../../server/mobile-app/service.ts";

import { mobileAppErrorResponse } from "../../../../../server/mobile-app/http.ts";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await authenticatedMobilePrincipal(request);
    if (!principal) return mobileJson({ error: "Authentication required" }, 401);
    return mobileJson({ operations: await mobileOperationsSnapshot(principal) });
  } catch (error) {
    return mobileAppErrorResponse(error, "Operations unavailable");
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const principal = await authenticatedMobilePrincipal(request);
    if (!principal) return mobileJson({ error: "Authentication required" }, 401);
    const operations = await performMobileOperation(
      principal,
      await request.json().catch(() => null),
      request.headers.get("idempotency-key"),
    );
    return mobileJson({ operations });
  } catch (error) {
    return mobileAppErrorResponse(error, "Operation failed");
  }
}
