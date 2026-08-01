import { createClient } from "redis";

function createNotificationRedisClient(redisUrl: string) {
  const client = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 2_000,
      reconnectStrategy: false,
    },
  });
  client.on("error", () => undefined);
  return client;
}

type NotificationRedisClient = ReturnType<typeof createNotificationRedisClient>;

let producer: NotificationRedisClient | undefined;
let consumer: NotificationRedisClient | undefined;
let producerUrl = "";
let consumerUrl = "";

export function notificationWakeKey(
  environment: Record<string, string | undefined> = process.env,
): string {
  const namespace = (environment.HIG_REDIS_NAMESPACE ?? "hig-school")
    .trim()
    .replace(/:+$/u, "");
  return `${namespace}:notifications:wake`;
}

export async function wakeNotificationWorker(
  environment: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  const redisUrl = environment.REDIS_URL?.trim();
  if (!redisUrl) return false;
  const client = await connectedClient("producer", redisUrl);
  const key = notificationWakeKey(environment);
  await client.lPush(key, "1");
  await client.lTrim(key, 0, 99);
  await client.expire(key, 3_600);
  return true;
}

export async function waitForNotificationWake(
  timeoutMs: number,
  environment: Record<string, string | undefined> = process.env,
): Promise<void> {
  const redisUrl = environment.REDIS_URL?.trim();
  if (!redisUrl) throw new Error("REDIS_URL is required for queue wake-up");
  const client = await connectedClient("consumer", redisUrl);
  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1_000));
  await client.blPop(notificationWakeKey(environment), timeoutSeconds);
}

export async function closeNotificationRedisClients(): Promise<void> {
  const clients = [producer, consumer];
  producer = undefined;
  consumer = undefined;
  producerUrl = "";
  consumerUrl = "";
  for (const client of clients) {
    if (!client) continue;
    if (client.isOpen) client.destroy();
  }
}

async function connectedClient(
  purpose: "producer" | "consumer",
  redisUrl: string,
): Promise<NotificationRedisClient> {
  const current = purpose === "producer" ? producer : consumer;
  const currentUrl = purpose === "producer" ? producerUrl : consumerUrl;
  if (current && currentUrl === redisUrl) {
    if (!current.isOpen) await current.connect();
    return current;
  }

  if (current?.isOpen) current.destroy();
  const client = createNotificationRedisClient(redisUrl);
  await client.connect();

  if (purpose === "producer") {
    producer = client;
    producerUrl = redisUrl;
  } else {
    consumer = client;
    consumerUrl = redisUrl;
  }
  return client;
}
