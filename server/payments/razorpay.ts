import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

export type RazorpayRuntimeCredentials = {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
};

export type RazorpayRemoteOrder = {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: "created" | "attempted" | "paid";
};

export type RazorpayRemoteRefund = {
  id: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: "pending" | "processed" | "failed";
};

export function validRazorpayRefundIdempotencyKey(
  value: string,
): boolean {
  return /^[A-Za-z0-9_-]{10,200}$/.test(value);
}

export function paymentRefundReceipt(
  refundId: string,
): string {
  const compact = refundId.replaceAll("-", "");
  return `hig_rfnd_${compact.slice(0, 30)}`;
}

type UnknownRecord = Record<string, unknown>;

export function calculatePaymentSurchargePaise(
  invoiceAmountPaise: number,
  enabled: boolean,
  type: "flat" | "percentage",
  value: number,
): number {
  if (!enabled || value <= 0) return 0;

  const surcharge = type === "flat"
    ? Math.round(value * 100)
    : Math.round(invoiceAmountPaise * value / 100);

  if (!Number.isSafeInteger(surcharge) || surcharge < 0) {
    throw new Error("Payment surcharge exceeds the monetary contract");
  }

  return surcharge;
}

export function paymentOrderReceipt(paymentOrderId: string): string {
  const compact = paymentOrderId.replaceAll("-", "");
  return `hig_${compact.slice(0, 32)}`;
}

export function verifyRazorpayCheckoutSignature(
  serverOrderId: string,
  paymentId: string,
  receivedSignature: string,
  keySecret: string,
): boolean {
  const expected = createHmac("sha256", keySecret)
    .update(`${serverOrderId}|${paymentId}`, "utf8")
    .digest("hex");

  return safeHexEqual(expected, receivedSignature);
}

export function verifyRazorpayWebhookSignature(
  rawBody: string,
  receivedSignature: string,
  webhookSecret: string,
): boolean {
  const expected = createHmac("sha256", webhookSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  return safeHexEqual(expected, receivedSignature);
}

export function razorpayPayloadSha256(rawBody: string): string {
  return createHash("sha256")
    .update(rawBody, "utf8")
    .digest("hex");
}

export async function createRazorpayRefund(
  credentials: RazorpayRuntimeCredentials,
  input: {
    paymentId: string;
    amountPaise: number;
    idempotencyKey: string;
    refundId: string;
    tenantId: string;
    paymentOrderId: string;
    reason: string;
  },
): Promise<RazorpayRemoteRefund> {
  if (!validRazorpayRefundIdempotencyKey(input.idempotencyKey)) {
    throw new Error("Invalid Razorpay refund idempotency key");
  }

  const response = await razorpayRequest(
    credentials,
    "POST",
    `/v1/payments/${encodeURIComponent(input.paymentId)}/refund`,
    {
      amount: input.amountPaise,
      speed: "normal",
      receipt: paymentRefundReceipt(input.refundId),
      notes: {
        hig_refund_id: input.refundId,
        payment_order_id: input.paymentOrderId,
        tenant_id: input.tenantId,
        reason: input.reason.slice(0, 240),
      },
    },
    {
      "x-refund-idempotency": input.idempotencyKey,
    },
  );

  return parseRazorpayRefund(response);
}

export async function findRazorpayOrderByReceipt(
  credentials: RazorpayRuntimeCredentials,
  receipt: string,
): Promise<RazorpayRemoteOrder | null> {
  const response = await razorpayRequest(
    credentials,
    "GET",
    `/v1/orders?receipt=${encodeURIComponent(receipt)}&count=1`,
  );

  const record = asRecord(response);
  const items = Array.isArray(record.items) ? record.items : [];

  if (!items.length) return null;

  return parseRazorpayOrder(items[0]);
}

export async function createRazorpayOrder(
  credentials: RazorpayRuntimeCredentials,
  input: {
    amountPaise: number;
    receipt: string;
    tenantId: string;
    paymentOrderId: string;
    invoiceId: string;
  },
): Promise<RazorpayRemoteOrder> {
  const response = await razorpayRequest(
    credentials,
    "POST",
    "/v1/orders",
    {
      amount: input.amountPaise,
      currency: "INR",
      receipt: input.receipt,
      notes: {
        tenant_id: input.tenantId,
        payment_order_id: input.paymentOrderId,
        invoice_id: input.invoiceId,
      },
    },
  );

  return parseRazorpayOrder(response);
}

async function razorpayRequest(
  credentials: RazorpayRuntimeCredentials,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`https://api.razorpay.com${path}`, {
      method,
      headers: {
        authorization:
          `Basic ${Buffer.from(
            `${credentials.keyId}:${credentials.keySecret}`,
            "utf8",
          ).toString("base64")}`,
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const raw = await response.text();
    let parsed: unknown = {};

    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      parsed = {};
    }

    if (!response.ok) {
      throw new Error(`Razorpay request failed (${response.status})`);
    }

    return parsed;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Razorpay request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseRazorpayRefund(
  value: unknown,
): RazorpayRemoteRefund {
  const record = asRecord(value);

  if (
    typeof record.id !== "string" ||
    !record.id.startsWith("rfnd_") ||
    typeof record.payment_id !== "string" ||
    !record.payment_id.startsWith("pay_") ||
    !Number.isSafeInteger(record.amount) ||
    Number(record.amount) <= 0 ||
    typeof record.currency !== "string" ||
    !["pending", "processed", "failed"].includes(
      String(record.status),
    )
  ) {
    throw new Error("Razorpay returned an invalid refund response");
  }

  return {
    id: record.id,
    paymentId: record.payment_id,
    amount: record.amount as number,
    currency: record.currency,
    status: record.status as RazorpayRemoteRefund["status"],
  };
}

function parseRazorpayOrder(value: unknown): RazorpayRemoteOrder {
  const record = asRecord(value);

  if (
    typeof record.id !== "string" ||
    !record.id.startsWith("order_") ||
    !Number.isSafeInteger(record.amount) ||
    typeof record.currency !== "string" ||
    typeof record.receipt !== "string" ||
    !["created", "attempted", "paid"].includes(String(record.status))
  ) {
    throw new Error("Razorpay returned an invalid order response");
  }

  return {
    id: record.id,
    amount: record.amount as number,
    currency: record.currency,
    receipt: record.receipt,
    status: record.status as RazorpayRemoteOrder["status"],
  };
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function safeHexEqual(expected: string, received: string): boolean {
  if (
    !/^[0-9a-f]{64}$/i.test(expected) ||
    !/^[0-9a-f]{64}$/i.test(received)
  ) {
    return false;
  }

  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(received, "hex");

  return left.length === right.length && timingSafeEqual(left, right);
}
