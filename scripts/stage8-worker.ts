import { runNotificationWorker } from "../server/notifications/worker.ts";

const controller = new AbortController();
const stop = () => controller.abort();
process.once("SIGTERM", stop);
process.once("SIGINT", stop);

console.log(JSON.stringify({
  service: "hig-school-notification-worker",
  status: "starting",
}));

await runNotificationWorker({ signal: controller.signal });

console.log(JSON.stringify({
  service: "hig-school-notification-worker",
  status: "stopped",
}));
