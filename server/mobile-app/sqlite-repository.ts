import { database } from "#db-runtime";
import type { MobileAuthenticatedPrincipal } from "../mobile-auth/types.ts";
import type {
  RegisterMobileDeviceInput,
  RecordMobileTransportEventInput,
} from "./repository.ts";
import type {
  MobileDeviceRegistration,
  MobileTransportEvent,
  MobileTransportEventType,
} from "./types.ts";

export async function registerMobileDevice(
  principal: MobileAuthenticatedPrincipal,
  input: RegisterMobileDeviceInput,
): Promise<MobileDeviceRegistration> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await database.prepare(`
    INSERT INTO mobile_device_registrations (
      id, tenant_id, user_id, mobile_identity_id, session_id,
      platform, provider, token_hash, token_ciphertext, app_id,
      app_version, status, last_seen_at, revoked_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NULL, ?, ?)
    ON CONFLICT(tenant_id, token_hash) DO UPDATE SET
      user_id = excluded.user_id,
      mobile_identity_id = excluded.mobile_identity_id,
      session_id = excluded.session_id,
      platform = excluded.platform,
      provider = excluded.provider,
      token_ciphertext = excluded.token_ciphertext,
      app_id = excluded.app_id,
      app_version = excluded.app_version,
      status = 'active',
      last_seen_at = excluded.last_seen_at,
      revoked_at = NULL,
      updated_at = excluded.updated_at
  `).bind(
    id,
    principal.tenantId,
    principal.userId,
    principal.mobileIdentityId,
    principal.sessionId,
    input.platform,
    input.provider,
    input.tokenHash,
    input.tokenCiphertext,
    input.appId,
    input.appVersion ?? null,
    now,
    now,
    now,
  ).run();

  const row = await database.prepare(`
    SELECT id, tenant_id AS tenantId, user_id AS userId,
      mobile_identity_id AS mobileIdentityId, session_id AS sessionId,
      platform, provider, app_id AS appId, app_version AS appVersion,
      status, last_seen_at AS lastSeenAt
    FROM mobile_device_registrations
    WHERE tenant_id = ? AND token_hash = ?
  `).bind(principal.tenantId, input.tokenHash)
    .first<MobileDeviceRegistration>();
  if (!row) throw new Error("Mobile device registration failed");
  return row;
}

export async function revokeMobileDevice(
  principal: MobileAuthenticatedPrincipal,
  tokenHash: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await database.prepare(`
    UPDATE mobile_device_registrations
       SET status = 'revoked', revoked_at = ?, updated_at = ?
     WHERE tenant_id = ? AND user_id = ? AND token_hash = ?
       AND status = 'active'
  `).bind(now, now, principal.tenantId, principal.userId, tokenHash).run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export async function recordMobileTransportEvent(
  principal: MobileAuthenticatedPrincipal,
  input: RecordMobileTransportEventInput,
): Promise<{ event: MobileTransportEvent; replayed: boolean }> {
  if (!principal.mobileIdentityId) {
    throw new Error("Transport relationship is required");
  }
  const existing = await database.prepare(`
    SELECT id, tenant_id AS tenantId, mobile_identity_id AS mobileIdentityId,
      session_id AS sessionId, trip_id AS tripId, student_id AS studentId,
      event_type AS eventType, latitude, longitude,
      accuracy_meters AS accuracyMeters, speed_kph AS speedKph,
      heading_degrees AS headingDegrees, captured_at AS capturedAt,
      idempotency_key AS idempotencyKey, metadata_json AS metadataJson,
      created_at AS createdAt
    FROM mobile_transport_events
    WHERE tenant_id = ? AND mobile_identity_id = ? AND idempotency_key = ?
  `).bind(principal.tenantId, principal.mobileIdentityId, input.idempotencyKey)
    .first<TransportEventRow>();
  if (existing) return { event: toEvent(existing), replayed: true };

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const inserted = await database.prepare(`
    INSERT OR IGNORE INTO mobile_transport_events (
      id, tenant_id, mobile_identity_id, session_id, trip_id, student_id,
      event_type, latitude, longitude, accuracy_meters, speed_kph,
      heading_degrees, captured_at, idempotency_key, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    principal.tenantId,
    principal.mobileIdentityId,
    principal.sessionId,
    input.tripId ?? null,
    input.studentId ?? null,
    input.eventType,
    input.latitude ?? null,
    input.longitude ?? null,
    input.accuracyMeters ?? null,
    input.speedKph ?? null,
    input.headingDegrees ?? null,
    input.capturedAt,
    input.idempotencyKey,
    JSON.stringify(input.metadata),
    createdAt,
  ).run();
  const row = await database.prepare(`
    SELECT id, tenant_id AS tenantId, mobile_identity_id AS mobileIdentityId,
      session_id AS sessionId, trip_id AS tripId, student_id AS studentId,
      event_type AS eventType, latitude, longitude,
      accuracy_meters AS accuracyMeters, speed_kph AS speedKph,
      heading_degrees AS headingDegrees, captured_at AS capturedAt,
      idempotency_key AS idempotencyKey, metadata_json AS metadataJson,
      created_at AS createdAt
    FROM mobile_transport_events
    WHERE tenant_id = ? AND mobile_identity_id = ? AND idempotency_key = ?
  `).bind(principal.tenantId, principal.mobileIdentityId, input.idempotencyKey)
    .first<TransportEventRow>();
  if (!row) throw new Error("Transport event could not be recorded");
  return {
    event: toEvent(row),
    replayed: Number(inserted.meta?.changes ?? 0) === 0,
  };
}

export async function listMobileTransportEvents(
  principal: MobileAuthenticatedPrincipal,
  limit = 50,
): Promise<MobileTransportEvent[]> {
  if (!principal.mobileIdentityId) return [];
  const result = await database.prepare(`
    SELECT id, tenant_id AS tenantId, mobile_identity_id AS mobileIdentityId,
      session_id AS sessionId, trip_id AS tripId, student_id AS studentId,
      event_type AS eventType, latitude, longitude,
      accuracy_meters AS accuracyMeters, speed_kph AS speedKph,
      heading_degrees AS headingDegrees, captured_at AS capturedAt,
      idempotency_key AS idempotencyKey, metadata_json AS metadataJson,
      created_at AS createdAt
    FROM mobile_transport_events
    WHERE tenant_id = ? AND mobile_identity_id = ?
    ORDER BY captured_at DESC, created_at DESC
    LIMIT ?
  `).bind(principal.tenantId, principal.mobileIdentityId, Math.min(Math.max(limit, 1), 100))
    .all<TransportEventRow>();
  return result.results.map(toEvent);
}

type TransportEventRow = Omit<MobileTransportEvent, "metadata" | "eventType"> & {
  eventType: string;
  metadataJson: string;
};

function toEvent(row: TransportEventRow): MobileTransportEvent {
  return {
    ...row,
    eventType: row.eventType as MobileTransportEventType,
    metadata: safeRecord(row.metadataJson),
  };
}

function safeRecord(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}
