import type { PoolClient } from "pg";
import { getPostgresPool } from "../runtime/postgres.ts";
import type { MobileAuthenticatedPrincipal } from "../mobile-auth/types.ts";
import type {
  RegisterMobileDeviceInput,
  RecordMobileTransportEventInput,
} from "./repository.ts";
import type {
  MobileDeviceRegistration,
  MobileTransportEvent,
} from "./types.ts";

async function transaction<Result>(
  tenantId: string,
  operation: (client: PoolClient) => Promise<Result>,
): Promise<Result> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.mobile_auth_service', 'true', true)");
    await client.query("SELECT set_config('app.tenant_id', $1::text, true)", [tenantId]);
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

export async function registerMobileDevice(
  principal: MobileAuthenticatedPrincipal,
  input: RegisterMobileDeviceInput,
): Promise<MobileDeviceRegistration> {
  return transaction(principal.tenantId, async (client) => {
    const result = await client.query<MobileDeviceRegistration>(`
      INSERT INTO mobile_device_registrations (
        id, tenant_id, user_id, mobile_identity_id, session_id,
        platform, provider, token_hash, token_ciphertext, app_id,
        app_version, status, last_seen_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid,
        $5::text, $6::text, $7::text, $8::text, $9::text,
        $10::text, 'active', now(), now(), now()
      )
      ON CONFLICT (tenant_id, token_hash) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        mobile_identity_id = EXCLUDED.mobile_identity_id,
        session_id = EXCLUDED.session_id,
        platform = EXCLUDED.platform,
        provider = EXCLUDED.provider,
        token_ciphertext = EXCLUDED.token_ciphertext,
        app_id = EXCLUDED.app_id,
        app_version = EXCLUDED.app_version,
        status = 'active',
        last_seen_at = now(),
        revoked_at = NULL,
        updated_at = now()
      RETURNING id, tenant_id AS "tenantId", user_id AS "userId",
        mobile_identity_id AS "mobileIdentityId", session_id AS "sessionId",
        platform, provider, app_id AS "appId", app_version AS "appVersion",
        status, last_seen_at::text AS "lastSeenAt"
    `, [
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
    ]);
    const row = result.rows[0];
    if (!row) throw new Error("Mobile device registration failed");
    return row;
  });
}

export async function revokeMobileDevice(
  principal: MobileAuthenticatedPrincipal,
  tokenHash: string,
): Promise<boolean> {
  return transaction(principal.tenantId, async (client) => {
    const result = await client.query(`
      UPDATE mobile_device_registrations
         SET status = 'revoked', revoked_at = now(), updated_at = now()
       WHERE tenant_id = $1::uuid AND user_id = $2::uuid
         AND token_hash = $3::text AND status = 'active'
    `, [principal.tenantId, principal.userId, tokenHash]);
    return (result.rowCount ?? 0) > 0;
  });
}

export async function recordMobileTransportEvent(
  principal: MobileAuthenticatedPrincipal,
  input: RecordMobileTransportEventInput,
): Promise<{ event: MobileTransportEvent; replayed: boolean }> {
  if (!principal.mobileIdentityId) throw new Error("Transport relationship is required");
  return transaction(principal.tenantId, async (client) => {
    const existing = await client.query<MobileTransportEvent>(`
      SELECT id, tenant_id AS "tenantId", mobile_identity_id AS "mobileIdentityId",
        session_id AS "sessionId", trip_id AS "tripId", student_id AS "studentId",
        event_type AS "eventType", latitude, longitude,
        accuracy_meters AS "accuracyMeters", speed_kph AS "speedKph",
        heading_degrees AS "headingDegrees", captured_at::text AS "capturedAt",
        idempotency_key AS "idempotencyKey", metadata, created_at::text AS "createdAt"
      FROM mobile_transport_events
      WHERE tenant_id = $1::uuid AND mobile_identity_id = $2::uuid
        AND idempotency_key = $3::text
      LIMIT 1
    `, [principal.tenantId, principal.mobileIdentityId, input.idempotencyKey]);
    if (existing.rows[0]) return { event: existing.rows[0], replayed: true };

    const result = await client.query<MobileTransportEvent>(`
      INSERT INTO mobile_transport_events (
        id, tenant_id, mobile_identity_id, session_id, trip_id, student_id,
        event_type, latitude, longitude, accuracy_meters, speed_kph,
        heading_degrees, captured_at, idempotency_key, metadata, created_at
      ) VALUES (
        gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
        $6::text, $7::double precision, $8::double precision,
        $9::double precision, $10::double precision, $11::double precision,
        $12::timestamptz, $13::text, $14::jsonb, now()
      )
      ON CONFLICT (tenant_id, mobile_identity_id, idempotency_key) DO NOTHING
      RETURNING id, tenant_id AS "tenantId", mobile_identity_id AS "mobileIdentityId",
        session_id AS "sessionId", trip_id AS "tripId", student_id AS "studentId",
        event_type AS "eventType", latitude, longitude,
        accuracy_meters AS "accuracyMeters", speed_kph AS "speedKph",
        heading_degrees AS "headingDegrees", captured_at::text AS "capturedAt",
        idempotency_key AS "idempotencyKey", metadata, created_at::text AS "createdAt"
    `, [
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
    ]);
    const event = result.rows[0];
    if (event) return { event, replayed: false };
    const replay = await client.query<MobileTransportEvent>(`
      SELECT id, tenant_id AS "tenantId", mobile_identity_id AS "mobileIdentityId",
        session_id AS "sessionId", trip_id AS "tripId", student_id AS "studentId",
        event_type AS "eventType", latitude, longitude,
        accuracy_meters AS "accuracyMeters", speed_kph AS "speedKph",
        heading_degrees AS "headingDegrees", captured_at::text AS "capturedAt",
        idempotency_key AS "idempotencyKey", metadata, created_at::text AS "createdAt"
      FROM mobile_transport_events
      WHERE tenant_id = $1::uuid AND mobile_identity_id = $2::uuid
        AND idempotency_key = $3::text
      LIMIT 1
    `, [principal.tenantId, principal.mobileIdentityId, input.idempotencyKey]);
    if (!replay.rows[0]) throw new Error("Transport event could not be recorded");
    return { event: replay.rows[0], replayed: true };
  });
}

export async function listMobileTransportEvents(
  principal: MobileAuthenticatedPrincipal,
  limit = 50,
): Promise<MobileTransportEvent[]> {
  if (!principal.mobileIdentityId) return [];
  return transaction(principal.tenantId, async (client) => {
    const result = await client.query<MobileTransportEvent>(`
      SELECT id, tenant_id AS "tenantId", mobile_identity_id AS "mobileIdentityId",
        session_id AS "sessionId", trip_id AS "tripId", student_id AS "studentId",
        event_type AS "eventType", latitude, longitude,
        accuracy_meters AS "accuracyMeters", speed_kph AS "speedKph",
        heading_degrees AS "headingDegrees", captured_at::text AS "capturedAt",
        idempotency_key AS "idempotencyKey", metadata, created_at::text AS "createdAt"
      FROM mobile_transport_events
      WHERE tenant_id = $1::uuid AND mobile_identity_id = $2::uuid
      ORDER BY captured_at DESC, created_at DESC
      LIMIT $3::int
    `, [principal.tenantId, principal.mobileIdentityId, Math.min(Math.max(limit, 1), 100)]);
    return result.rows;
  });
}
