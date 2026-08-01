import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { routeNotificationEvent } from "./contracts.ts";
import { readNotificationEnvironment, type NotificationEnvironment } from "./environment.ts";
import {
  claimOutboxBatch,
  completeOutboxEvent,
  recoverExpiredOutboxLeases,
  retryOrDeadLetterOutboxEvent,
  type ClaimedOutboxEvent,
} from "./repository.ts";
import {
  closeNotificationRedisClients,
  waitForNotificationWake,
} from "./redis-wake.ts";

export type NotificationWorkerDependencies = {
  recoverExpiredLeases: typeof recoverExpiredOutboxLeases;
  claimBatch: typeof claimOutboxBatch;
  completeEvent: typeof completeOutboxEvent;
  failEvent: typeof retryOrDeadLetterOutboxEvent;
};

const defaultDependencies: NotificationWorkerDependencies = {
  recoverExpiredLeases: recoverExpiredOutboxLeases,
  claimBatch: claimOutboxBatch,
  completeEvent: completeOutboxEvent,
  failEvent: retryOrDeadLetterOutboxEvent,
};

export function retryDelay(
  attempt: number,
  baseMs: number,
  maxMs: number,
  random: () => number = Math.random,
): number {
  const exponent = Math.max(0, Math.min(30, attempt - 1));
  const jitter = 0.75 + Math.max(0, Math.min(1, random())) * 0.5;
  return Math.min(maxMs, Math.max(baseMs, Math.round(baseMs * 2 ** exponent * jitter)));
}

export function notificationFailureCode(error: unknown): string {
  if (error instanceof ZodError) return "notification_contract_invalid";
  if (error instanceof Error && error.message === "notification_queue_lease_lost") {
    return "notification_queue_lease_lost";
  }
  return "notification_processing_failed";
}

export async function processNotificationBatch(
  config: NotificationEnvironment,
  workerId: string,
  dependencies: NotificationWorkerDependencies = defaultDependencies,
): Promise<number> {
  await dependencies.recoverExpiredLeases();
  const batch = await dependencies.claimBatch(
    config.HIG_QUEUE_BATCH_SIZE,
    config.HIG_QUEUE_LEASE_SECONDS,
    workerId,
  );

  for (let offset = 0; offset < batch.length; offset += config.HIG_QUEUE_CONCURRENCY) {
    const group = batch.slice(offset, offset + config.HIG_QUEUE_CONCURRENCY);
    await Promise.all(group.map((claimed) => processClaimedEvent(
      claimed,
      config,
      dependencies,
    )));
  }
  return batch.length;
}

export async function runNotificationWorker(options: {
  environment?: Record<string, string | undefined>;
  signal?: AbortSignal;
  workerId?: string;
  dependencies?: NotificationWorkerDependencies;
} = {}): Promise<void> {
  const environment = options.environment ?? process.env;
  const config = readNotificationEnvironment(environment);
  if (config.HIG_QUEUE_WORKER_ENABLED !== "true") {
    throw new Error("HIG_QUEUE_WORKER_ENABLED must be true");
  }
  const workerId = options.workerId ?? buildWorkerId();
  const dependencies = options.dependencies ?? defaultDependencies;
  const stopWake = () => {
    void closeNotificationRedisClients();
  };
  options.signal?.addEventListener("abort", stopWake, { once: true });

  try {
    while (!options.signal?.aborted) {
      try {
        const processed = await processNotificationBatch(config, workerId, dependencies);
        if (processed > 0) continue;
        await waitForNotificationWake(config.HIG_QUEUE_POLL_INTERVAL_MS, environment);
      } catch (error) {
        if (options.signal?.aborted) break;
        console.error(JSON.stringify({
          service: "hig-school-notification-worker",
          status: "iteration_failed",
          code: notificationFailureCode(error),
        }));
        await abortableDelay(config.HIG_QUEUE_POLL_INTERVAL_MS, options.signal);
      }
    }
  } finally {
    options.signal?.removeEventListener("abort", stopWake);
    await closeNotificationRedisClients();
  }
}

async function processClaimedEvent(
  claimed: ClaimedOutboxEvent,
  config: NotificationEnvironment,
  dependencies: NotificationWorkerDependencies,
): Promise<void> {
  try {
    const plans = routeNotificationEvent(claimed.event);
    await dependencies.completeEvent(claimed, plans);
  } catch (error) {
    const delayMs = retryDelay(
      claimed.attempts,
      config.HIG_QUEUE_RETRY_BASE_MS,
      config.HIG_QUEUE_RETRY_MAX_MS,
    );
    await dependencies.failEvent(
      claimed,
      notificationFailureCode(error),
      config.HIG_QUEUE_MAX_ATTEMPTS,
      delayMs,
    );
  }
}

function buildWorkerId(): string {
  return `notification-${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`.slice(0, 200);
}

function abortableDelay(timeoutMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    const stop = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", stop, { once: true });
  });
}
