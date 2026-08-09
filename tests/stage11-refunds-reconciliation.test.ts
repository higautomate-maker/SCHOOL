import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

import {
  paymentRefundReceipt,
  validRazorpayRefundIdempotencyKey,
} from "../server/payments/razorpay.ts";

import {
  paymentRefundRequestSchema,
} from "../server/payments/contracts.ts";

test("refund idempotency key is bounded and provider safe", () => {
  assert.equal(
    validRazorpayRefundIdempotencyKey(
      "refund_123456",
    ),
    true,
  );

  assert.equal(
    validRazorpayRefundIdempotencyKey(
      "short",
    ),
    false,
  );

  assert.equal(
    validRazorpayRefundIdempotencyKey(
      "refund key with spaces",
    ),
    false,
  );
});

test("refund receipt is deterministic and bounded", () => {
  const receipt =
    paymentRefundReceipt(
      "11111111-2222-4333-8444-555555555555",
    );

  assert.match(
    receipt,
    /^hig_rfnd_/,
  );

  assert.ok(
    receipt.length <= 40,
  );
});

test("refund request requires integer paise and reason", () => {
  assert.equal(
    paymentRefundRequestSchema.safeParse({
      action: "refund",
      paymentOrderId:
        "11111111-1111-4111-8111-111111111111",
      principalAmountPaise: 25000,
      refundRemainingSurcharge: false,
      reason:
        "Duplicate fee collection",
    }).success,
    true,
  );

  assert.equal(
    paymentRefundRequestSchema.safeParse({
      action: "refund",
      paymentOrderId:
        "11111111-1111-4111-8111-111111111111",
      principalAmountPaise: 25.5,
      reason: "bad",
    }).success,
    false,
  );
});

test("refund table is tenant isolated", () => {
  const migration =
    readFileSync(
      "drizzle-postgres/0014_payment_foundation.sql",
      "utf8",
    );

  assert.match(
    migration,
    /CREATE TABLE "payment_refunds"/,
  );

  assert.match(
    migration,
    /payment_refunds_tenant_idempotency_uq/,
  );

  assert.match(
    migration,
    /ALTER TABLE "payment_refunds" FORCE ROW LEVEL SECURITY/,
  );

  assert.match(
    migration,
    /CREATE POLICY "payment_refunds_isolation"/,
  );
});

test("provider refund uses Razorpay idempotency", () => {
  const source =
    readFileSync(
      "server/payments/razorpay.ts",
      "utf8",
    );

  assert.match(
    source,
    /\/v1\/payments\/\$\{encodeURIComponent\(input\.paymentId\)\}\/refund/,
  );

  assert.match(
    source,
    /"x-refund-idempotency": input\.idempotencyKey/,
  );

  assert.match(
    source,
    /speed: "normal"/,
  );
});

test("refund reservation prevents over-refund", () => {
  const source =
    readFileSync(
      "server/payments/postgres-repository.ts",
      "utf8",
    );

  assert.match(
    source,
    /status IN \([\s\S]*'requested'[\s\S]*'pending'[\s\S]*'processed'/,
  );

  assert.match(
    source,
    /availablePrincipal/,
  );

  assert.match(
    source,
    /Refund exceeds the remaining refundable fee amount/,
  );

  assert.match(
    source,
    /payment-refund:\$\{tenantId\}:\$\{input\.paymentOrderId\}/,
  );
});

test("refund API response never directly reverses fee ledger", () => {
  const source =
    readFileSync(
      "server/payments/postgres-repository.ts",
      "utf8",
    );

  const start =
    source.indexOf(
      "async function attachRemoteRazorpayRefund",
    );

  const end =
    source.indexOf(
      "function paymentRefundRow",
      start,
    );

  const section =
    source.slice(start, end);

  assert.doesNotMatch(
    section,
    /UPDATE fee_invoices/,
  );

  assert.match(
    section,
    /createRazorpayRefund/,
  );
});

test("refund webhooks support created processed and failed", () => {
  const source =
    readFileSync(
      "server/payments/postgres-repository.ts",
      "utf8",
    );

  assert.match(
    source,
    /refund\.created/,
  );

  assert.match(
    source,
    /refund\.processed/,
  );

  assert.match(
    source,
    /refund\.failed/,
  );
});

test("refund processed is verified ledger reversal boundary", () => {
  const source =
    readFileSync(
      "server/payments/postgres-repository.ts",
      "utf8",
    );

  assert.match(
    source,
    /currentPaid - refund\.principalPaise/,
  );

  assert.match(
    source,
    /UPDATE fee_invoices/,
  );

  assert.match(
    source,
    /fee\.payment\.gateway_refund/,
  );

  assert.match(
    source,
    /projectedGatewayRefundedPaise/,
  );

  const overflow =
    source.indexOf(
      "gateway_refund_overflow",
    );

  const ledger =
    source.indexOf(
      "VERIFIED FINANCIAL REVERSAL BOUNDARY",
    );

  assert.ok(
    overflow >= 0 &&
    ledger >= 0 &&
    overflow < ledger,
  );
});

test("processed refund cannot be downgraded by late failure", () => {
  const source =
    readFileSync(
      "server/payments/postgres-repository.ts",
      "utf8",
    );

  assert.match(
    source,
    /eventType === "refund\.failed"/,
  );

  assert.match(
    source,
    /refund\.status !== "processed"/,
  );
});

test("school refund administration requires financial step-up", () => {
  const route =
    readFileSync(
      "app/api/v1/schools/[schoolId]/payments/route.ts",
      "utf8",
    );

  assert.match(
    route,
    /policies\.operationsManage/,
  );

  assert.match(
    route,
    /assertSchoolModuleAccess[\s\S]*"fees_finance"[\s\S]*"manage"/,
  );

  assert.match(
    route,
    /authRateLimit[\s\S]*"sensitive"/,
  );

  assert.match(
    route,
    /verifyPassword/,
  );

  assert.match(
    route,
    /auth\.step_up\.payment_refund/,
  );

  assert.doesNotMatch(
    route,
    /keySecret|webhookSecret/,
  );
});
