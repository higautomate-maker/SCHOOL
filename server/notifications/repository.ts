import type { PoolClient } from "pg";
import { getPostgresPool } from "../runtime/postgres.ts";
import {
  normalizeOutboxEvent,
  notificationTopics,
  type DeliveryOutcome,
  type NotificationEvent,
} from "./contracts.ts";

export type ClaimedOutboxEvent = {
  event: NotificationEvent;
  attempts: number;
  workerId: string;
};

type OutboxRow = {
  id: string;
  tenant_id: string;
  topic: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  created_at: Date | string;
  attempts: string | number;
};

export async function recoverExpiredOutboxLeases(): Promise<number> {
  return withQueueTransaction(async (client) => {
    const result = await client.query(
      `UPDATE outbox_events
          SET status = 'pending',
              processing_started_at = NULL,
              lease_expires_at = NULL,
              worker_id = NULL,
              available_at = now(),
              last_error = 'processing_lease_expired',
              updated_at = now()
        WHERE status = 'processing'
          AND lease_expires_at IS NOT NULL
          AND lease_expires_at <= now()`,
    );
    return result.rowCount ?? 0;
  });
}

export async function claimOutboxBatch(
  limit: number,
  leaseSeconds: number,
  workerId: string,
): Promise<ClaimedOutboxEvent[]> {
  assertPositiveInteger(limit, "limit");
  assertPositiveInteger(leaseSeconds, "leaseSeconds");
  if (!workerId.trim() || workerId.length > 200) throw new Error("workerId is invalid");

  return withQueueTransaction(async (client) => {
    const result = await client.query<OutboxRow>(
      `WITH candidates AS (
         SELECT id
           FROM outbox_events
          WHERE topic = ANY($4::text[])
            AND status IN ('pending', 'failed')
            AND available_at <= now()
          ORDER BY available_at ASC, created_at ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT $1
       )
       UPDATE outbox_events AS event
          SET status = 'processing',
              attempts = event.attempts + 1,
              processing_started_at = now(),
              lease_expires_at = now() + make_interval(secs => $2::int),
              worker_id = $3::text,
              last_error = NULL,
              updated_at = now()
         FROM candidates
        WHERE event.id = candidates.id
       RETURNING event.id, event.tenant_id, event.topic, event.aggregate_type,
                 event.aggregate_id, event.payload, event.created_at, event.attempts`,
      [limit, leaseSeconds, workerId, [...notificationTopics]],
    );

    return result.rows.map((row) => ({
      event: normalizeOutboxEvent(row),
      attempts: Number(row.attempts),
      workerId,
    }));
  });
}

export async function completeOutboxEvent(
  claimed: ClaimedOutboxEvent,
  outcomes: readonly DeliveryOutcome[],
): Promise<number> {
  return withQueueTransaction(async (client) => {
    const lease = await client.query<{ id: string }>(
      `SELECT id
         FROM outbox_events
        WHERE id = $1::uuid
          AND status = 'processing'
          AND worker_id = $2::text
        FOR UPDATE`,
      [claimed.event.eventId, claimed.workerId],
    );
    if (!lease.rows[0]) throw new Error("notification_queue_lease_lost");

    let created = 0;
    for (const outcome of outcomes) {
      const delivery = await client.query<{ id: string }>(
        `INSERT INTO notification_deliveries (
           tenant_id, outbox_event_id, recipient_type, recipient_id,
           channel, template_key, payload, status, attempts,
           available_at, delivered_at, last_error, provider_message_id,
           created_at, updated_at
         ) VALUES (
           $1::uuid, $2::uuid, $3::text, $4::uuid,
           $5::text, $6::text, $7::jsonb, $8::text, 1,
           now(), CASE WHEN $8::text = 'delivered' THEN now() ELSE NULL END,
           $9::text, $10::text, now(), now()
         )
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          claimed.event.tenantId,
          claimed.event.eventId,
          outcome.plan.recipientType,
          outcome.plan.recipientId,
          outcome.plan.channel,
          outcome.plan.templateKey,
          JSON.stringify(outcome.plan.payload),
          outcome.status,
          outcome.errorCode,
          outcome.providerMessageId,
        ],
      );
      const deliveryId = delivery.rows[0]?.id;
      if (!deliveryId) continue;
      created += 1;
      await client.query(
        `INSERT INTO notification_delivery_attempts (
           tenant_id, delivery_id, attempt_number, channel, provider,
           status, error_code, provider_message_id,
           started_at, completed_at, metadata
         ) VALUES (
           $1::uuid, $2::uuid, 1, $3::text, $4::text,
           $5::text, $6::text, $7::text,
           now(), now(), $8::jsonb
         )`,
        [
          claimed.event.tenantId,
          deliveryId,
          outcome.plan.channel,
          outcome.provider,
          outcome.status,
          outcome.errorCode,
          outcome.providerMessageId,
          JSON.stringify(outcome.metadata),
        ],
      );
    }

    const published = await client.query(
      `UPDATE outbox_events
          SET status = 'published',
              published_at = now(),
              processing_started_at = NULL,
              lease_expires_at = NULL,
              worker_id = NULL,
              last_error = NULL,
              updated_at = now()
        WHERE id = $1::uuid
          AND status = 'processing'
          AND worker_id = $2::text`,
      [claimed.event.eventId, claimed.workerId],
    );
    if (published.rowCount !== 1) throw new Error("notification_queue_lease_lost");
    return created;
  });
}

export async function retryOrDeadLetterOutboxEvent(
  claimed: ClaimedOutboxEvent,
  failureCode: string,
  maxAttempts: number,
  retryDelayMs: number,
): Promise<"retry" | "dead_letter" | "lease_lost"> {
  assertPositiveInteger(maxAttempts, "maxAttempts");
  assertNonnegativeInteger(retryDelayMs, "retryDelayMs");
  const safeFailureCode = normalizeFailureCode(failureCode);

  return withQueueTransaction(async (client) => {
    const lease = await client.query<{ id: string }>(
      `SELECT id
         FROM outbox_events
        WHERE id = $1::uuid
          AND status = 'processing'
          AND worker_id = $2::text
        FOR UPDATE`,
      [claimed.event.eventId, claimed.workerId],
    );
    if (!lease.rows[0]) return "lease_lost";

    if (claimed.attempts >= maxAttempts) {
      await client.query(
        `UPDATE outbox_events
            SET status = 'failed',
                available_at = 'infinity'::timestamptz,
                processing_started_at = NULL,
                lease_expires_at = NULL,
                worker_id = NULL,
                last_error = $3::text,
                updated_at = now()
          WHERE id = $1::uuid
            AND worker_id = $2::text`,
        [claimed.event.eventId, claimed.workerId, safeFailureCode],
      );
      await client.query(
        `INSERT INTO notification_dead_letters (
           tenant_id, outbox_event_id, topic, payload, attempts,
           failure_reason, failed_at
         ) VALUES (
           $1::uuid, $2::uuid, $3::text, $4::jsonb, $5::bigint,
           $6::text, now()
         )
         ON CONFLICT DO NOTHING`,
        [
          claimed.event.tenantId,
          claimed.event.eventId,
          claimed.event.topic,
          JSON.stringify({
            eventId: claimed.event.eventId,
            topic: claimed.event.topic,
            aggregateType: claimed.event.aggregateType,
            aggregateId: claimed.event.aggregateId,
          }),
          claimed.attempts,
          safeFailureCode,
        ],
      );
      return "dead_letter";
    }

    await client.query(
      `UPDATE outbox_events
          SET status = 'failed',
              available_at = now() + ($3::bigint * interval '1 millisecond'),
              processing_started_at = NULL,
              lease_expires_at = NULL,
              worker_id = NULL,
              last_error = $4::text,
              updated_at = now()
        WHERE id = $1::uuid
          AND worker_id = $2::text`,
      [claimed.event.eventId, claimed.workerId, retryDelayMs, safeFailureCode],
    );
    return "retry";
  });
}

async function withQueueTransaction<Result>(
  operation: (client: PoolClient) => Promise<Result>,
): Promise<Result> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.queue_service', 'true', true)");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function normalizeFailureCode(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_.-]+/gu, "_").slice(0, 120);
  return normalized || "notification_processing_failed";
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
}

function assertNonnegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a nonnegative integer`);
}
