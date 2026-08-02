import {
  mobileJson,
  mobileSensitiveLimit,
} from "../../../../../../server/mobile-auth/http.ts";
import { mobileBearerTokenFromRequest } from "../../../../../../server/mobile-auth/tokens.ts";
import { logoutMobileSession } from "../../../../../../server/mobile-auth/service.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const token = mobileBearerTokenFromRequest(request);
  if (!token) {
    return mobileJson({ error: "Authentication required" }, 401);
  }

  try {
    const limit = await mobileSensitiveLimit(request, token);
    if (!limit.allowed) {
      return mobileJson(
        { error: "Request rejected" },
        429,
        { "retry-after": String(limit.retryAfter) },
      );
    }
    if (limit.delayMs) {
      await new Promise((resolve) =>
        setTimeout(resolve, limit.delayMs)
      );
    }
    await logoutMobileSession(request);
    return mobileJson({ loggedOut: true });
  } catch {
    return mobileJson(
      { error: "Authentication service unavailable" },
      503,
    );
  }
}
