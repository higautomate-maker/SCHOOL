import { mobileJson } from "../../../../../server/mobile-auth/http.ts";
import {
  authenticatedMobilePrincipal,
  effectiveAccessForPrincipal,
} from "../../../../../server/mobile-auth/service.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await authenticatedMobilePrincipal(request);
    if (!principal) {
      return mobileJson({ error: "Authentication required" }, 401);
    }
    return mobileJson({
      access: await effectiveAccessForPrincipal(principal),
    });
  } catch {
    return mobileJson(
      { error: "Authentication service unavailable" },
      503,
    );
  }
}
