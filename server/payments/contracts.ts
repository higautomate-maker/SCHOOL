import { z } from "zod";

const razorpayOrderId = z.string()
  .trim()
  .regex(/^order_[A-Za-z0-9]+$/)
  .max(100);

const razorpayPaymentId = z.string()
  .trim()
  .regex(/^pay_[A-Za-z0-9]+$/)
  .max(100);

export const paymentOrderCreateSchema = z.object({
  invoiceId: z.string().uuid(),
});

export const razorpayCheckoutVerifySchema = z.object({
  paymentOrderId: z.string().uuid(),
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature: z.string()
    .trim()
    .regex(/^[0-9a-f]{64}$/i),
});

export const razorpayWebhookHeadersSchema = z.object({
  signature: z.string()
    .trim()
    .regex(/^[0-9a-f]{64}$/i),
  eventId: z.string().trim().min(1).max(200),
});

export type PaymentOrderCreate = z.infer<
  typeof paymentOrderCreateSchema
>;

export type RazorpayCheckoutVerify = z.infer<
  typeof razorpayCheckoutVerifySchema
>;

export const paymentRefundRequestSchema = z.object({
  action: z.literal("refund"),
  paymentOrderId: z.string().uuid(),
  principalAmountPaise: z.number()
    .int()
    .min(100)
    .max(100_000_000),
  refundRemainingSurcharge: z.boolean().default(false),
  reason: z.string().trim().min(5).max(240),
});

export type PaymentRefundRequest = z.infer<
  typeof paymentRefundRequestSchema
>;
