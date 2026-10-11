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
let producerConnecting: Promise<NotificationRedisClient> | undefined;
let consumerConnecting: Promise<NotificationRedisClient> | undefined;
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
  // A committed operation may start its wake-up without awaiting it. Let any
  // connection attempt settle before closing the clients it created.
  await Promise.allSettled([producerConnecting, consumerConnecting].filter(
    (pending): pending is Promise<NotificationRedisClient> => pending !== undefined,
  ));
  const clients = [producer, consumer];
  producer = undefined;
  consumer = undefined;
  producerConnecting = undefined;
  consumerConnecting = undefined;
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
    const pending = purpose === "producer" ? producerConnecting : consumerConnecting;
    if (pending) return pending;
    if (!current.isOpen) return connectClient(purpose, current, redisUrl);
    return current;
  }

  if (current?.isOpen) current.destroy();
  const client = createNotificationRedisClient(redisUrl);
  if (purpose === "producer") {
    producer = client;
    producerUrl = redisUrl;
  } else {
    consumer = client;
    consumerUrl = redisUrl;
  }
  return connectClient(purpose, client, redisUrl);
}

function connectClient(
  purpose: "producer" | "consumer",
  client: NotificationRedisClient,
  redisUrl: string,
): Promise<NotificationRedisClient> {
  const pending = client.connect().then(() => client).catch((error: unknown) => {
    client.destroy();
    if (purpose === "producer" && producer === client) {
      producer = undefined;
      producerUrl = "";
    } else if (purpose === "consumer" && consumer === client) {
      consumer = undefined;
      consumerUrl = "";
    }
    throw error;
  }).finally(() => {
    if (purpose === "producer" && producerConnecting === pending) {
      producerConnecting = undefined;
    } else if (purpose === "consumer" && consumerConnecting === pending) {
      consumerConnecting = undefined;
    }
  });
  if (purpose === "producer") {
    producerConnecting = pending;
    producerUrl = redisUrl;
  } else {
    consumerConnecting = pending;
    consumerUrl = redisUrl;
  }
  return pending;
}
