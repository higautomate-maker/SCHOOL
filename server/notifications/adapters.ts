import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  DeliveryOutcome,
  DeliveryPlan,
  NotificationChannel,
  NotificationEvent,
} from "./contracts.ts";
import type { NotificationEnvironment } from "./environment.ts";

const externalChannels = ["email", "sms", "push"] as const satisfies readonly NotificationChannel[];

export function expandNotificationDeliveryPlans(
  plans: readonly DeliveryPlan[],
): DeliveryPlan[] {
  return plans.flatMap((plan) => {
    if (plan.channel !== "in_app") return [plan];
    return [
      plan,
      ...externalChannels.map((channel) => ({ ...plan, channel })),
    ];
  });
}

export async function dispatchNotificationDeliveries(
  event: NotificationEvent,
  plans: readonly DeliveryPlan[],
  config: NotificationEnvironment,
): Promise<DeliveryOutcome[]> {
  const outcomes: DeliveryOutcome[] = [];
  for (const plan of plans) {
    outcomes.push(await dispatchNotificationDelivery(event, plan, config));
  }
  return outcomes;
}

export async function dispatchNotificationDelivery(
  event: NotificationEvent,
  plan: DeliveryPlan,
  config: NotificationEnvironment,
): Promise<DeliveryOutcome> {
  if (plan.channel === "in_app") {
    return {
      plan,
      provider: "internal",
      status: "delivered",
      errorCode: null,
      providerMessageId: null,
      metadata: { durable: true },
    };
  }

  const adapter = adapterFor(plan.channel, config);
  if (adapter === "disabled") {
    return {
      plan,
      provider: "disabled",
      status: "skipped",
      errorCode: "notification_adapter_not_configured",
      providerMessageId: null,
      metadata: { configured: false },
    };
  }

  if (adapter === "capture") {
    const providerMessageId = captureMessageId(event, plan);
    await appendCapture(config.HIG_NOTIFICATION_CAPTURE_PATH, {
      schemaVersion: 1,
      providerMessageId,
      eventId: event.eventId,
      tenantId: event.tenantId,
      topic: event.topic,
      recipientType: plan.recipientType,
      recipientId: plan.recipientId,
      channel: plan.channel,
      templateKey: plan.templateKey,
      payload: plan.payload,
      occurredAt: event.occurredAt,
      capturedAt: new Date().toISOString(),
    });
    return {
      plan,
      provider: "capture",
      status: "delivered",
      errorCode: null,
      providerMessageId,
      metadata: { captured: true },
    };
  }

  return assertNever(adapter);
}

function adapterFor(
  channel: NotificationChannel,
  config: NotificationEnvironment,
): "disabled" | "capture" {
  if (channel === "email") return config.HIG_NOTIFICATION_EMAIL_ADAPTER;
  if (channel === "sms") return config.HIG_SMS_ADAPTER;
  if (channel === "push") return config.HIG_PUSH_ADAPTER;
  if (channel === "capture") return "capture";
  return "disabled";
}

async function appendCapture(
  path: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(payload)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "a",
  });
}

function captureMessageId(event: NotificationEvent, plan: DeliveryPlan): string {
  const digest = createHash("sha256")
    .update([
      event.eventId,
      plan.recipientType,
      plan.recipientId ?? "audience",
      plan.channel,
      plan.templateKey,
    ].join("|"), "utf8")
    .digest("hex")
    .slice(0, 32);
  return `capture-${digest}`;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported notification adapter: ${String(value)}`);
}
