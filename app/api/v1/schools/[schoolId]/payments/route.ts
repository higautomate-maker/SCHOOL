import {
  assertSchoolModuleAccess,
  authorize,
  authErrorResponse,
} from "../../../../../../server/auth/authorization.ts";
import {
  authRateLimit,
} from "../../../../../../server/auth/rate-limit.ts";
import {
  findLoginRecord,
  writeSecurityEvent,
} from "../../../../../../server/auth/repository.ts";
import {
  verifyPassword,
} from "../../../../../../server/auth/password.ts";
import {
  clientAddress,
  requestMetadata,
} from "../../../../../../server/auth/service.ts";
import {
  policies,
} from "../../../../../../server/auth/policies.ts";
import {
  paymentRefundRequestSchema,
} from "../../../../../../server/payments/contracts.ts";
import {
  createAdminPostgresRazorpayRefund,
  listPostgresPaymentAdminState,
} from "../../../../../../server/payments/postgres-repository.ts";
import {
  validRazorpayRefundIdempotencyKey,
} from "../../../../../../server/payments/razorpay.ts";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ schoolId: string }>;
};

export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  const { schoolId } = await context.params;

  try {
    const actor = await authorize(
      request,
      policies.operationsView,
      schoolId,
    );

    assertSchoolModuleAccess(
      actor,
      "fees_finance",
      "view",
    );

    return Response.json({
      payments:
        await listPostgresPaymentAdminState(
          schoolId,
        ),
    });
  } catch (error) {
    try {
      return authErrorResponse(error);
    } catch {}

    return Response.json(
      {
        error:
          "Payment administration unavailable",
      },
      { status: 503 },
    );
  }
}

export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  const { schoolId } = await context.params;

  let actor;

  try {
    // Password verification below is the explicit
    // financial step-up boundary.
    actor = await authorize(
      request,
      {
        ...policies.operationsManage,
        stepUp: false,
      },
      schoolId,
    );

    assertSchoolModuleAccess(
      actor,
      "fees_finance",
      "manage",
    );
  } catch (error) {
    return authErrorResponse(error);
  }

  const idempotencyKey =
    request.headers.get(
      "idempotency-key",
    ) ?? "";

  if (
    !validRazorpayRefundIdempotencyKey(
      idempotencyKey,
    )
  ) {
    return Response.json(
      {
        error:
          "Idempotency-Key must be 10-200 letters, numbers, hyphens or underscores",
      },
      { status: 400 },
    );
  }

  const body =
    await request
      .json()
      .catch(() => null) as
      | (
          Record<string, unknown> & {
            stepUpPassword?: unknown;
          }
        )
      | null;

  const parsed =
    paymentRefundRequestSchema.safeParse(
      body,
    );

  const password =
    typeof body?.stepUpPassword ===
      "string"
      ? body.stepUpPassword
      : "";

  if (
    !parsed.success ||
    password.length < 1 ||
    password.length > 128
  ) {
    return Response.json(
      {
        error:
          "Invalid refund request",
      },
      { status: 422 },
    );
  }

  let limit;

  try {
    limit = await authRateLimit(
      "sensitive",
      actor.email,
      clientAddress(request),
    );
  } catch {
    return Response.json(
      {
        error:
          "Step-up authentication service unavailable",
      },
      { status: 503 },
    );
  }

  if (!limit.allowed) {
    return Response.json(
      {
        error:
          "Step-up authentication failed",
      },
      {
        status: 429,
        headers: {
          "retry-after":
            String(limit.retryAfter),
        },
      },
    );
  }

  if (limit.delayMs) {
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        limit.delayMs,
      )
    );
  }

  const metadata =
    requestMetadata(request);

  let validPassword = false;

  try {
    const record =
      await findLoginRecord(
        actor.email,
      );

    const comparison =
      record &&
      record.userId === actor.userId
        ? await verifyPassword(
            record.passwordHash,
            password,
          )
        : null;

    validPassword =
      Boolean(comparison?.valid);
  } catch {
    return Response.json(
      {
        error:
          "Step-up authentication service unavailable",
      },
      { status: 503 },
    );
  }

  if (!validPassword) {
    await writeSecurityEvent({
      actorId: actor.userId,
      tenantId: schoolId,
      action:
        "auth.step_up.payment_refund",
      outcome: "failure",
      ipHash: metadata.ipHash,
      metadata: {
        userAgentHash:
          metadata.userAgentHash,
      },
    }).catch(() => undefined);

    return Response.json(
      {
        error:
          "Step-up authentication failed",
      },
      { status: 403 },
    );
  }

  try {
    await writeSecurityEvent({
      actorId: actor.userId,
      tenantId: schoolId,
      action:
        "auth.step_up.payment_refund",
      outcome: "success",
      ipHash: metadata.ipHash,
      metadata: {
        userAgentHash:
          metadata.userAgentHash,
      },
    });

    const refund =
      await createAdminPostgresRazorpayRefund(
        schoolId,
        actor.userId,
        parsed.data,
        idempotencyKey,
      );

    return Response.json({
      refund,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Refund failed";

    const status =
      message.includes("not found")
        ? 404
        : message.includes(
              "Only captured payments",
            ) ||
            message.includes(
              "exceeds",
            ) ||
            message.includes(
              "already bound",
            ) ||
            message.includes(
              "requires reconciliation",
            )
          ? 409
          : message.includes(
                "Razorpay",
              )
            ? 502
            : 409;

    return Response.json(
      { error: message },
      { status },
    );
  }
}
