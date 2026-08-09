import {
  mobileJson,
} from "../../../../../../server/mobile-auth/http.ts";
import {
  authenticatedMobilePrincipal,
} from "../../../../../../server/mobile-auth/service.ts";
import {
  mobileAppErrorResponse,
} from "../../../../../../server/mobile-app/http.ts";
import {
  createParentRazorpayCheckout,
} from "../../../../../../server/payments/service.ts";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
): Promise<Response> {
  try {
    const principal =
      await authenticatedMobilePrincipal(request);

    if (!principal) {
      return mobileJson(
        { error: "Authentication required" },
        401,
      );
    }

    const checkout = await createParentRazorpayCheckout(
      principal,
      await request.json().catch(() => null),
      request.headers.get("idempotency-key"),
    );

    return mobileJson({ checkout });
  } catch (error) {
    return mobileAppErrorResponse(
      error,
      "Payment order failed",
    );
  }
}
