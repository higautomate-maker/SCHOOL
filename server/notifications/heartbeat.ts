import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

const heartbeatSchema = z.object({
  service: z.literal("hig-school-notification-worker"),
  workerId: z.string().trim().min(1).max(200),
  status: z.enum(["starting", "ready", "degraded", "stopped"]),
  timestamp: z.string().datetime({ offset: true }),
  processed: z.number().int().nonnegative(),
  code: z.string().trim().min(1).max(120).nullable(),
});

export type NotificationWorkerHeartbeat = z.infer<typeof heartbeatSchema>;

export async function writeNotificationWorkerHeartbeat(
  path: string,
  heartbeat: Omit<NotificationWorkerHeartbeat, "service" | "timestamp">,
): Promise<NotificationWorkerHeartbeat> {
  const value = heartbeatSchema.parse({
    service: "hig-school-notification-worker",
    timestamp: new Date().toISOString(),
    ...heartbeat,
  });
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, path);
  return value;
}

export async function readNotificationWorkerHeartbeat(
  path: string,
): Promise<NotificationWorkerHeartbeat> {
  const raw = await readFile(path, "utf8");
  return heartbeatSchema.parse(JSON.parse(raw));
}

export async function notificationWorkerHealth(
  path: string,
  maxAgeMs: number,
  now = Date.now(),
): Promise<{ healthy: boolean; status: string; ageMs: number }> {
  try {
    const heartbeat = await readNotificationWorkerHeartbeat(path);
    const ageMs = Math.max(0, now - Date.parse(heartbeat.timestamp));
    return {
      healthy: heartbeat.status === "ready" && ageMs <= maxAgeMs,
      status: heartbeat.status,
      ageMs,
    };
  } catch {
    return { healthy: false, status: "unavailable", ageMs: Number.POSITIVE_INFINITY };
  }
}
