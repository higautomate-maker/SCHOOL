import { z } from "zod";

const adapterSchema = z.enum(["disabled", "capture"]);

const notificationEnvironmentSchema = z.object({
  HIG_QUEUE_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
  HIG_QUEUE_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(20),
  HIG_QUEUE_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(4),
  HIG_QUEUE_POLL_INTERVAL_MS: z.coerce.number().int().min(500).max(60_000).default(5_000),
  HIG_QUEUE_LEASE_SECONDS: z.coerce.number().int().min(15).max(3_600).default(120),
  HIG_QUEUE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(6),
  HIG_QUEUE_RETRY_BASE_MS: z.coerce.number().int().min(100).max(3_600_000).default(5_000),
  HIG_QUEUE_RETRY_MAX_MS: z.coerce.number().int().min(1_000).max(86_400_000).default(900_000),
  HIG_REDIS_NAMESPACE: z.string().trim().min(4).max(100).default("hig-school"),
  REDIS_URL: z.string().url().optional(),
  HIG_NOTIFICATION_EMAIL_ADAPTER: adapterSchema.default("disabled"),
  HIG_SMS_ADAPTER: adapterSchema.default("disabled"),
  HIG_PUSH_ADAPTER: adapterSchema.default("disabled"),
  HIG_NOTIFICATION_CAPTURE_PATH: z.string().trim().min(1).max(500)
    .default("/tmp/hig-school-notification-capture.jsonl"),
  HIG_QUEUE_HEARTBEAT_PATH: z.string().trim().min(1).max(500)
    .default("/tmp/hig-school-notification-worker-heartbeat.json"),
  HIG_QUEUE_HEARTBEAT_MAX_AGE_MS: z.coerce.number().int().min(5_000).max(600_000)
    .default(90_000),
  NODE_ENV: z.string().optional(),
  HIG_DEPLOYMENT_ENV: z.string().optional(),
});

export type NotificationEnvironment = z.infer<typeof notificationEnvironmentSchema>;

export function readNotificationEnvironment(
  environment: Record<string, string | undefined> = process.env,
): NotificationEnvironment {
  const parsed = notificationEnvironmentSchema.parse(environment);
  if (parsed.HIG_QUEUE_RETRY_BASE_MS > parsed.HIG_QUEUE_RETRY_MAX_MS) {
    throw new Error("HIG_QUEUE_RETRY_BASE_MS must not exceed HIG_QUEUE_RETRY_MAX_MS");
  }
  if (parsed.HIG_QUEUE_HEARTBEAT_MAX_AGE_MS <= parsed.HIG_QUEUE_POLL_INTERVAL_MS) {
    throw new Error("HIG_QUEUE_HEARTBEAT_MAX_AGE_MS must exceed HIG_QUEUE_POLL_INTERVAL_MS");
  }
  if (parsed.HIG_QUEUE_WORKER_ENABLED === "true" && !parsed.REDIS_URL) {
    throw new Error("REDIS_URL is required when the notification worker is enabled");
  }

  const captureEnabled = [
    parsed.HIG_NOTIFICATION_EMAIL_ADAPTER,
    parsed.HIG_SMS_ADAPTER,
    parsed.HIG_PUSH_ADAPTER,
  ].includes("capture");
  const protectedProduction = parsed.NODE_ENV === "production"
    && !["staging", "sales-demo"].includes(parsed.HIG_DEPLOYMENT_ENV ?? "");
  if (captureEnabled && protectedProduction) {
    throw new Error("Notification capture adapters are forbidden in production");
  }
  return parsed;
}
