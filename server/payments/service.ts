import { validIdempotencyKey } from "../http/idempotency.ts";
import {
  activeAssignmentsForPrincipal,
} from "../mobile-auth/service.ts";
import type {
  MobileAuthenticatedPrincipal,
} from "../mobile-auth/types.ts";
import {
  paymentOrderCreateSchema,
  razorpayCheckoutVerifySchema,
} from "./contracts.ts";
import {
  createParentPostgresRazorpayOrder,
  verifyParentPostgresRazorpayCheckout,
  processPostgresRazorpayWebhook,
} from "./postgres-repository.ts";

export async function createParentRazorpayCheckout(
  principal: MobileAuthenticatedPrincipal,
  value: unknown,
  idempotencyKey: string | null,
) {
  if (principal.principalType !== "parent") {
    throw new Error("Parent identity required");
  }

  if (
    !idempotencyKey ||
    idempotencyKey.length < 8 ||
    !validIdempotencyKey(idempotencyKey)
  ) {
    throw new Error(
      "A valid Idempotency-Key header is required",
    );
  }

  const input = paymentOrderCreateSchema.parse(value);
  const studentIds = await assignedStudentIds(principal);

  return createParentPostgresRazorpayOrder(
    principal.tenantId,
    principal.userId,
    studentIds,
    input.invoiceId,
    idempotencyKey,
  );
}

export async function verifyParentRazorpayCheckout(
  principal: MobileAuthenticatedPrincipal,
  value: unknown,
) {
  if (principal.principalType !== "parent") {
    throw new Error("Parent identity required");
  }

  const input = razorpayCheckoutVerifySchema.parse(value);
  const studentIds = await assignedStudentIds(principal);

  return verifyParentPostgresRazorpayCheckout(
    principal.tenantId,
    principal.userId,
    studentIds,
    input,
  );
}

export async function processRazorpayWebhook(
  tenantId: string,
  rawBody: string,
  signature: string,
  providerEventId: string,
) {
  return processPostgresRazorpayWebhook(
    tenantId,
    rawBody,
    signature,
    providerEventId,
  );
}

async function assignedStudentIds(
  principal: MobileAuthenticatedPrincipal,
): Promise<string[]> {
  const assignments =
    await activeAssignmentsForPrincipal(principal);

  return assignments
    .filter(
      (entry) =>
        entry.resourceType === "student" &&
        Boolean(entry.resourceId),
    )
    .map((entry) => entry.resourceId);
}
