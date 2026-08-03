import { mobileJson } from "../../../../../server/mobile-auth/http.ts";
import { authenticatedMobilePrincipal } from "../../../../../server/mobile-auth/service.ts";
import {
  mobileContentSnapshot,
  performMobileContentAction,
} from "../../../../../server/mobile-app/service.ts";

import { mobileAppErrorResponse } from "../../../../../server/mobile-app/http.ts";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await authenticatedMobilePrincipal(request);
    if (!principal) return mobileJson({ error: "Authentication required" }, 401);
    return mobileJson({ content: await mobileContentSnapshot(principal, new URL(request.url).searchParams) });
  } catch (error) {
    return mobileAppErrorResponse(error, "Content unavailable");
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const principal = await authenticatedMobilePrincipal(request);
    if (!principal) return mobileJson({ error: "Authentication required" }, 401);
    return mobileJson({ content: await performMobileContentAction(principal, await request.json().catch(() => null)) });
  } catch (error) {
    return mobileAppErrorResponse(error, "Content update failed");
  }
}
