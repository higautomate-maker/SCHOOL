import { readNotificationEnvironment } from "../server/notifications/environment.ts";
import { notificationWorkerHealth } from "../server/notifications/heartbeat.ts";

try {
  const config = readNotificationEnvironment(process.env);
  const result = await notificationWorkerHealth(
    config.HIG_QUEUE_HEARTBEAT_PATH,
    config.HIG_QUEUE_HEARTBEAT_MAX_AGE_MS,
  );
  console.log(JSON.stringify({
    service: "hig-school-notification-worker",
    status: result.status,
    healthy: result.healthy,
    ageMs: Number.isFinite(result.ageMs) ? result.ageMs : null,
  }));
  if (!result.healthy) process.exitCode = 1;
} catch {
  console.error(JSON.stringify({
    service: "hig-school-notification-worker",
    status: "unavailable",
    healthy: false,
  }));
  process.exitCode = 1;
}
