import { z } from "zod";

export const notificationTopics = [
  "attendance.mark",
  "fee.invoice.create",
  "fee.payment.collect",
  "notice.publish",
  "homework.publish",
  "exam.publish",
  "transport.alert",
] as const;

export type NotificationTopic = typeof notificationTopics[number];
export type NotificationRecipientType =
  | "user"
  | "staff"
  | "student"
  | "parent"
  | "driver"
  | "audience";
export type NotificationChannel = "in_app" | "email" | "sms" | "push" | "capture";

const notificationTopicSchema = z.enum(notificationTopics);
const payloadSchema = z.record(z.string(), z.unknown());
const outboxRowSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  topic: notificationTopicSchema,
  aggregate_type: z.string().trim().min(1).max(100),
  aggregate_id: z.string().trim().min(1).max(200),
  payload: z.unknown(),
  created_at: z.union([z.date(), z.string().min(1)]),
});

export type NotificationEvent = {
  eventId: string;
  tenantId: string;
  topic: NotificationTopic;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  schemaVersion: 1;
  payload: Record<string, unknown>;
  correlationId: string;
  idempotencyKey: string;
};

export type DeliveryPlan = {
  recipientType: NotificationRecipientType;
  recipientId: string | null;
  channel: NotificationChannel;
  templateKey: string;
  payload: Record<string, unknown>;
};

export type DeliveryOutcome = {
  plan: DeliveryPlan;
  provider: string;
  status: "delivered" | "skipped";
  errorCode: string | null;
  providerMessageId: string | null;
  metadata: Record<string, unknown>;
};

export function normalizeOutboxEvent(row: unknown): NotificationEvent {
  const parsed = outboxRowSchema.parse(row);
  const payload = payloadSchema.safeParse(parsed.payload);
  const occurredAt = new Date(parsed.created_at);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error("Outbox event created_at is invalid");
  }

  return {
    eventId: parsed.id,
    tenantId: parsed.tenant_id,
    topic: parsed.topic,
    aggregateType: parsed.aggregate_type,
    aggregateId: parsed.aggregate_id,
    occurredAt: occurredAt.toISOString(),
    schemaVersion: 1,
    payload: payload.success ? payload.data : {},
    correlationId: parsed.id,
    idempotencyKey: `notification:${parsed.id}`,
  };
}

export function routeNotificationEvent(event: NotificationEvent): DeliveryPlan[] {
  const message = notificationPayload(event);
  const studentId = optionalUuid(event.payload.studentId);

  if (
    event.topic === "attendance.mark"
    || event.topic === "fee.invoice.create"
    || event.topic === "fee.payment.collect"
  ) {
    if (!studentId) {
      return [{
        recipientType: "audience",
        recipientId: null,
        channel: "in_app",
        templateKey: `${event.topic}.legacy`,
        payload: { ...message, audience: "school", legacyRecipientResolution: true },
      }];
    }

    return [
      {
        recipientType: "parent",
        recipientId: studentId,
        channel: "in_app",
        templateKey: `${event.topic}.parent`,
        payload: { ...message, audience: "parent", studentId },
      },
      {
        recipientType: "student",
        recipientId: studentId,
        channel: "in_app",
        templateKey: `${event.topic}.student`,
        payload: { ...message, audience: "student", studentId },
      },
    ];
  }

  return [{
    recipientType: "audience",
    recipientId: null,
    channel: "in_app",
    templateKey: event.topic,
    payload: { ...message, audience: "school" },
  }];
}

function notificationPayload(event: NotificationEvent): Record<string, unknown> {
  const common: Record<string, unknown> = {
    eventId: event.eventId,
    topic: event.topic,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    occurredAt: event.occurredAt,
  };

  if (event.topic === "attendance.mark") {
    return compact({
      ...common,
      studentId: optionalUuid(event.payload.studentId),
      attendanceDate: optionalString(event.payload.attendanceDate),
      status: optionalString(event.payload.status),
    });
  }

  if (event.topic === "fee.invoice.create") {
    return compact({
      ...common,
      studentId: optionalUuid(event.payload.studentId),
      feeType: optionalString(event.payload.feeType),
      amountPaise: optionalSafeInteger(event.payload.amountPaise),
      dueDate: optionalString(event.payload.dueDate),
    });
  }

  if (event.topic === "fee.payment.collect") {
    return compact({
      ...common,
      studentId: optionalUuid(event.payload.studentId),
      invoiceId: optionalUuid(event.payload.invoiceId),
      amountPaise: optionalSafeInteger(event.payload.amountPaise),
      balancePaise: optionalSafeInteger(event.payload.balancePaise),
      method: optionalString(event.payload.method),
    });
  }

  return common;
}

function optionalUuid(value: unknown): string | null {
  const parsed = z.string().uuid().safeParse(value);
  return parsed.success ? parsed.data : null;
}

function optionalString(value: unknown): string | null {
  const parsed = z.string().trim().min(1).max(200).safeParse(value);
  return parsed.success ? parsed.data : null;
}

function optionalSafeInteger(value: unknown): number | null {
  const parsed = z.number().int().nonnegative().safeParse(value);
  return parsed.success && Number.isSafeInteger(parsed.data) ? parsed.data : null;
}

function compact(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== null && value !== undefined),
  );
}
