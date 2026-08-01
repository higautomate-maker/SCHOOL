import { z } from "zod";
import { withTenantDatabase } from "../runtime/postgres.ts";
import { repositoryBackend } from "../runtime/repository-backend.ts";

const cursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().trim().min(1).max(500).optional(),
  unreadOnly: z.enum(["true", "false"]).default("false"),
});

type NotificationCursor = z.infer<typeof cursorSchema>;

export type NotificationInboxItem = {
  id: string;
  topic: string;
  templateKey: string;
  title: string;
  message: string;
  recipientType: string;
  recipientId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  read: boolean;
  readAt: string | null;
};

export type NotificationInboxPage = {
  notifications: NotificationInboxItem[];
  unreadCount: number;
  nextCursor: string | null;
};

type DeliveryRow = {
  id: string;
  topic: string;
  template_key: string;
  recipient_type: string;
  recipient_id: string | null;
  payload: unknown;
  created_at: Date | string;
  read_at: Date | string | null;
};

export type ParsedNotificationListQuery = {
  limit: number;
  cursor: NotificationCursor | null;
  unreadOnly: boolean;
};

export function parseNotificationListQuery(
  searchParams: URLSearchParams,
): { success: true; data: ParsedNotificationListQuery } | { success: false } {
  const parsed = querySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
    unreadOnly: searchParams.get("unreadOnly") ?? undefined,
  });
  if (!parsed.success) return { success: false };

  let cursor: NotificationCursor | null = null;
  if (parsed.data.cursor) {
    cursor = decodeNotificationCursor(parsed.data.cursor);
    if (!cursor) return { success: false };
  }

  return {
    success: true,
    data: {
      limit: parsed.data.limit,
      cursor,
      unreadOnly: parsed.data.unreadOnly === "true",
    },
  };
}

export function encodeNotificationCursor(cursor: NotificationCursor): string {
  const parsed = cursorSchema.parse(cursor);
  return Buffer.from(JSON.stringify(parsed), "utf8").toString("base64url");
}

export function decodeNotificationCursor(value: string): NotificationCursor | null {
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const parsed = cursorSchema.safeParse(decoded);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function listNotificationInbox(input: {
  tenantId: string;
  userId: string;
  limit: number;
  cursor: NotificationCursor | null;
  unreadOnly: boolean;
}): Promise<NotificationInboxPage> {
  requirePostgresInbox();
  const limit = Math.min(Math.max(input.limit, 1), 100);

  return withTenantDatabase(input.tenantId, async (_database, client) => {
    const values: unknown[] = [input.tenantId, input.userId, limit + 1];
    let cursorFilter = "";
    if (input.cursor) {
      values.push(input.cursor.createdAt, input.cursor.id);
      cursorFilter = "AND (delivery.created_at, delivery.id) < ($4::timestamptz, $5::uuid)";
    }
    const unreadFilter = input.unreadOnly ? "AND read_state.delivery_id IS NULL" : "";

    const result = await client.query<DeliveryRow>(
      `SELECT
         delivery.id,
         outbox.topic,
         delivery.template_key,
         delivery.recipient_type,
         delivery.recipient_id,
         delivery.payload,
         delivery.created_at,
         read_state.read_at
       FROM notification_deliveries delivery
       JOIN outbox_events outbox
         ON outbox.tenant_id = delivery.tenant_id
        AND outbox.id = delivery.outbox_event_id
       LEFT JOIN notification_reads read_state
         ON read_state.tenant_id = delivery.tenant_id
        AND read_state.delivery_id = delivery.id
        AND read_state.user_id = $2::uuid
       WHERE delivery.tenant_id = $1::uuid
         AND delivery.channel = 'in_app'
         AND delivery.status = 'delivered'
         AND (
           delivery.recipient_type = 'audience'
           OR (
             delivery.recipient_type IN ('user', 'staff')
             AND delivery.recipient_id = $2::uuid
           )
         )
         ${cursorFilter}
         ${unreadFilter}
       ORDER BY delivery.created_at DESC, delivery.id DESC
       LIMIT $3::int`,
      values,
    );

    const unread = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM notification_deliveries delivery
       LEFT JOIN notification_reads read_state
         ON read_state.tenant_id = delivery.tenant_id
        AND read_state.delivery_id = delivery.id
        AND read_state.user_id = $2::uuid
       WHERE delivery.tenant_id = $1::uuid
         AND delivery.channel = 'in_app'
         AND delivery.status = 'delivered'
         AND read_state.delivery_id IS NULL
         AND (
           delivery.recipient_type = 'audience'
           OR (
             delivery.recipient_type IN ('user', 'staff')
             AND delivery.recipient_id = $2::uuid
           )
         )`,
      [input.tenantId, input.userId],
    );

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    const notifications = rows.map(toInboxItem);
    const last = rows.at(-1);
    return {
      notifications,
      unreadCount: Number(unread.rows[0]?.count ?? 0),
      nextCursor: hasMore && last
        ? encodeNotificationCursor({
            createdAt: timestampString(last.created_at),
            id: last.id,
          })
        : null,
    };
  });
}

export async function markNotificationRead(input: {
  tenantId: string;
  userId: string;
  notificationId: string;
}): Promise<{ id: string; readAt: string } | null> {
  requirePostgresInbox();
  const parsedId = z.string().uuid().safeParse(input.notificationId);
  if (!parsedId.success) return null;

  return withTenantDatabase(input.tenantId, async (_database, client) => {
    const inserted = await client.query<{ read_at: Date | string }>(
      `INSERT INTO notification_reads (
         tenant_id, delivery_id, user_id, read_at, created_at
       )
       SELECT delivery.tenant_id, delivery.id, $3::uuid, now(), now()
       FROM notification_deliveries delivery
       WHERE delivery.tenant_id = $1::uuid
         AND delivery.id = $2::uuid
         AND delivery.channel = 'in_app'
         AND delivery.status = 'delivered'
         AND (
           delivery.recipient_type = 'audience'
           OR (
             delivery.recipient_type IN ('user', 'staff')
             AND delivery.recipient_id = $3::uuid
           )
         )
       ON CONFLICT (tenant_id, delivery_id, user_id) DO NOTHING
       RETURNING read_at`,
      [input.tenantId, parsedId.data, input.userId],
    );

    const existing = inserted.rows[0] ?? (await client.query<{ read_at: Date | string }>(
      `SELECT read_at
       FROM notification_reads
       WHERE tenant_id = $1::uuid
         AND delivery_id = $2::uuid
         AND user_id = $3::uuid
       LIMIT 1`,
      [input.tenantId, parsedId.data, input.userId],
    )).rows[0];

    return existing
      ? { id: parsedId.data, readAt: timestampString(existing.read_at) }
      : null;
  });
}

export function notificationContent(
  topic: string,
  payload: Record<string, unknown>,
): { title: string; message: string } {
  if (topic === "attendance.mark") {
    const date = textValue(payload.attendanceDate) ?? "the selected date";
    const status = textValue(payload.status) ?? "updated";
    return { title: "Attendance updated", message: `Attendance for ${date} is ${status}.` };
  }
  if (topic === "fee.invoice.create") {
    const feeType = textValue(payload.feeType) ?? "School fee";
    const amount = moneyValue(payload.amountPaise);
    const dueDate = textValue(payload.dueDate);
    return {
      title: "Fee invoice created",
      message: `${feeType}${amount ? ` of ${amount}` : ""}${dueDate ? ` is due on ${dueDate}` : " has been created"}.`,
    };
  }
  if (topic === "fee.payment.collect") {
    const amount = moneyValue(payload.amountPaise);
    const balance = moneyValue(payload.balancePaise);
    return {
      title: "Payment received",
      message: `${amount ? `${amount} was received` : "A payment was received"}${balance ? `. Remaining balance: ${balance}` : ""}.`,
    };
  }
  const titles: Record<string, string> = {
    "notice.publish": "New notice",
    "homework.publish": "Homework updated",
    "exam.publish": "Examination update",
    "transport.alert": "Transport alert",
  };
  return {
    title: titles[topic] ?? "School notification",
    message: textValue(payload.message) ?? "A new school update is available.",
  };
}

function toInboxItem(row: DeliveryRow): NotificationInboxItem {
  const payload = recordValue(row.payload);
  const content = notificationContent(row.topic, payload);
  return {
    id: row.id,
    topic: row.topic,
    templateKey: row.template_key,
    title: content.title,
    message: content.message,
    recipientType: row.recipient_type,
    recipientId: row.recipient_id,
    payload,
    createdAt: timestampString(row.created_at),
    read: row.read_at !== null,
    readAt: row.read_at === null ? null : timestampString(row.read_at),
  };
}

function requirePostgresInbox(): void {
  if (repositoryBackend() !== "postgres") {
    throw new Error("notification_inbox_postgres_required");
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function textValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 200) : null;
}

function moneyValue(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
  return `INR ${(value / 100).toFixed(2)}`;
}

function timestampString(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("notification_timestamp_invalid");
  return date.toISOString();
}
