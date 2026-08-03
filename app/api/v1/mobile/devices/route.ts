import { mobileJson } from "../../../../../server/mobile-auth/http.ts";
import { authenticatedMobilePrincipal } from "../../../../../server/mobile-auth/service.ts";
import {
  registerMobilePushDevice,
  unregisterMobilePushDevice,
} from "../../../../../server/mobile-app/service.ts";

import { mobileAppErrorResponse } from "../../../../../server/mobile-app/http.ts";
export const dynamic = "force-dynamic";

export async function PUT(request: Request): Promise<Response> {
  try {
    const principal = await authenticatedMobilePrincipal(request);
    if (!principal) return mobileJson({ error: "Authentication required" }, 401);
    const registration = await registerMobilePushDevice(principal, await request.json().catch(() => null));
    return mobileJson({ registration });
  } catch (error) {
    return mobileAppErrorResponse(error, "Device registration failed");
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const principal = await authenticatedMobilePrincipal(request);
    if (!principal) return mobileJson({ error: "Authentication required" }, 401);
    return mobileJson({ revoked: await unregisterMobilePushDevice(principal, await request.json().catch(() => null)) });
  } catch (error) {
    return mobileAppErrorResponse(error, "Device revocation failed");
  }
}
