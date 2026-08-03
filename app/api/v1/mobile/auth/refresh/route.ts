import {
  mobileJson,
  mobileSensitiveLimit,
  publicMobileSession,
} from "../../../../../../server/mobile-auth/http.ts";
import {
  parseMobileRefreshInput,
  refreshMobileSession,
} from "../../../../../../server/mobile-auth/service.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let input;
  try {
    input = parseMobileRefreshInput(
      await request.json().catch(() => null),
    );
  } catch {
    return mobileJson({ error: "Invalid refresh token" }, 401);
  }

  try {
    const limit = await mobileSensitiveLimit(
      request,
      input.refreshToken,
    );
    if (!limit.allowed) {
      return mobileJson(
        { error: "Invalid refresh token" },
        429,
        { "retry-after": String(limit.retryAfter) },
      );
    }
    if (limit.delayMs) {
      await new Promise((resolve) =>
        setTimeout(resolve, limit.delayMs)
      );
    }

    const result = await refreshMobileSession(input, request);
    if (result.status !== "rotated") {
      return mobileJson({ error: "Invalid refresh token" }, 401);
    }
    return mobileJson({
      refreshed: true,
      session: publicMobileSession(result.session),
    });
  } catch {
    return mobileJson(
      { error: "Authentication service unavailable" },
      503,
    );
  }
}
