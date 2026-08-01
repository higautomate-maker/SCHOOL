import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  decodeNotificationCursor,
  encodeNotificationCursor,
  notificationContent,
  parseNotificationListQuery,
} from "../server/notifications/inbox.ts";

const cursor = {
  createdAt: "2026-08-01T12:30:00.000Z",
  id: "11111111-1111-4111-8111-111111111111",
};

test("notification inbox cursor is opaque, bounded, and round-trips", () => {
  const encoded = encodeNotificationCursor(cursor);
  assert.doesNotMatch(encoded, /2026-08-01/);
  assert.deepEqual(decodeNotificationCursor(encoded), cursor);
  assert.equal(decodeNotificationCursor("not-a-cursor"), null);
});

test("notification inbox query validates limits and unread filters", () => {
  const valid = parseNotificationListQuery(new URLSearchParams({
    limit: "50",
    unreadOnly: "true",
    cursor: encodeNotificationCursor(cursor),
  }));
  assert.equal(valid.success, true);
  if (valid.success) {
    assert.equal(valid.data.limit, 50);
    assert.equal(valid.data.unreadOnly, true);
    assert.deepEqual(valid.data.cursor, cursor);
  }
  assert.equal(parseNotificationListQuery(new URLSearchParams({ limit: "101" })).success, false);
  assert.equal(parseNotificationListQuery(new URLSearchParams({ unreadOnly: "yes" })).success, false);
});

test("notification presentation uses safe event fields", () => {
  assert.deepEqual(notificationContent("attendance.mark", {
    attendanceDate: "2026-08-01",
    status: "present",
  }), {
    title: "Attendance updated",
    message: "Attendance for 2026-08-01 is present.",
  });
  assert.deepEqual(notificationContent("fee.payment.collect", {
    amountPaise: 125050,
    balancePaise: 5000,
  }), {
    title: "Payment received",
    message: "INR 1250.50 was received. Remaining balance: INR 50.00.",
  });
});

test("notification inbox repository keeps tenant and viewer predicates", () => {
  const source = readFileSync(
    new URL("../server/notifications/inbox.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /withTenantDatabase\(input\.tenantId/);
  assert.match(source, /delivery\.tenant_id = \$1::uuid/);
  assert.match(source, /read_state\.user_id = \$2::uuid/);
  assert.match(source, /delivery\.recipient_type = 'audience'/);
  assert.match(source, /delivery\.recipient_id = \$2::uuid/);
  assert.match(source, /ON CONFLICT \(tenant_id, delivery_id, user_id\) DO NOTHING/);
  assert.doesNotMatch(source, /destination_hash|provider_message_id/);
  assert.doesNotMatch(source, /FROM\s+(students|fee_invoices|fee_payments|memberships)/i);
});

test("notification read state has forced tenant RLS", () => {
  const migration = readFileSync(
    new URL("../drizzle-postgres/0006_notification_inbox.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /ALTER TABLE "notification_reads" FORCE ROW LEVEL SECURITY;/);
  assert.match(migration, /CREATE POLICY "notification_reads_isolation"/);
  assert.match(migration, /app_current_tenant_id\(\)/);
  assert.match(migration, /PRIMARY KEY \("tenant_id", "delivery_id", "user_id"\)/);
});

test("notification API routes use central auth, CSRF, and no-store responses", () => {
  const listRoute = readFileSync(
    new URL("../app/api/v1/schools/[schoolId]/notifications/route.ts", import.meta.url),
    "utf8",
  );
  const readRoute = readFileSync(
    new URL("../app/api/v1/schools/[schoolId]/notifications/[notificationId]/read/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(listRoute, /authorize\(request, policies\.notificationsView, schoolId\)/);
  assert.match(readRoute, /authorize\(request, policies\.notificationsRead, schoolId\)/);
  assert.match(listRoute, /noStoreHeaders\(\)/);
  assert.match(readRoute, /noStoreHeaders\(\)/);
  assert.match(readRoute, /export async function POST/);
});
