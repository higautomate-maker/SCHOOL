import {
  mobileJson,
  publicMobilePrincipal,
} from "../../../../../server/mobile-auth/http.ts";
import { authenticatedMobilePrincipal } from "../../../../../server/mobile-auth/service.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await authenticatedMobilePrincipal(request);
    return principal
      ? mobileJson({
          authenticated: true,
          session: publicMobilePrincipal(principal),
        })
      : mobileJson({ authenticated: false }, 401);
  } catch {
    return mobileJson(
      { error: "Authentication service unavailable" },
      503,
    );
  }
}
