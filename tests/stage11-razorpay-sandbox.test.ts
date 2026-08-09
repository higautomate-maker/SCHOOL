import assert from "node:assert/strict";
import {
  createHmac,
} from "node:crypto";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

import {
  calculatePaymentSurchargePaise,
  paymentOrderReceipt,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature,
} from "../server/payments/razorpay.ts";

import {
  paymentOrderCreateSchema,
  razorpayCheckoutVerifySchema,
  razorpayWebhookHeadersSchema,
} from "../server/payments/contracts.ts";

test("payment surcharge stays in exact integer paise", () => {
  assert.equal(
    calculatePaymentSurchargePaise(
      450000,
      true,
      "percentage",
      1.5,
    ),
    6750,
  );

  assert.equal(
    calculatePaymentSurchargePaise(
      450000,
      true,
      "flat",
      25,
    ),
    2500,
  );

  assert.equal(
    calculatePaymentSurchargePaise(
      450000,
      false,
      "percentage",
      50,
    ),
    0,
  );
});

test("Razorpay receipt is deterministic and within provider limit", () => {
  const receipt = paymentOrderReceipt(
    "11111111-2222-4333-8444-555555555555",
  );

  assert.equal(
    receipt,
    "hig_11111111222243338444555555555555",
  );

  assert.ok(receipt.length <= 40);
});

test("checkout signature validates server order id plus payment id", () => {
  const secret = "stage11-secret";
  const serverOrderId = "order_HIGSCHOOL123";
  const paymentId = "pay_HIGSCHOOL456";

  const signature = createHmac("sha256", secret)
    .update(`${serverOrderId}|${paymentId}`)
    .digest("hex");

  assert.equal(
    verifyRazorpayCheckoutSignature(
      serverOrderId,
      paymentId,
      signature,
      secret,
    ),
    true,
  );

  assert.equal(
    verifyRazorpayCheckoutSignature(
      "order_ATTACKER",
      paymentId,
      signature,
      secret,
    ),
    false,
  );
});

test("webhook verification depends on exact raw request body", () => {
  const secret = "stage11-webhook-secret";
  const raw =
    '{"event":"payment.captured","payload":{"value":1}}';

  const signature = createHmac("sha256", secret)
    .update(raw)
    .digest("hex");

  assert.equal(
    verifyRazorpayWebhookSignature(
      raw,
      signature,
      secret,
    ),
    true,
  );

  assert.equal(
    verifyRazorpayWebhookSignature(
      raw + "\n",
      signature,
      secret,
    ),
    false,
  );
});

test("payment contracts reject malformed Razorpay identities", () => {
  assert.equal(
    paymentOrderCreateSchema.safeParse({
      invoiceId:
        "11111111-1111-4111-8111-111111111111",
    }).success,
    true,
  );

  assert.equal(
    razorpayCheckoutVerifySchema.safeParse({
      paymentOrderId:
        "11111111-1111-4111-8111-111111111111",
      razorpayOrderId: "attacker_order",
      razorpayPaymentId: "pay_valid123",
      razorpaySignature: "a".repeat(64),
    }).success,
    false,
  );

  assert.equal(
    razorpayWebhookHeadersSchema.safeParse({
      signature: "a".repeat(64),
      eventId: "evt-123",
    }).success,
    true,
  );
});

test("webhook route consumes raw body before payment processing", () => {
  const source = readFileSync(
    "app/api/v1/payments/webhooks/razorpay/[schoolId]/route.ts",
    "utf8",
  );

  assert.match(
    source,
    /const rawBody = await request\.text\(\)/,
  );

  assert.doesNotMatch(
    source,
    /request\.json\(\)/,
  );

  assert.match(
    source,
    /x-razorpay-signature/,
  );

  assert.match(
    source,
    /x-razorpay-event-id/,
  );
});

test("parent order service derives student authorization server-side", () => {
  const source = readFileSync(
    "server/payments/service.ts",
    "utf8",
  );

  assert.match(
    source,
    /principal\.principalType !== "parent"/,
  );

  assert.match(
    source,
    /activeAssignmentsForPrincipal/,
  );

  assert.match(
    source,
    /resourceType === "student"/,
  );

  assert.match(
    source,
    /Idempotency-Key header is required/,
  );
});

test("payment repository locks invoices and never trusts callback for capture", () => {
  const source = readFileSync(
    "server/payments/postgres-repository.ts",
    "utf8",
  );

  assert.match(
    source,
    /FROM fee_invoices[\s\S]*FOR UPDATE/,
  );

  assert.match(
    source,
    /verifyRazorpayCheckoutSignature/,
  );

  assert.match(
    source,
    /status: "awaiting_capture"/,
  );

  assert.match(
    source,
    /eventType !== "payment\.captured"/,
  );

  assert.match(
    source,
    /INSERT INTO fee_payments/,
  );

  assert.match(
    source,
    /requires_reconciliation/,
  );
});

test("webhook event id and payment order state provide duplicate protection", () => {
  const source = readFileSync(
    "server/payments/postgres-repository.ts",
    "utf8",
  );

  assert.match(
    source,
    /ON CONFLICT \([\s\S]*provider_event_id[\s\S]*DO NOTHING/,
  );

  assert.match(
    source,
    /provider_payment_id/,
  );

  assert.match(
    source,
    /\["paid", "partially_refunded", "refunded"\]/,
  );
});

test("local migration supports captured-payment reconciliation", () => {
  const migration = readFileSync(
    "drizzle-postgres/0014_payment_foundation.sql",
    "utf8",
  );

  assert.match(
    migration,
    /requires_reconciliation/,
  );

  assert.match(
    migration,
    /payment_webhook_events_provider_event_uq/,
  );

  assert.doesNotMatch(
    migration,
    /raw_payload|raw_body|webhook_body/,
  );
});

test("settings show tenant-specific webhook route shape", () => {
  const source = readFileSync(
    "app/school/page.tsx",
    "utf8",
  );

  assert.match(
    source,
    /\/api\/v1\/payments\/webhooks\/razorpay\/\[school-id\]/,
  );

  assert.doesNotMatch(
    source,
    /chatgpt\.site/,
  );
});
