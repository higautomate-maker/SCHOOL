import type { PoolClient } from "pg";
import { readGatewayCredentials } from "./credentials.ts";
import {
  calculatePaymentSurchargePaise,
  createRazorpayOrder,
  createRazorpayRefund,
  findRazorpayOrderByReceipt,
  paymentOrderReceipt,
  razorpayPayloadSha256,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature,
  type RazorpayRuntimeCredentials,
} from "./razorpay.ts";
import { withTenantDatabase } from "../runtime/postgres.ts";
import { wakeNotificationWorker } from "../notifications/redis-wake.ts";
import type {
  PaymentRefundRequest,
  RazorpayCheckoutVerify,
} from "./contracts.ts";

type UnknownRecord = Record<string, unknown>;

type RuntimeGateway = RazorpayRuntimeCredentials & {
  surchargeEnabled: boolean;
  surchargeType: "flat" | "percentage";
  surchargeValue: number;
};

type LocalPaymentOrder = {
  id: string;
  invoiceId: string;
  studentId: string;
  providerOrderId: string | null;
  invoiceAmountPaise: number;
  surchargePaise: number;
  amountPaise: number;
  currency: "INR";
  status: string;
  initiatedByUserId: string | null;
};

export type ParentRazorpayCheckout = {
  provider: "razorpay";
  paymentOrderId: string;
  invoiceId: string;
  orderId: string;
  keyId: string;
  amountPaise: number;
  invoiceAmountPaise: number;
  surchargePaise: number;
  currency: "INR";
  receipt: string;
};

export type RazorpayCheckoutVerificationResult = {
  verified: true;
  paymentOrderId: string;
  paymentId: string;
  status: "awaiting_capture";
};

export type RazorpayWebhookResult = {
  status:
    | "processed"
    | "ignored"
    | "duplicate"
    | "requires_reconciliation";
};

export async function createParentPostgresRazorpayOrder(
  tenantId: string,
  userId: string,
  allowedStudentIds: readonly string[],
  invoiceId: string,
  idempotencyKey: string,
): Promise<ParentRazorpayCheckout> {
  const local = await withTenantDatabase(
    tenantId,
    async (_database, client) => {
      const runtime = await runtimeGateway(client, tenantId);

      const existing = await client.query(
        `SELECT
           id,
           invoice_id AS "invoiceId",
           student_id AS "studentId",
           provider_order_id AS "providerOrderId",
           invoice_amount_paise::text AS "invoiceAmountPaise",
           surcharge_paise::text AS "surchargePaise",
           amount_paise::text AS "amountPaise",
           currency,
           status,
           initiated_by_user_id AS "initiatedByUserId"
         FROM payment_orders
         WHERE tenant_id = $1::uuid
           AND provider = 'razorpay'
           AND idempotency_key = $2::text
         LIMIT 1`,
        [tenantId, idempotencyKey],
      );

      if (existing.rows[0]) {
        const order = paymentOrderRow(existing.rows[0]);

        if (order.invoiceId !== invoiceId) {
          throw new Error(
            "Idempotency-Key is already bound to another payment request",
          );
        }

        requireAssignedStudent(allowedStudentIds, order.studentId);
        return { order, runtime };
      }

      const invoiceResult = await client.query(
        `SELECT
           id,
           student_id AS "studentId",
           amount_paise::text AS "amountPaise",
           paid_paise::text AS "paidPaise",
           status
         FROM fee_invoices
         WHERE tenant_id = $1::uuid
           AND id = $2::uuid
         FOR UPDATE`,
        [tenantId, invoiceId],
      );

      const invoice = invoiceResult.rows[0];

      if (!invoice) throw new Error("Fee invoice not found");

      const studentId = requireString(invoice.studentId, "student");
      requireAssignedStudent(allowedStudentIds, studentId);

      const total = moneyNumber(invoice.amountPaise);
      const paid = moneyNumber(invoice.paidPaise);
      const outstanding = total - paid;

      if (outstanding <= 0) {
        throw new Error("Fee invoice has no outstanding balance");
      }

      if (outstanding < 100) {
        throw new Error(
          "Outstanding balance is below the online payment minimum",
        );
      }

      const surchargePaise = calculatePaymentSurchargePaise(
        outstanding,
        runtime.surchargeEnabled,
        runtime.surchargeType,
        runtime.surchargeValue,
      );

      const amountPaise = outstanding + surchargePaise;

      if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
        throw new Error("Payment amount exceeds the monetary contract");
      }

      const inserted = await client.query(
        `INSERT INTO payment_orders (
           id,
           tenant_id,
           invoice_id,
           student_id,
           provider,
           idempotency_key,
           invoice_amount_paise,
           surcharge_paise,
           amount_paise,
           currency,
           status,
           initiated_by_user_id,
           created_at,
           updated_at
         ) VALUES (
           gen_random_uuid(),
           $1::uuid,
           $2::uuid,
           $3::uuid,
           'razorpay',
           $4::text,
           $5::bigint,
           $6::bigint,
           $7::bigint,
           'INR',
           'created',
           $8::uuid,
           now(),
           now()
         )
         RETURNING
           id,
           invoice_id AS "invoiceId",
           student_id AS "studentId",
           provider_order_id AS "providerOrderId",
           invoice_amount_paise::text AS "invoiceAmountPaise",
           surcharge_paise::text AS "surchargePaise",
           amount_paise::text AS "amountPaise",
           currency,
           status,
           initiated_by_user_id AS "initiatedByUserId"`,
        [
          tenantId,
          invoiceId,
          studentId,
          idempotencyKey,
          outstanding,
          surchargePaise,
          amountPaise,
          userId,
        ],
      );

      return {
        order: paymentOrderRow(inserted.rows[0]),
        runtime,
      };
    },
  );

  return attachRemoteRazorpayOrder(
    tenantId,
    local.order.id,
  );
}

async function attachRemoteRazorpayOrder(
  tenantId: string,
  paymentOrderId: string,
): Promise<ParentRazorpayCheckout> {
  return withTenantDatabase(
    tenantId,
    async (_database, client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
        [`razorpay-order:${tenantId}:${paymentOrderId}`],
      );

      const result = await client.query(
        `SELECT
           id,
           invoice_id AS "invoiceId",
           student_id AS "studentId",
           provider_order_id AS "providerOrderId",
           invoice_amount_paise::text AS "invoiceAmountPaise",
           surcharge_paise::text AS "surchargePaise",
           amount_paise::text AS "amountPaise",
           currency,
           status,
           initiated_by_user_id AS "initiatedByUserId"
         FROM payment_orders
         WHERE tenant_id = $1::uuid
           AND id = $2::uuid
           AND provider = 'razorpay'
         FOR UPDATE`,
        [tenantId, paymentOrderId],
      );

      const order = paymentOrderRow(result.rows[0]);
      const runtime = await runtimeGateway(client, tenantId);
      const receipt = paymentOrderReceipt(order.id);

      if (!order.providerOrderId) {
        let remote = await findRazorpayOrderByReceipt(
          runtime,
          receipt,
        );

        if (!remote) {
          remote = await createRazorpayOrder(runtime, {
            amountPaise: order.amountPaise,
            receipt,
            tenantId,
            paymentOrderId: order.id,
            invoiceId: order.invoiceId,
          });
        }

        if (
          remote.amount !== order.amountPaise ||
          remote.currency !== "INR" ||
          remote.receipt !== receipt
        ) {
          throw new Error("Razorpay order does not match local payment");
        }

        await client.query(
          `UPDATE payment_orders
           SET provider_order_id = $1::text,
               status = $2::text,
               updated_at = now()
           WHERE tenant_id = $3::uuid
             AND id = $4::uuid`,
          [
            remote.id,
            remote.status === "created" ? "created" : "attempted",
            tenantId,
            order.id,
          ],
        );

        order.providerOrderId = remote.id;
      }

      return {
        provider: "razorpay",
        paymentOrderId: order.id,
        invoiceId: order.invoiceId,
        orderId: order.providerOrderId,
        keyId: runtime.keyId,
        amountPaise: order.amountPaise,
        invoiceAmountPaise: order.invoiceAmountPaise,
        surchargePaise: order.surchargePaise,
        currency: "INR",
        receipt,
      };
    },
  );
}

export async function verifyParentPostgresRazorpayCheckout(
  tenantId: string,
  userId: string,
  allowedStudentIds: readonly string[],
  input: RazorpayCheckoutVerify,
): Promise<RazorpayCheckoutVerificationResult> {
  return withTenantDatabase(
    tenantId,
    async (_database, client) => {
      const runtime = await runtimeGateway(client, tenantId);

      const result = await client.query(
        `SELECT
           id,
           invoice_id AS "invoiceId",
           student_id AS "studentId",
           provider_order_id AS "providerOrderId",
           invoice_amount_paise::text AS "invoiceAmountPaise",
           surcharge_paise::text AS "surchargePaise",
           amount_paise::text AS "amountPaise",
           currency,
           status,
           initiated_by_user_id AS "initiatedByUserId"
         FROM payment_orders
         WHERE tenant_id = $1::uuid
           AND id = $2::uuid
           AND provider = 'razorpay'
         FOR UPDATE`,
        [tenantId, input.paymentOrderId],
      );

      const order = paymentOrderRow(result.rows[0]);
      requireAssignedStudent(allowedStudentIds, order.studentId);

      if (order.initiatedByUserId !== userId) {
        throw new Error("Payment order belongs to another user");
      }

      if (!order.providerOrderId) {
        throw new Error("Razorpay order is not ready");
      }

      if (input.razorpayOrderId !== order.providerOrderId) {
        throw new Error("Razorpay order mismatch");
      }

      const valid = verifyRazorpayCheckoutSignature(
        order.providerOrderId,
        input.razorpayPaymentId,
        input.razorpaySignature,
        runtime.keySecret,
      );

      if (!valid) {
        throw new Error("Razorpay payment signature is invalid");
      }

      await upsertCheckoutAttempt(
        client,
        tenantId,
        order,
        input.razorpayPaymentId,
      );

      await client.query(
        `UPDATE payment_orders
         SET status = CASE
           WHEN status IN (
             'paid',
             'partially_refunded',
             'refunded',
             'requires_reconciliation'
           )
             THEN status
           ELSE 'attempted'
         END,
         updated_at = now()
         WHERE tenant_id = $1::uuid
           AND id = $2::uuid`,
        [tenantId, order.id],
      );

      return {
        verified: true,
        paymentOrderId: order.id,
        paymentId: input.razorpayPaymentId,
        status: "awaiting_capture",
      };
    },
  );
}

export async function processPostgresRazorpayWebhook(
  tenantId: string,
  rawBody: string,
  signature: string,
  providerEventId: string,
): Promise<RazorpayWebhookResult> {
  const runtime = await withTenantDatabase(
    tenantId,
    async (_database, client) =>
      runtimeGateway(client, tenantId),
  );

  if (
    !verifyRazorpayWebhookSignature(
      rawBody,
      signature,
      runtime.webhookSecret,
    )
  ) {
    throw new Error("Razorpay webhook signature is invalid");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error("Razorpay webhook payload is invalid");
  }

  const event = webhookEvent(parsed);
  const payloadHash = razorpayPayloadSha256(rawBody);

  const committed = await withTenantDatabase(
    tenantId,
    async (_database, client) => {
      const claimed = await client.query<{ id: string }>(
        `INSERT INTO payment_webhook_events (
           id,
           tenant_id,
           provider,
           provider_event_id,
           event_type,
           payload_sha256,
           signature_verified,
           status,
           received_at
         ) VALUES (
           gen_random_uuid(),
           $1::uuid,
           'razorpay',
           $2::text,
           $3::text,
           $4::text,
           true,
           'received',
           now()
         )
         ON CONFLICT (
           tenant_id,
           provider,
           provider_event_id
         ) DO NOTHING
         RETURNING id`,
        [
          tenantId,
          providerEventId,
          event.eventType,
          payloadHash,
        ],
      );

      const webhookId = claimed.rows[0]?.id;

      if (!webhookId) {
        return {
          result: { status: "duplicate" } as RazorpayWebhookResult,
          outboxEventId: null as string | null,
        };
      }

      if (event.eventType.startsWith("refund.")) {
        const refundResult = await handleRefundWebhook(
          client,
          tenantId,
          webhookId,
          event.eventType,
          refundWebhookEntity(parsed),
        );

        return {
          result: refundResult,
          outboxEventId: null,
        };
      }

      if (
        event.eventType !== "payment.captured" &&
        event.eventType !== "payment.failed"
      ) {
        await finishWebhook(
          client,
          tenantId,
          webhookId,
          "ignored",
          null,
        );

        return {
          result: { status: "ignored" } as RazorpayWebhookResult,
          outboxEventId: null,
        };
      }

      if (!event.payment) {
        await finishWebhook(
          client,
          tenantId,
          webhookId,
          "failed",
          "payment_entity_missing",
        );

        return {
          result: {
            status: "requires_reconciliation",
          } as RazorpayWebhookResult,
          outboxEventId: null,
        };
      }

      const orderResult = await client.query(
        `SELECT
           id,
           invoice_id AS "invoiceId",
           student_id AS "studentId",
           provider_order_id AS "providerOrderId",
           invoice_amount_paise::text AS "invoiceAmountPaise",
           surcharge_paise::text AS "surchargePaise",
           amount_paise::text AS "amountPaise",
           currency,
           status,
           initiated_by_user_id AS "initiatedByUserId"
         FROM payment_orders
         WHERE tenant_id = $1::uuid
           AND provider = 'razorpay'
           AND provider_order_id = $2::text
         FOR UPDATE`,
        [tenantId, event.payment.orderId],
      );

      if (!orderResult.rows[0]) {
        await finishWebhook(
          client,
          tenantId,
          webhookId,
          "ignored",
          "unknown_order",
        );

        return {
          result: { status: "ignored" } as RazorpayWebhookResult,
          outboxEventId: null,
        };
      }

      const order = paymentOrderRow(orderResult.rows[0]);

      if (
        event.payment.amountPaise !== order.amountPaise ||
        event.payment.currency !== "INR"
      ) {
        await client.query(
          `UPDATE payment_orders
           SET status = 'requires_reconciliation',
               updated_at = now()
           WHERE tenant_id = $1::uuid
             AND id = $2::uuid`,
          [tenantId, order.id],
        );

        await finishWebhook(
          client,
          tenantId,
          webhookId,
          "processed",
          "amount_mismatch",
        );

        return {
          result: {
            status: "requires_reconciliation",
          } as RazorpayWebhookResult,
          outboxEventId: null,
        };
      }

      await upsertWebhookAttempt(
        client,
        tenantId,
        order,
        event.payment,
        event.eventType,
      );

      if (event.eventType === "payment.failed") {
        if (
          ![
            "paid",
            "partially_refunded",
            "refunded",
            "requires_reconciliation",
          ].includes(order.status)
        ) {
          await client.query(
            `UPDATE payment_orders
             SET status = 'failed',
                 updated_at = now()
             WHERE tenant_id = $1::uuid
               AND id = $2::uuid`,
            [tenantId, order.id],
          );
        }

        await finishWebhook(
          client,
          tenantId,
          webhookId,
          "processed",
          event.payment.failureCode,
        );

        return {
          result: { status: "processed" } as RazorpayWebhookResult,
          outboxEventId: null,
        };
      }

      if (
        ["paid", "partially_refunded", "refunded"].includes(order.status)
      ) {
        await finishWebhook(
          client,
          tenantId,
          webhookId,
          "processed",
          null,
        );

        return {
          result: { status: "processed" } as RazorpayWebhookResult,
          outboxEventId: null,
        };
      }

      if (!order.initiatedByUserId) {
        await markReconciliation(
          client,
          tenantId,
          order.id,
          webhookId,
          "payment_actor_missing",
        );

        return {
          result: {
            status: "requires_reconciliation",
          } as RazorpayWebhookResult,
          outboxEventId: null,
        };
      }

      const invoiceResult = await client.query(
        `SELECT
           amount_paise::text AS "amountPaise",
           paid_paise::text AS "paidPaise"
         FROM fee_invoices
         WHERE tenant_id = $1::uuid
           AND id = $2::uuid
         FOR UPDATE`,
        [tenantId, order.invoiceId],
      );

      const invoice = invoiceResult.rows[0];

      if (!invoice) {
        await markReconciliation(
          client,
          tenantId,
          order.id,
          webhookId,
          "invoice_missing",
        );

        return {
          result: {
            status: "requires_reconciliation",
          } as RazorpayWebhookResult,
          outboxEventId: null,
        };
      }

      const invoiceTotal = moneyNumber(invoice.amountPaise);
      const alreadyPaid = moneyNumber(invoice.paidPaise);
      const outstanding = invoiceTotal - alreadyPaid;

      if (outstanding !== order.invoiceAmountPaise) {
        await markReconciliation(
          client,
          tenantId,
          order.id,
          webhookId,
          "invoice_balance_changed",
        );

        return {
          result: {
            status: "requires_reconciliation",
          } as RazorpayWebhookResult,
          outboxEventId: null,
        };
      }

      const ledgerMethod = feeLedgerMethod(event.payment.method);
      const paymentReference =
        `razorpay:${event.payment.paymentId}:${event.payment.method}`
          .slice(0, 80);

      const feePayment = await client.query<{ id: string }>(
        `INSERT INTO fee_payments (
           id,
           tenant_id,
           invoice_id,
           student_id,
           amount_paise,
           method,
           reference,
           paid_on,
           received_by,
           created_at
         ) VALUES (
           gen_random_uuid(),
           $1::uuid,
           $2::uuid,
           $3::uuid,
           $4::bigint,
           $5::payment_method,
           $6::text,
           now(),
           $7::uuid,
           now()
         )
         RETURNING id`,
        [
          tenantId,
          order.invoiceId,
          order.studentId,
          order.invoiceAmountPaise,
          ledgerMethod,
          paymentReference,
          order.initiatedByUserId,
        ],
      );

      const feePaymentId = feePayment.rows[0]?.id;

      if (!feePaymentId) {
        throw new Error("Captured payment could not be posted");
      }

      const nextPaid = alreadyPaid + order.invoiceAmountPaise;

      await client.query(
        `UPDATE fee_invoices
         SET paid_paise = $1::bigint,
             status = $2::invoice_status,
             updated_at = now()
         WHERE tenant_id = $3::uuid
           AND id = $4::uuid`,
        [
          nextPaid,
          nextPaid === invoiceTotal ? "paid" : "partial",
          tenantId,
          order.invoiceId,
        ],
      );

      await client.query(
        `UPDATE payment_orders
         SET status = 'paid',
             updated_at = now()
         WHERE tenant_id = $1::uuid
           AND id = $2::uuid`,
        [tenantId, order.id],
      );

      await client.query(
        `INSERT INTO audit_events (
           id,
           tenant_id,
           actor_id,
           action,
           resource_type,
           resource_id,
           reason,
           metadata,
           occurred_at
         ) VALUES (
           gen_random_uuid(),
           $1::uuid,
           $2::uuid,
           'fee.payment.gateway_capture',
           'fee_payment',
           $3::text,
           'Verified Razorpay payment captured',
           $4::jsonb,
           now()
         )`,
        [
          tenantId,
          order.initiatedByUserId,
          feePaymentId,
          JSON.stringify({
            provider: "razorpay",
            paymentOrderId: order.id,
            providerOrderId: order.providerOrderId,
            providerPaymentId: event.payment.paymentId,
            invoiceId: order.invoiceId,
            invoiceAmountPaise: order.invoiceAmountPaise,
            surchargePaise: order.surchargePaise,
            gatewayAmountPaise: order.amountPaise,
            gatewayMethod: event.payment.method,
          }),
        ],
      );

      const outbox = await client.query<{ id: string }>(
        `INSERT INTO outbox_events (
           id,
           tenant_id,
           topic,
           aggregate_type,
           aggregate_id,
           payload,
           status,
           attempts,
           available_at,
           created_at,
           updated_at
         ) VALUES (
           gen_random_uuid(),
           $1::uuid,
           'fee.payment.collect',
           'fee_payment',
           $2::text,
           $3::jsonb,
           'pending',
           0,
           now(),
           now(),
           now()
         )
         RETURNING id`,
        [
          tenantId,
          feePaymentId,
          JSON.stringify({
            action: "record_payment",
            studentId: order.studentId,
            invoiceId: order.invoiceId,
            amountPaise: order.invoiceAmountPaise,
            balancePaise: invoiceTotal - nextPaid,
            method: ledgerMethod,
            provider: "razorpay",
          }),
        ],
      );

      await finishWebhook(
        client,
        tenantId,
        webhookId,
        "processed",
        null,
      );

      return {
        result: { status: "processed" } as RazorpayWebhookResult,
        outboxEventId: outbox.rows[0]?.id ?? null,
      };
    },
  );

  if (committed.outboxEventId) {
    await wakeNotificationWorker().catch(() => undefined);
  }

  return committed.result;
}

async function runtimeGateway(
  client: PoolClient,
  tenantId: string,
): Promise<RuntimeGateway> {
  const result = await client.query<{ payload: unknown }>(
    `SELECT payload
     FROM school_configurations
     WHERE tenant_id = $1::uuid
       AND config_key = 'payment_gateway'
     LIMIT 1`,
    [tenantId],
  );

  const source = asRecord(result.rows[0]?.payload);

  if (
    source.enabled !== true ||
    source.gatewayId !== "3"
  ) {
    throw new Error("Razorpay is not enabled for this school");
  }

  if (source.paymentMode !== "sandbox") {
    throw new Error(
      "Stage 11B permits Razorpay sandbox mode only",
    );
  }

  const credentials = readGatewayCredentials(tenantId, source);

  const keyId = credentials.sandbox_key_id ?? "";
  const keySecret = credentials.sandbox_key_secret ?? "";
  const webhookSecret = credentials.webhook_secret ?? "";

  if (!keyId || !keySecret || !webhookSecret) {
    throw new Error(
      "Razorpay sandbox credentials and webhook secret are required",
    );
  }

  return {
    keyId,
    keySecret,
    webhookSecret,
    surchargeEnabled: source.surchargeEnabled === true,
    surchargeType:
      source.surchargeType === "flat" ? "flat" : "percentage",
    surchargeValue:
      typeof source.surchargeValue === "number" &&
      Number.isFinite(source.surchargeValue)
        ? source.surchargeValue
        : 0,
  };
}

async function upsertCheckoutAttempt(
  client: PoolClient,
  tenantId: string,
  order: LocalPaymentOrder,
  paymentId: string,
): Promise<void> {
  const existing = await client.query<{
    id: string;
    paymentOrderId: string;
    status: string;
  }>(
    `SELECT
       id,
       payment_order_id AS "paymentOrderId",
       status
     FROM payment_attempts
     WHERE tenant_id = $1::uuid
       AND provider = 'razorpay'
       AND provider_payment_id = $2::text
     FOR UPDATE`,
    [tenantId, paymentId],
  );

  if (existing.rows[0]) {
    if (existing.rows[0].paymentOrderId !== order.id) {
      throw new Error(
        "Razorpay payment is already bound to another order",
      );
    }

    if (
      ![
        "captured",
        "partially_refunded",
        "refunded",
      ].includes(existing.rows[0].status)
    ) {
      await client.query(
        `UPDATE payment_attempts
         SET status = 'authorized',
             failure_code = NULL,
             updated_at = now()
         WHERE tenant_id = $1::uuid
           AND id = $2::uuid`,
        [tenantId, existing.rows[0].id],
      );
    }

    return;
  }

  await client.query(
    `INSERT INTO payment_attempts (
       id,
       tenant_id,
       payment_order_id,
       provider,
       provider_payment_id,
       amount_paise,
       currency,
       status,
       created_at,
       updated_at
     ) VALUES (
       gen_random_uuid(),
       $1::uuid,
       $2::uuid,
       'razorpay',
       $3::text,
       $4::bigint,
       'INR',
       'authorized',
       now(),
       now()
     )`,
    [
      tenantId,
      order.id,
      paymentId,
      order.amountPaise,
    ],
  );
}

async function upsertWebhookAttempt(
  client: PoolClient,
  tenantId: string,
  order: LocalPaymentOrder,
  payment: WebhookPayment,
  eventType: string,
): Promise<void> {
  const existing = await client.query<{
    id: string;
    paymentOrderId: string;
    status: string;
  }>(
    `SELECT
       id,
       payment_order_id AS "paymentOrderId",
       status
     FROM payment_attempts
     WHERE tenant_id = $1::uuid
       AND provider = 'razorpay'
       AND provider_payment_id = $2::text
     FOR UPDATE`,
    [tenantId, payment.paymentId],
  );

  const desired = eventType === "payment.captured"
    ? "captured"
    : "failed";

  if (existing.rows[0]) {
    if (existing.rows[0].paymentOrderId !== order.id) {
      throw new Error(
        "Razorpay payment is already bound to another order",
      );
    }

    const protectedStatus = [
      "captured",
      "partially_refunded",
      "refunded",
    ].includes(existing.rows[0].status);

    await client.query(
      `UPDATE payment_attempts
       SET method = $1::text,
           status = $2::text,
           failure_code = $3::text,
           updated_at = now()
       WHERE tenant_id = $4::uuid
         AND id = $5::uuid`,
      [
        payment.method,
        protectedStatus && desired === "failed"
          ? existing.rows[0].status
          : desired,
        desired === "failed"
          ? payment.failureCode
          : null,
        tenantId,
        existing.rows[0].id,
      ],
    );

    return;
  }

  await client.query(
    `INSERT INTO payment_attempts (
       id,
       tenant_id,
       payment_order_id,
       provider,
       provider_payment_id,
       amount_paise,
       currency,
       method,
       status,
       failure_code,
       created_at,
       updated_at
     ) VALUES (
       gen_random_uuid(),
       $1::uuid,
       $2::uuid,
       'razorpay',
       $3::text,
       $4::bigint,
       'INR',
       $5::text,
       $6::text,
       $7::text,
       now(),
       now()
     )`,
    [
      tenantId,
      order.id,
      payment.paymentId,
      payment.amountPaise,
      payment.method,
      desired,
      desired === "failed"
        ? payment.failureCode
        : null,
    ],
  );
}

async function markReconciliation(
  client: PoolClient,
  tenantId: string,
  paymentOrderId: string,
  webhookId: string,
  reason: string,
): Promise<void> {
  await client.query(
    `UPDATE payment_orders
     SET status = 'requires_reconciliation',
         updated_at = now()
     WHERE tenant_id = $1::uuid
       AND id = $2::uuid`,
    [tenantId, paymentOrderId],
  );

  await finishWebhook(
    client,
    tenantId,
    webhookId,
    "processed",
    reason,
  );
}

async function finishWebhook(
  client: PoolClient,
  tenantId: string,
  webhookId: string,
  status: "processed" | "ignored" | "failed",
  failureCode: string | null,
): Promise<void> {
  await client.query(
    `UPDATE payment_webhook_events
     SET status = $1::text,
         failure_code = $2::text,
         processed_at = now()
     WHERE tenant_id = $3::uuid
       AND id = $4::uuid`,
    [
      status,
      failureCode,
      tenantId,
      webhookId,
    ],
  );
}

type WebhookPayment = {
  paymentId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  method: string;
  failureCode: string | null;
};

function webhookEvent(value: unknown): {
  eventType: string;
  payment: WebhookPayment | null;
} {
  const root = asRecord(value);
  const eventType =
    typeof root.event === "string" ? root.event : "";

  if (!eventType) {
    throw new Error("Razorpay webhook event type is missing");
  }

  const payload = asRecord(root.payload);
  const paymentWrapper = asRecord(payload.payment);
  const entity = asRecord(paymentWrapper.entity);

  if (!Object.keys(entity).length) {
    return { eventType, payment: null };
  }

  const paymentId =
    typeof entity.id === "string" ? entity.id : "";
  const orderId =
    typeof entity.order_id === "string"
      ? entity.order_id
      : "";
  const amountPaise =
    typeof entity.amount === "number"
      ? entity.amount
      : Number.NaN;
  const currency =
    typeof entity.currency === "string"
      ? entity.currency
      : "";
  const method =
    typeof entity.method === "string"
      ? entity.method
      : "unknown";
  const failureCode =
    typeof entity.error_code === "string"
      ? entity.error_code
      : null;

  if (
    !paymentId.startsWith("pay_") ||
    !orderId.startsWith("order_") ||
    !Number.isSafeInteger(amountPaise) ||
    amountPaise <= 0
  ) {
    return { eventType, payment: null };
  }

  return {
    eventType,
    payment: {
      paymentId,
      orderId,
      amountPaise,
      currency,
      method,
      failureCode,
    },
  };
}

function feeLedgerMethod(
  razorpayMethod: string,
): "card" | "upi" | "bank" {
  if (razorpayMethod === "upi") return "upi";

  if (
    razorpayMethod === "netbanking" ||
    razorpayMethod === "bank_transfer"
  ) {
    return "bank";
  }

  return "card";
}

function paymentOrderRow(
  value: unknown,
): LocalPaymentOrder {
  const row = asRecord(value);

  const id = requireString(row.id, "payment order");
  const invoiceId = requireString(row.invoiceId, "invoice");
  const studentId = requireString(row.studentId, "student");

  return {
    id,
    invoiceId,
    studentId,
    providerOrderId:
      typeof row.providerOrderId === "string"
        ? row.providerOrderId
        : null,
    invoiceAmountPaise: moneyNumber(row.invoiceAmountPaise),
    surchargePaise: moneyNumber(row.surchargePaise),
    amountPaise: moneyNumber(row.amountPaise),
    currency: "INR",
    status:
      typeof row.status === "string" ? row.status : "created",
    initiatedByUserId:
      typeof row.initiatedByUserId === "string"
        ? row.initiatedByUserId
        : null,
  };
}

function requireAssignedStudent(
  allowedStudentIds: readonly string[],
  studentId: string,
): void {
  if (!allowedStudentIds.includes(studentId)) {
    throw new Error("Student assignment required");
  }
}

function moneyNumber(value: unknown): number {
  const amount = Number(value);

  if (!Number.isSafeInteger(amount)) {
    throw new Error(
      "Stored monetary value exceeds the safe integer contract",
    );
  }

  return amount;
}

function requireString(
  value: unknown,
  label: string,
): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`${label} is invalid`);
  }

  return value;
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}


export type PaymentRefundAdminState = {
  refunds: Array<{
    id: string;
    paymentOrderId: string;
    providerRefundId: string | null;
    principalPaise: number;
    surchargePaise: number;
    amountPaise: number;
    status: string;
    reason: string;
    createdAt: string;
    processedAt: string | null;
  }>;
  reconciliation: Array<{
    paymentOrderId: string;
    invoiceId: string;
    amountPaise: number;
    status: string;
    createdAt: string;
  }>;
};

export type AdminRefundResult = {
  refundId: string;
  paymentOrderId: string;
  providerRefundId: string | null;
  principalPaise: number;
  surchargePaise: number;
  amountPaise: number;
  status:
    | "requested"
    | "pending"
    | "processed"
    | "failed";
};

type RefundRow = {
  id: string;
  paymentOrderId: string;
  providerPaymentId: string;
  providerRefundId: string | null;
  idempotencyKey: string;
  principalPaise: number;
  surchargePaise: number;
  amountPaise: number;
  reason: string;
  status:
    | "requested"
    | "pending"
    | "processed"
    | "failed";
  requestedByUserId: string;
};

export async function listPostgresPaymentAdminState(
  tenantId: string,
): Promise<PaymentRefundAdminState> {
  return withTenantDatabase(
    tenantId,
    async (_database, client) => {
      const [refunds, reconciliation] =
        await Promise.all([
          client.query(
            `SELECT
               id,
               payment_order_id AS "paymentOrderId",
               provider_refund_id AS "providerRefundId",
               principal_paise::text AS "principalPaise",
               surcharge_paise::text AS "surchargePaise",
               amount_paise::text AS "amountPaise",
               status,
               reason,
               created_at AS "createdAt",
               processed_at AS "processedAt"
             FROM payment_refunds
             WHERE tenant_id = $1::uuid
             ORDER BY created_at DESC
             LIMIT 200`,
            [tenantId],
          ),
          client.query(
            `SELECT
               id AS "paymentOrderId",
               invoice_id AS "invoiceId",
               amount_paise::text AS "amountPaise",
               status,
               created_at AS "createdAt"
             FROM payment_orders
             WHERE tenant_id = $1::uuid
               AND status = 'requires_reconciliation'
             ORDER BY updated_at DESC
             LIMIT 200`,
            [tenantId],
          ),
        ]);

      return {
        refunds: refunds.rows.map((row) => ({
          id: requireString(row.id, "refund"),
          paymentOrderId: requireString(
            row.paymentOrderId,
            "payment order",
          ),
          providerRefundId:
            typeof row.providerRefundId === "string"
              ? row.providerRefundId
              : null,
          principalPaise: moneyNumber(
            row.principalPaise,
          ),
          surchargePaise: moneyNumber(
            row.surchargePaise,
          ),
          amountPaise: moneyNumber(
            row.amountPaise,
          ),
          status:
            typeof row.status === "string"
              ? row.status
              : "requested",
          reason:
            typeof row.reason === "string"
              ? row.reason
              : "",
          createdAt: paymentTimestamp(
            row.createdAt,
          ),
          processedAt:
            row.processedAt
              ? paymentTimestamp(row.processedAt)
              : null,
        })),
        reconciliation:
          reconciliation.rows.map((row) => ({
            paymentOrderId: requireString(
              row.paymentOrderId,
              "payment order",
            ),
            invoiceId: requireString(
              row.invoiceId,
              "invoice",
            ),
            amountPaise: moneyNumber(
              row.amountPaise,
            ),
            status:
              typeof row.status === "string"
                ? row.status
                : "requires_reconciliation",
            createdAt: paymentTimestamp(
              row.createdAt,
            ),
          })),
      };
    },
  );
}

export async function createAdminPostgresRazorpayRefund(
  tenantId: string,
  userId: string,
  input: PaymentRefundRequest,
  idempotencyKey: string,
): Promise<AdminRefundResult> {
  const local = await withTenantDatabase(
    tenantId,
    async (_database, client) => {
      // Serialize competing refunds against the same original payment.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
        [
          `payment-refund:${tenantId}:${input.paymentOrderId}`,
        ],
      );

      // ------------------------------------------------------
      // Idempotent replay.
      // ------------------------------------------------------
      const replay = await client.query(
        `SELECT
           id,
           payment_order_id AS "paymentOrderId",
           provider_payment_id AS "providerPaymentId",
           provider_refund_id AS "providerRefundId",
           idempotency_key AS "idempotencyKey",
           principal_paise::text AS "principalPaise",
           surcharge_paise::text AS "surchargePaise",
           amount_paise::text AS "amountPaise",
           reason,
           status,
           requested_by_user_id AS "requestedByUserId"
         FROM payment_refunds
         WHERE tenant_id = $1::uuid
           AND provider = 'razorpay'
           AND idempotency_key = $2::text
         LIMIT 1`,
        [
          tenantId,
          idempotencyKey,
        ],
      );

      if (replay.rows[0]) {
        const refund =
          paymentRefundRow(replay.rows[0]);

        if (
          refund.paymentOrderId !==
            input.paymentOrderId ||
          refund.principalPaise !==
            input.principalAmountPaise ||
          refund.reason !== input.reason
        ) {
          throw new Error(
            "Idempotency-Key is already bound to another refund request",
          );
        }

        return refund;
      }

      // ------------------------------------------------------
      // Lock original captured payment.
      // ------------------------------------------------------
      const orderResult = await client.query(
        `SELECT
           id,
           invoice_id AS "invoiceId",
           invoice_amount_paise::text
             AS "invoiceAmountPaise",
           surcharge_paise::text
             AS "surchargePaise",
           amount_paise::text
             AS "amountPaise",
           status
         FROM payment_orders
         WHERE tenant_id = $1::uuid
           AND id = $2::uuid
           AND provider = 'razorpay'
         FOR UPDATE`,
        [
          tenantId,
          input.paymentOrderId,
        ],
      );

      const order = orderResult.rows[0];

      if (!order) {
        throw new Error(
          "Payment order not found",
        );
      }

      if (
        ![
          "paid",
          "partially_refunded",
        ].includes(String(order.status))
      ) {
        throw new Error(
          "Only captured payments can be refunded",
        );
      }

      // ------------------------------------------------------
      // Find the captured provider payment.
      // ------------------------------------------------------
      const attemptResult =
        await client.query(
          `SELECT
             provider_payment_id
               AS "providerPaymentId",
             status
           FROM payment_attempts
           WHERE tenant_id = $1::uuid
             AND payment_order_id = $2::uuid
             AND provider = 'razorpay'
             AND provider_payment_id IS NOT NULL
             AND status IN (
               'captured',
               'partially_refunded',
               'refunded'
             )
           ORDER BY updated_at DESC
           LIMIT 1
           FOR UPDATE`,
          [
            tenantId,
            input.paymentOrderId,
          ],
        );

      const attempt =
        attemptResult.rows[0];

      if (
        !attempt ||
        typeof attempt.providerPaymentId !==
          "string"
      ) {
        throw new Error(
          "Captured Razorpay payment could not be found",
        );
      }

      // ------------------------------------------------------
      // Reserve amounts from all non-failed refunds.
      //
      // requested + pending are reserved so two administrators
      // cannot over-refund concurrently.
      // ------------------------------------------------------
      const reserved =
        await client.query(
          `SELECT
             COALESCE(
               SUM(principal_paise),
               0
             )::text AS "principalPaise",
             COALESCE(
               SUM(surcharge_paise),
               0
             )::text AS "surchargePaise"
           FROM payment_refunds
           WHERE tenant_id = $1::uuid
             AND payment_order_id = $2::uuid
             AND status IN (
               'requested',
               'pending',
               'processed'
             )`,
          [
            tenantId,
            input.paymentOrderId,
          ],
        );

      const reservedPrincipal =
        moneyNumber(
          reserved.rows[0]?.principalPaise ??
            "0",
        );

      const reservedSurcharge =
        moneyNumber(
          reserved.rows[0]?.surchargePaise ??
            "0",
        );

      const invoiceAmount =
        moneyNumber(
          order.invoiceAmountPaise,
        );

      const originalSurcharge =
        moneyNumber(
          order.surchargePaise,
        );

      const availablePrincipal =
        invoiceAmount - reservedPrincipal;

      const availableSurcharge =
        originalSurcharge - reservedSurcharge;

      if (
        input.principalAmountPaise <= 0 ||
        input.principalAmountPaise >
          availablePrincipal
      ) {
        throw new Error(
          "Refund exceeds the remaining refundable fee amount",
        );
      }

      const surchargePaise =
        input.refundRemainingSurcharge
          ? availableSurcharge
          : 0;

      if (surchargePaise < 0) {
        throw new Error(
          "Refund surcharge state requires reconciliation",
        );
      }

      const total =
        input.principalAmountPaise +
        surchargePaise;

      if (
        !Number.isSafeInteger(total) ||
        total <= 0
      ) {
        throw new Error(
          "Refund amount exceeds the monetary contract",
        );
      }

      // ------------------------------------------------------
      // Persist local refund reservation before provider call.
      // ------------------------------------------------------
      const inserted =
        await client.query(
          `INSERT INTO payment_refunds (
             id,
             tenant_id,
             payment_order_id,
             provider,
             provider_payment_id,
             idempotency_key,
             principal_paise,
             surcharge_paise,
             amount_paise,
             currency,
             reason,
             status,
             requested_by_user_id,
             created_at,
             updated_at
           ) VALUES (
             gen_random_uuid(),
             $1::uuid,
             $2::uuid,
             'razorpay',
             $3::text,
             $4::text,
             $5::bigint,
             $6::bigint,
             $7::bigint,
             'INR',
             $8::text,
             'requested',
             $9::uuid,
             now(),
             now()
           )
           RETURNING
             id,
             payment_order_id
               AS "paymentOrderId",
             provider_payment_id
               AS "providerPaymentId",
             provider_refund_id
               AS "providerRefundId",
             idempotency_key
               AS "idempotencyKey",
             principal_paise::text
               AS "principalPaise",
             surcharge_paise::text
               AS "surchargePaise",
             amount_paise::text
               AS "amountPaise",
             reason,
             status,
             requested_by_user_id
               AS "requestedByUserId"`,
          [
            tenantId,
            input.paymentOrderId,
            attempt.providerPaymentId,
            idempotencyKey,
            input.principalAmountPaise,
            surchargePaise,
            total,
            input.reason,
            userId,
          ],
        );

      return paymentRefundRow(
        inserted.rows[0],
      );
    },
  );

  return attachRemoteRazorpayRefund(
    tenantId,
    local.id,
  );
}

async function attachRemoteRazorpayRefund(
  tenantId: string,
  refundId: string,
): Promise<AdminRefundResult> {
  return withTenantDatabase(
    tenantId,
    async (_database, client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
        [
          `razorpay-refund:${tenantId}:${refundId}`,
        ],
      );

      const result = await client.query(
        `SELECT
           id,
           payment_order_id
             AS "paymentOrderId",
           provider_payment_id
             AS "providerPaymentId",
           provider_refund_id
             AS "providerRefundId",
           idempotency_key
             AS "idempotencyKey",
           principal_paise::text
             AS "principalPaise",
           surcharge_paise::text
             AS "surchargePaise",
           amount_paise::text
             AS "amountPaise",
           reason,
           status,
           requested_by_user_id
             AS "requestedByUserId"
         FROM payment_refunds
         WHERE tenant_id = $1::uuid
           AND id = $2::uuid
           AND provider = 'razorpay'
         FOR UPDATE`,
        [
          tenantId,
          refundId,
        ],
      );

      const refund =
        paymentRefundRow(
          result.rows[0],
        );

      // Already submitted or already final.
      if (
        refund.providerRefundId ||
        refund.status === "failed" ||
        refund.status === "processed"
      ) {
        return paymentAdminRefundResult(
          refund,
        );
      }

      const runtime =
        await runtimeGateway(
          client,
          tenantId,
        );

      const remote =
        await createRazorpayRefund(
          runtime,
          {
            paymentId:
              refund.providerPaymentId,
            amountPaise:
              refund.amountPaise,
            idempotencyKey:
              refund.idempotencyKey,
            refundId:
              refund.id,
            tenantId,
            paymentOrderId:
              refund.paymentOrderId,
            reason:
              refund.reason,
          },
        );

      if (
        remote.paymentId !==
          refund.providerPaymentId ||
        remote.amount !==
          refund.amountPaise ||
        remote.currency !== "INR"
      ) {
        throw new Error(
          "Razorpay refund does not match the local refund request",
        );
      }

      // Even if the API says processed immediately,
      // Stage 11C waits for a verified refund.processed
      // webhook before changing the school fee ledger.
      const localStatus =
        remote.status === "failed"
          ? "failed"
          : "pending";

      await client.query(
        `UPDATE payment_refunds
         SET provider_refund_id =
               $1::text,
             status =
               $2::text,
             updated_at = now()
         WHERE tenant_id = $3::uuid
           AND id = $4::uuid`,
        [
          remote.id,
          localStatus,
          tenantId,
          refund.id,
        ],
      );

      return {
        ...paymentAdminRefundResult(
          refund,
        ),
        providerRefundId:
          remote.id,
        status:
          localStatus,
      };
    },
  );
}

function paymentRefundRow(
  value: unknown,
): RefundRow {
  const row = asRecord(value);

  return {
    id: requireString(
      row.id,
      "refund",
    ),
    paymentOrderId:
      requireString(
        row.paymentOrderId,
        "payment order",
      ),
    providerPaymentId:
      requireString(
        row.providerPaymentId,
        "provider payment",
      ),
    providerRefundId:
      typeof row.providerRefundId ===
        "string"
        ? row.providerRefundId
        : null,
    idempotencyKey:
      requireString(
        row.idempotencyKey,
        "refund idempotency key",
      ),
    principalPaise:
      moneyNumber(
        row.principalPaise,
      ),
    surchargePaise:
      moneyNumber(
        row.surchargePaise,
      ),
    amountPaise:
      moneyNumber(
        row.amountPaise,
      ),
    reason:
      requireString(
        row.reason,
        "refund reason",
      ),
    status:
      typeof row.status === "string"
        ? row.status as RefundRow["status"]
        : "requested",
    requestedByUserId:
      requireString(
        row.requestedByUserId,
        "refund requester",
      ),
  };
}

function paymentAdminRefundResult(
  refund: RefundRow,
): AdminRefundResult {
  return {
    refundId: refund.id,
    paymentOrderId:
      refund.paymentOrderId,
    providerRefundId:
      refund.providerRefundId,
    principalPaise:
      refund.principalPaise,
    surchargePaise:
      refund.surchargePaise,
    amountPaise:
      refund.amountPaise,
    status:
      refund.status,
  };
}

function paymentTimestamp(
  value: unknown,
): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  throw new Error(
    "Stored payment timestamp is invalid",
  );
}


type RefundWebhookEntity = {
  refundId: string;
  localRefundId: string | null;
  paymentId: string;
  amountPaise: number;
  currency: string;
};

async function handleRefundWebhook(
  client: PoolClient,
  tenantId: string,
  webhookId: string,
  eventType: string,
  entity: RefundWebhookEntity | null,
): Promise<RazorpayWebhookResult> {
  if (
    ![
      "refund.created",
      "refund.processed",
      "refund.failed",
    ].includes(eventType)
  ) {
    await finishWebhook(
      client,
      tenantId,
      webhookId,
      "ignored",
      null,
    );

    return { status: "ignored" };
  }

  if (!entity) {
    await finishWebhook(
      client,
      tenantId,
      webhookId,
      "failed",
      "refund_entity_missing",
    );

    return {
      status: "requires_reconciliation",
    };
  }

  /*
   * Prefer the provider refund ID.
   *
   * The local refund UUID from Razorpay notes is also accepted because
   * a webhook may race the original Refund API response before
   * provider_refund_id has been saved locally.
   */
  const refundResult = entity.localRefundId
    ? await client.query(
        `SELECT
           id,
           payment_order_id AS "paymentOrderId",
           provider_payment_id AS "providerPaymentId",
           provider_refund_id AS "providerRefundId",
           idempotency_key AS "idempotencyKey",
           principal_paise::text AS "principalPaise",
           surcharge_paise::text AS "surchargePaise",
           amount_paise::text AS "amountPaise",
           reason,
           status,
           requested_by_user_id AS "requestedByUserId"
         FROM payment_refunds
         WHERE tenant_id = $1::uuid
           AND provider = 'razorpay'
           AND (
             provider_refund_id = $2::text
             OR id = $3::uuid
           )
         LIMIT 1
         FOR UPDATE`,
        [
          tenantId,
          entity.refundId,
          entity.localRefundId,
        ],
      )
    : await client.query(
        `SELECT
           id,
           payment_order_id AS "paymentOrderId",
           provider_payment_id AS "providerPaymentId",
           provider_refund_id AS "providerRefundId",
           idempotency_key AS "idempotencyKey",
           principal_paise::text AS "principalPaise",
           surcharge_paise::text AS "surchargePaise",
           amount_paise::text AS "amountPaise",
           reason,
           status,
           requested_by_user_id AS "requestedByUserId"
         FROM payment_refunds
         WHERE tenant_id = $1::uuid
           AND provider = 'razorpay'
           AND provider_refund_id = $2::text
         LIMIT 1
         FOR UPDATE`,
        [
          tenantId,
          entity.refundId,
        ],
      );

  if (!refundResult.rows[0]) {
    await finishWebhook(
      client,
      tenantId,
      webhookId,
      "ignored",
      "unknown_refund",
    );

    return { status: "ignored" };
  }

  const refund = paymentRefundRow(
    refundResult.rows[0],
  );

  /*
   * Never accept a webhook for the wrong payment or amount.
   */
  if (
    refund.providerPaymentId !== entity.paymentId ||
    refund.amountPaise !== entity.amountPaise ||
    entity.currency !== "INR"
  ) {
    await client.query(
      `UPDATE payment_orders
       SET status = 'requires_reconciliation',
           updated_at = now()
       WHERE tenant_id = $1::uuid
         AND id = $2::uuid`,
      [
        tenantId,
        refund.paymentOrderId,
      ],
    );

    await finishWebhook(
      client,
      tenantId,
      webhookId,
      "processed",
      "refund_amount_mismatch",
    );

    return {
      status: "requires_reconciliation",
    };
  }

  /*
   * Backfill provider_refund_id if webhook won the race against
   * the API response.
   */
  await client.query(
    `UPDATE payment_refunds
     SET provider_refund_id =
           COALESCE(
             provider_refund_id,
             $1::text
           ),
         updated_at = now()
     WHERE tenant_id = $2::uuid
       AND id = $3::uuid`,
    [
      entity.refundId,
      tenantId,
      refund.id,
    ],
  );

  /*
   * refund.created reserves the refund but does not touch fees.
   */
  if (eventType === "refund.created") {
    if (refund.status !== "processed") {
      await client.query(
        `UPDATE payment_refunds
         SET status = 'pending',
             updated_at = now()
         WHERE tenant_id = $1::uuid
           AND id = $2::uuid`,
        [
          tenantId,
          refund.id,
        ],
      );
    }

    await finishWebhook(
      client,
      tenantId,
      webhookId,
      "processed",
      null,
    );

    return { status: "processed" };
  }

  /*
   * Failed refunds release the reserved amount because reservation
   * queries ignore failed rows.
   *
   * A late failure can never downgrade an already-processed refund.
   */
  if (eventType === "refund.failed") {
    if (refund.status !== "processed") {
      await client.query(
        `UPDATE payment_refunds
         SET status = 'failed',
             updated_at = now()
         WHERE tenant_id = $1::uuid
           AND id = $2::uuid`,
        [
          tenantId,
          refund.id,
        ],
      );
    }

    await finishWebhook(
      client,
      tenantId,
      webhookId,
      "processed",
      null,
    );

    return { status: "processed" };
  }

  /*
   * From here onward this is refund.processed.
   *
   * A duplicate webhook event ID is already blocked by
   * payment_webhook_events. This second check also makes processing
   * safe across distinct provider events describing the same refund.
   */
  if (refund.status === "processed") {
    await finishWebhook(
      client,
      tenantId,
      webhookId,
      "processed",
      null,
    );

    return { status: "processed" };
  }

  /*
   * Lock the original payment order before changing the school ledger.
   */
  const orderResult = await client.query(
    `SELECT
       id,
       invoice_id AS "invoiceId",
       amount_paise::text AS "amountPaise",
       status
     FROM payment_orders
     WHERE tenant_id = $1::uuid
       AND id = $2::uuid
       AND provider = 'razorpay'
     FOR UPDATE`,
    [
      tenantId,
      refund.paymentOrderId,
    ],
  );

  const order = orderResult.rows[0];

  if (!order) {
    await finishWebhook(
      client,
      tenantId,
      webhookId,
      "failed",
      "refund_order_missing",
    );

    return {
      status: "requires_reconciliation",
    };
  }

  /*
   * Never auto-adjust a payment that is already under financial
   * investigation.
   */
  if (
    String(order.status) ===
      "requires_reconciliation"
  ) {
    await finishWebhook(
      client,
      tenantId,
      webhookId,
      "processed",
      "payment_requires_reconciliation",
    );

    return {
      status: "requires_reconciliation",
    };
  }

  /*
   * A processed refund must belong to a payment that was actually
   * captured previously.
   */
  if (
    ![
      "paid",
      "partially_refunded",
      "refunded",
    ].includes(String(order.status))
  ) {
    await client.query(
      `UPDATE payment_orders
       SET status = 'requires_reconciliation',
           updated_at = now()
       WHERE tenant_id = $1::uuid
         AND id = $2::uuid`,
      [
        tenantId,
        refund.paymentOrderId,
      ],
    );

    await finishWebhook(
      client,
      tenantId,
      webhookId,
      "processed",
      "refund_order_state_invalid",
    );

    return {
      status: "requires_reconciliation",
    };
  }

  /*
   * Lock the fee invoice in the same transaction.
   */
  const invoiceResult = await client.query(
    `SELECT
       amount_paise::text AS "amountPaise",
       paid_paise::text AS "paidPaise"
     FROM fee_invoices
     WHERE tenant_id = $1::uuid
       AND id = $2::uuid
     FOR UPDATE`,
    [
      tenantId,
      order.invoiceId,
    ],
  );

  const invoice = invoiceResult.rows[0];

  if (!invoice) {
    await client.query(
      `UPDATE payment_orders
       SET status = 'requires_reconciliation',
           updated_at = now()
       WHERE tenant_id = $1::uuid
         AND id = $2::uuid`,
      [
        tenantId,
        refund.paymentOrderId,
      ],
    );

    await finishWebhook(
      client,
      tenantId,
      webhookId,
      "processed",
      "refund_invoice_missing",
    );

    return {
      status: "requires_reconciliation",
    };
  }

  const invoiceTotal = moneyNumber(
    invoice.amountPaise,
  );

  const currentPaid = moneyNumber(
    invoice.paidPaise,
  );

  /*
   * Only the principal portion reverses the school fee collection.
   * Gateway surcharge is financially separate.
   */
  if (refund.principalPaise > currentPaid) {
    await client.query(
      `UPDATE payment_orders
       SET status = 'requires_reconciliation',
           updated_at = now()
       WHERE tenant_id = $1::uuid
         AND id = $2::uuid`,
      [
        tenantId,
        refund.paymentOrderId,
      ],
    );

    await finishWebhook(
      client,
      tenantId,
      webhookId,
      "processed",
      "refund_ledger_underflow",
    );

    return {
      status: "requires_reconciliation",
    };
  }

  const nextPaid =
    currentPaid - refund.principalPaise;

  if (
    nextPaid < 0 ||
    nextPaid > invoiceTotal
  ) {
    await client.query(
      `UPDATE payment_orders
       SET status = 'requires_reconciliation',
           updated_at = now()
       WHERE tenant_id = $1::uuid
         AND id = $2::uuid`,
      [
        tenantId,
        refund.paymentOrderId,
      ],
    );

    await finishWebhook(
      client,
      tenantId,
      webhookId,
      "processed",
      "refund_invoice_balance_invalid",
    );

    return {
      status: "requires_reconciliation",
    };
  }

  /*
   * Before touching the school fee ledger, verify that this refund
   * cannot make total processed provider refunds exceed the original
   * gateway payment.
   */
  const previousProcessedRefunds =
    await client.query(
      `SELECT
         COALESCE(
           SUM(amount_paise),
           0
         )::text AS "amountPaise"
       FROM payment_refunds
       WHERE tenant_id = $1::uuid
         AND payment_order_id = $2::uuid
         AND status = 'processed'
         AND id <> $3::uuid`,
      [
        tenantId,
        refund.paymentOrderId,
        refund.id,
      ],
    );

  const previousGatewayRefundedPaise =
    moneyNumber(
      previousProcessedRefunds.rows[0]
        ?.amountPaise ?? "0",
    );

  const originalGatewayAmount =
    moneyNumber(order.amountPaise);

  const projectedGatewayRefundedPaise =
    previousGatewayRefundedPaise +
    refund.amountPaise;

  if (
    projectedGatewayRefundedPaise >
    originalGatewayAmount
  ) {
    await client.query(
      `UPDATE payment_orders
       SET status = 'requires_reconciliation',
           updated_at = now()
       WHERE tenant_id = $1::uuid
         AND id = $2::uuid`,
      [
        tenantId,
        refund.paymentOrderId,
      ],
    );

    await finishWebhook(
      client,
      tenantId,
      webhookId,
      "processed",
      "gateway_refund_overflow",
    );

    return {
      status: "requires_reconciliation",
    };
  }

  const paymentStatus =
    projectedGatewayRefundedPaise ===
      originalGatewayAmount
      ? "refunded"
      : "partially_refunded";

  /*
   * VERIFIED FINANCIAL REVERSAL BOUNDARY.
   *
   * No earlier refund path changes fee_invoices.
   */
  await client.query(
    `UPDATE fee_invoices
     SET paid_paise = $1::bigint,
         status = $2::invoice_status,
         updated_at = now()
     WHERE tenant_id = $3::uuid
       AND id = $4::uuid`,
    [
      nextPaid,
      nextPaid === 0
        ? "due"
        : nextPaid === invoiceTotal
          ? "paid"
          : "partial",
      tenantId,
      order.invoiceId,
    ],
  );

  await client.query(
    `UPDATE payment_refunds
     SET status = 'processed',
         processed_at = now(),
         updated_at = now()
     WHERE tenant_id = $1::uuid
       AND id = $2::uuid`,
    [
      tenantId,
      refund.id,
    ],
  );

  await client.query(
    `UPDATE payment_orders
     SET status = $1::text,
         updated_at = now()
     WHERE tenant_id = $2::uuid
       AND id = $3::uuid`,
    [
      paymentStatus,
      tenantId,
      refund.paymentOrderId,
    ],
  );

  await client.query(
    `UPDATE payment_attempts
     SET status = $1::text,
         updated_at = now()
     WHERE tenant_id = $2::uuid
       AND payment_order_id = $3::uuid
       AND provider = 'razorpay'
       AND provider_payment_id = $4::text`,
    [
      paymentStatus,
      tenantId,
      refund.paymentOrderId,
      refund.providerPaymentId,
    ],
  );

  /*
   * Immutable financial audit evidence.
   */
  await client.query(
    `INSERT INTO audit_events (
       id,
       tenant_id,
       actor_id,
       action,
       resource_type,
       resource_id,
       reason,
       metadata,
       occurred_at
     ) VALUES (
       gen_random_uuid(),
       $1::uuid,
       $2::uuid,
       'fee.payment.gateway_refund',
       'payment_refund',
       $3::text,
       'Verified Razorpay refund processed',
       $4::jsonb,
       now()
     )`,
    [
      tenantId,
      refund.requestedByUserId,
      refund.id,
      JSON.stringify({
        provider: "razorpay",
        paymentOrderId:
          refund.paymentOrderId,
        providerPaymentId:
          refund.providerPaymentId,
        providerRefundId:
          entity.refundId,
        principalPaise:
          refund.principalPaise,
        surchargePaise:
          refund.surchargePaise,
        refundAmountPaise:
          refund.amountPaise,
        invoicePaidPaiseAfterRefund:
          nextPaid,
        paymentStatus,
      }),
    ],
  );

  await finishWebhook(
    client,
    tenantId,
    webhookId,
    "processed",
    null,
  );

  return { status: "processed" };
}

function refundWebhookEntity(
  value: unknown,
): RefundWebhookEntity | null {
  const root = asRecord(value);
  const payload = asRecord(root.payload);
  const wrapper = asRecord(payload.refund);
  const entity = asRecord(wrapper.entity);

  if (!Object.keys(entity).length) {
    return null;
  }

  const refundId =
    typeof entity.id === "string"
      ? entity.id
      : "";

  const paymentId =
    typeof entity.payment_id === "string"
      ? entity.payment_id
      : "";

  const amountPaise =
    typeof entity.amount === "number"
      ? entity.amount
      : Number.NaN;

  const currency =
    typeof entity.currency === "string"
      ? entity.currency
      : "";

  const notes = asRecord(entity.notes);

  const possibleLocalRefundId =
    typeof notes.hig_refund_id === "string"
      ? notes.hig_refund_id
      : null;

  const localRefundId =
    possibleLocalRefundId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(possibleLocalRefundId)
      ? possibleLocalRefundId
      : null;

  if (
    !refundId.startsWith("rfnd_") ||
    !paymentId.startsWith("pay_") ||
    !Number.isSafeInteger(amountPaise) ||
    amountPaise <= 0
  ) {
    return null;
  }

  return {
    refundId,
    localRefundId,
    paymentId,
    amountPaise,
    currency,
  };
}
