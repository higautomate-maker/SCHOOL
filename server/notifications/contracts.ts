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

  if (event.topic === "transport.alert") {
    const transportEventType = optionalString(event.payload.transportEventType);
    const studentIds = uniqueUuidList(
      event.payload.studentIds,
      optionalUuid(event.payload.studentId),
    );
    const schoolPlan: DeliveryPlan = {
      recipientType: "audience",
      recipientId: null,
      channel: "in_app",
      templateKey: `transport.alert.${transportEventType ?? "event"}.school`,
      payload: {
        ...message,
        audience: "school",
        message: transportAlertMessage(event.payload, transportEventType, "school"),
      },
    };

    const parentEligible =
      transportEventType === "stop_approaching"
      || transportEventType === "stop_arrived"
      || transportEventType === "student_boarded"
      || transportEventType === "student_dropped";

    if (!parentEligible) return [schoolPlan];

    const parentPlans: DeliveryPlan[] = studentIds.map((recipientId) => ({
      recipientType: "parent",
      recipientId,
      channel: "in_app",
      templateKey: `transport.alert.${transportEventType}.parent`,
      payload: {
        ...message,
        audience: "parent",
        studentId: recipientId,
        message: transportAlertMessage(event.payload, transportEventType, "parent"),
      },
    }));

    return [...parentPlans, schoolPlan];
  }

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

  if (event.topic === "transport.alert") {
    return compact({
      ...common,
      transportEventId: optionalUuid(event.payload.transportEventId),
      transportEventType: optionalString(event.payload.transportEventType),
      tripId: optionalUuid(event.payload.tripId),
      studentId: optionalUuid(event.payload.studentId),
      studentIds: uniqueUuidList(event.payload.studentIds),
      studentName: optionalString(event.payload.studentName),
      stopId: optionalUuid(event.payload.stopId),
      stopName: optionalString(event.payload.stopName),
      routeName: optionalString(event.payload.routeName),
      vehicleNumber: optionalString(event.payload.vehicleNumber),
      direction: optionalString(event.payload.direction),
      latitude: optionalFiniteNumber(event.payload.latitude),
      longitude: optionalFiniteNumber(event.payload.longitude),
      accuracyMeters: optionalFiniteNumber(event.payload.accuracyMeters),
      severity: optionalString(event.payload.severity),
      capturedAt: optionalString(event.payload.capturedAt),
    });
  }

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

function uniqueUuidList(value: unknown, fallback: string | null = null): string[] {
  const candidates = Array.isArray(value) ? value.slice(0, 200) : [];
  if (fallback) candidates.push(fallback);
  const valid = candidates
    .map((entry) => optionalUuid(entry))
    .filter((entry): entry is string => entry !== null);
  return [...new Set(valid)];
}

function transportAlertMessage(
  payload: Record<string, unknown>,
  eventType: string | null,
  audience: "parent" | "school",
): string {
  const stopName = optionalString(payload.stopName);
  const studentName = optionalString(payload.studentName);
  const vehicleNumber = optionalString(payload.vehicleNumber);

  if (eventType === "sos") {
    const routeName = optionalString(payload.routeName);
    return `EMERGENCY SOS from bus${vehicleNumber ? ` ${vehicleNumber}` : ""}${
      routeName ? ` on ${routeName}` : ""
    }. Open live tracking immediately.`;
  }

  if (eventType === "stop_approaching") {
    if (audience === "parent") {
      return `The school bus${vehicleNumber ? ` ${vehicleNumber}` : ""} is approaching ${
        stopName ?? "your child's assigned stop"
      }. Please be ready.`;
    }
    return `Bus${vehicleNumber ? ` ${vehicleNumber}` : ""} is approaching ${
      stopName ?? "an assigned route stop"
    }.`;
  }

  if (eventType === "stop_arrived") {
    if (audience === "parent") {
      return `The school bus${vehicleNumber ? ` ${vehicleNumber}` : ""} has arrived at ${
        stopName ?? "your child's assigned stop"
      }.`;
    }
    return `Bus${vehicleNumber ? ` ${vehicleNumber}` : ""} arrived at ${
      stopName ?? "an assigned route stop"
    }.`;
  }

  if (eventType === "stop_departed") {
    return `Bus${vehicleNumber ? ` ${vehicleNumber}` : ""} departed ${
      stopName ?? "an assigned route stop"
    }.`;
  }

  if (eventType === "student_boarded") {
    return audience === "parent"
      ? `${studentName ?? "Your child"} boarded the school bus.`
      : `${studentName ?? "A student"} boarded the school bus.`;
  }

  if (eventType === "student_dropped") {
    return audience === "parent"
      ? `${studentName ?? "Your child"} was dropped at the assigned stop.`
      : `${studentName ?? "A student"} was dropped at the assigned stop.`;
  }

  return "A transport update is available.";
}

function optionalFiniteNumber(value: unknown): number | null {
  const parsed = z.number().finite().safeParse(value);
  return parsed.success ? parsed.data : null;
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
