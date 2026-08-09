import {
  razorpayWebhookHeadersSchema,
} from "../../../../../../../server/payments/contracts.ts";
import {
  processRazorpayWebhook,
} from "../../../../../../../server/payments/service.ts";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ schoolId: string }>;
};

export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  const { schoolId } = await context.params;

  const headers = razorpayWebhookHeadersSchema.safeParse({
    signature:
      request.headers.get("x-razorpay-signature") ?? "",
    eventId:
      request.headers.get("x-razorpay-event-id") ?? "",
  });

  if (!headers.success) {
    return Response.json(
      { error: "Invalid Razorpay webhook headers" },
      { status: 400 },
    );
  }

  // IMPORTANT: signature verification must receive these exact bytes.
  // Do not parse the request body before signature verification.
  const rawBody = await request.text();

  try {
    const result = await processRazorpayWebhook(
      schoolId,
      rawBody,
      headers.data.signature,
      headers.data.eventId,
    );

    return Response.json({
      received: true,
      status: result.status,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "";

    const invalidRequest =
      message.includes("signature") ||
      message.includes("payload") ||
      message.includes("not enabled") ||
      message.includes("sandbox") ||
      message.includes("credentials");

    return Response.json(
      {
        error: invalidRequest
          ? "Invalid Razorpay webhook"
          : "Webhook processing unavailable",
      },
      { status: invalidRequest ? 400 : 503 },
    );
  }
}
