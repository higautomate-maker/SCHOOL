import {
  mobileJson,
  publicMobileSession,
} from "../../../../../../server/mobile-auth/http.ts";
import {
  authenticateMobilePassword,
  parseMobileLoginInput,
} from "../../../../../../server/mobile-auth/service.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let input;
  try {
    input = parseMobileLoginInput(
      await request.json().catch(() => null),
    );
  } catch {
    return mobileJson(
      { error: "Invalid email or password" },
      401,
    );
  }

  try {
    const result = await authenticateMobilePassword(
      input,
      request,
    );
    if (result.status === "rate_limited") {
      return mobileJson(
        { error: "Invalid email or password" },
        429,
        { "retry-after": String(result.retryAfter) },
      );
    }
    if (result.status !== "authenticated") {
      return mobileJson(
        { error: "Invalid email or password" },
        401,
      );
    }
    return mobileJson({
      authenticated: true,
      session: publicMobileSession(result.session),
      principal: {
        userId: result.actorUserId,
        tenantId: result.session.tenantId,
        principalType: result.session.principalType,
        mobileIdentityId: result.session.mobileIdentityId,
      },
    });
  } catch {
    return mobileJson(
      { error: "Authentication service unavailable" },
      503,
    );
  }
}
