import type { PoolClient } from "pg";
import { getPostgresPool } from "../runtime/postgres.ts";
import {
  LOCATION_RETENTION_BATCH_SIZE,
  LOCATION_RETENTION_MAX_BATCHES_PER_SWEEP,
  LOCATION_RETENTION_SWEEP_INTERVAL_MS,
  mobileTransportLocationRetentionDays,
} from "./retention.ts";
import { wakeNotificationWorker } from "../notifications/redis-wake.ts";
import type { MobileAuthenticatedPrincipal } from "../mobile-auth/types.ts";
import type {
  RegisterMobileDeviceInput,
  RecordMobileTransportEventInput,
} from "./repository.ts";
import type {
  MobileDeviceRegistration,
  MobileTransportEvent,
  ParentTransportTrackingChild,
  ParentTransportTrackingSnapshot,
  ParentTransportStop,
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

type TripTransition = {
  targetStatus: "active" | "paused" | "completed";
  allowedStatuses: Array<"scheduled" | "active" | "paused">;
};

function tripTransition(
  eventType: RecordMobileTransportEventInput["eventType"],
): TripTransition | null {
  switch (eventType) {
    case "trip_started":
      return {
        targetStatus: "active",
        allowedStatuses: ["scheduled", "paused"],
      };
    case "trip_paused":
      return {
        targetStatus: "paused",
        allowedStatuses: ["active"],
      };
    case "trip_completed":
      return {
        targetStatus: "completed",
        allowedStatuses: ["active", "paused"],
      };
    default:
      return null;
  }
}

async function applyTransportTripTransition(
  client: PoolClient,
  principal: MobileAuthenticatedPrincipal,
  input: RecordMobileTransportEventInput,
): Promise<void> {
  const transition = tripTransition(input.eventType);
  if (!transition || !input.tripId) return;

  const result = await client.query<{ id: string }>(`
    UPDATE transport_trips trip
       SET status = $4::text,
           started_at = CASE
             WHEN $4::text = 'active'
               THEN COALESCE(trip.started_at, $6::timestamptz)
             ELSE trip.started_at
           END,
           completed_at = CASE
             WHEN $4::text = 'completed'
               THEN $6::timestamptz
             ELSE trip.completed_at
           END,
           updated_at = now()
      FROM transport_driver_assignments assignment
      JOIN transport_drivers driver
        ON driver.tenant_id = assignment.tenant_id
       AND driver.id = assignment.driver_id
     WHERE trip.tenant_id = $1::uuid
       AND trip.id = $2::uuid
       AND assignment.tenant_id = trip.tenant_id
       AND assignment.id = trip.driver_assignment_id
       AND assignment.status = 'active'
       AND driver.user_id = $3::uuid
       AND driver.status = 'active'
       AND trip.status = ANY($5::text[])
    RETURNING trip.id
  `, [
    principal.tenantId,
    input.tripId,
    principal.userId,
    transition.targetStatus,
    transition.allowedStatuses,
    input.capturedAt,
  ]);

  if (!result.rows[0]) {
    throw new Error("Invalid or unauthorized transport trip transition");
  }
}

function isGeofenceEvent(
  eventType: RecordMobileTransportEventInput["eventType"],
): boolean {
  return eventType === "stop_arrived"
    || eventType === "stop_departed"
    || eventType === "stop_approaching";
}

async function findStopTransition(
  client: PoolClient,
  principal: MobileAuthenticatedPrincipal,
  input: RecordMobileTransportEventInput,
): Promise<MobileTransportEvent | null> {
  if (!isGeofenceEvent(input.eventType) || !input.tripId || !input.stopId) {
    return null;
  }
  const result = await client.query<MobileTransportEvent>(`
    SELECT id, tenant_id AS "tenantId", mobile_identity_id AS "mobileIdentityId",
      session_id AS "sessionId", trip_id AS "tripId",
      student_id AS "studentId", stop_id AS "stopId",
      event_type AS "eventType", latitude, longitude,
      accuracy_meters AS "accuracyMeters", speed_kph AS "speedKph",
      heading_degrees AS "headingDegrees", captured_at::text AS "capturedAt",
      idempotency_key AS "idempotencyKey", metadata, created_at::text AS "createdAt"
    FROM mobile_transport_events
    WHERE tenant_id = $1::uuid
      AND trip_id = $2::uuid
      AND stop_id = $3::uuid
      AND event_type = $4::text
    LIMIT 1
  `, [
    principal.tenantId,
    input.tripId,
    input.stopId,
    input.eventType,
  ]);
  return result.rows[0] ?? null;
}


const locationRetentionNextSweepAt = new Map<string, number>();

async function purgeExpiredLocationEvents(
  client: PoolClient,
  tenantId: string,
  eventType: RecordMobileTransportEventInput["eventType"],
  nowMs = Date.now(),
): Promise<number> {
  if (eventType !== "location") return 0;

  const nextSweepAt = locationRetentionNextSweepAt.get(tenantId) ?? 0;
  if (nextSweepAt > nowMs) return 0;

  const retentionDays = mobileTransportLocationRetentionDays();
  let deleted = 0;

  for (
    let batch = 0;
    batch < LOCATION_RETENTION_MAX_BATCHES_PER_SWEEP;
    batch += 1
  ) {
    const result = await client.query<{ id: string }>(`
      WITH doomed AS (
        SELECT event.id
        FROM mobile_transport_events event
        WHERE event.tenant_id = $1::uuid
          AND event.event_type = 'location'
          AND event.captured_at < now() - make_interval(days => $2::int)
        ORDER BY event.captured_at ASC, event.created_at ASC
        LIMIT $3::int
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM mobile_transport_events target
      USING doomed
      WHERE target.tenant_id = $1::uuid
        AND target.id = doomed.id
        AND target.event_type = 'location'
      RETURNING target.id
    `, [
      tenantId,
      retentionDays,
      LOCATION_RETENTION_BATCH_SIZE,
    ]);

    const removed = result.rowCount ?? 0;
    deleted += removed;
    if (removed < LOCATION_RETENTION_BATCH_SIZE) break;
  }

  locationRetentionNextSweepAt.set(
    tenantId,
    nowMs + LOCATION_RETENTION_SWEEP_INTERVAL_MS,
  );
  return deleted;
}

async function findRecentSos(
  client: PoolClient,
  principal: MobileAuthenticatedPrincipal,
  input: RecordMobileTransportEventInput,
): Promise<MobileTransportEvent | null> {
  if (input.eventType !== "sos" || !input.tripId) return null;

  const lockKey = `transport-sos:${principal.tenantId}:${input.tripId}`;
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
    [lockKey],
  );

  const result = await client.query<MobileTransportEvent>(`
    SELECT id, tenant_id AS "tenantId", mobile_identity_id AS "mobileIdentityId",
      session_id AS "sessionId", trip_id AS "tripId",
      student_id AS "studentId", stop_id AS "stopId",
      event_type AS "eventType", latitude, longitude,
      accuracy_meters AS "accuracyMeters", speed_kph AS "speedKph",
      heading_degrees AS "headingDegrees", captured_at::text AS "capturedAt",
      idempotency_key AS "idempotencyKey", metadata,
      created_at::text AS "createdAt"
    FROM mobile_transport_events
    WHERE tenant_id = $1::uuid
      AND trip_id = $2::uuid
      AND event_type = 'sos'
      AND captured_at >= $3::timestamptz - interval '60 seconds'
      AND captured_at <= $3::timestamptz + interval '60 seconds'
    ORDER BY
      abs(extract(epoch FROM (captured_at - $3::timestamptz))) ASC,
      created_at DESC
    LIMIT 1
  `, [
    principal.tenantId,
    input.tripId,
    input.capturedAt,
  ]);

  return result.rows[0] ?? null;
}

type ParentTransportRow = {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  routeId: string;
  routeName: string;
  routeCode: string;
  vehicleId: string | null;
  vehicleNumber: string | null;
  vehicleType: string | null;
  tripId: string | null;
  tripStatus: string | null;
  tripDirection: string | null;
  serviceDate: string | null;
  pickupStopId: string | null;
  pickupStopName: string | null;
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  pickupRadius: number | null;
  dropStopId: string | null;
  dropStopName: string | null;
  dropLatitude: number | null;
  dropLongitude: number | null;
  dropRadius: number | null;
  journeyEventType: string | null;
  journeyCapturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  speedKph: number | null;
  capturedAt: string | null;
};

function radians(value: number): number {
  return value * Math.PI / 180;
}

function distanceMeters(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
): number {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = radians(latitude2 - latitude1);
  const longitudeDelta = radians(longitude2 - longitude1);
  const left = Math.sin(latitudeDelta / 2) ** 2;
  const right = Math.cos(radians(latitude1))
    * Math.cos(radians(latitude2))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(left + right));
}

function parentStop(
  id: string | null,
  name: string | null,
  latitude: number | null,
  longitude: number | null,
  radius: number | null,
): ParentTransportStop | null {
  if (!id || !name || latitude === null || longitude === null) return null;
  return {
    id,
    name,
    latitude,
    longitude,
    geofenceRadiusMeters: radius ?? 100,
  };
}

function liveFreshness(
  capturedAt: string,
  nowMs: number,
): {
  freshness: "online" | "delayed" | "offline";
  ageSeconds: number;
} {
  const capturedMs = Date.parse(capturedAt);
  const ageSeconds = Number.isFinite(capturedMs)
    ? Math.max(0, Math.floor((nowMs - capturedMs) / 1_000))
    : 24 * 60 * 60;
  return {
    freshness: ageSeconds <= 120
      ? "online"
      : ageSeconds <= 900
        ? "delayed"
        : "offline",
    ageSeconds,
  };
}

function etaMinutes(
  distance: number,
  speedKph: number | null,
  stopRadiusMeters: number,
  freshness: "online" | "delayed" | "offline",
): number | null {
  if (freshness === "offline") return null;
  if (distance <= Math.max(stopRadiusMeters, 25)) return 0;
  const effectiveSpeedKph = speedKph !== null && speedKph >= 5
    ? Math.min(Math.max(speedKph, 10), 60)
    : 20;
  return Math.min(
    180,
    Math.max(1, Math.ceil((distance / 1_000) / effectiveSpeedKph * 60)),
  );
}

export async function loadParentTransportTracking(
  principal: MobileAuthenticatedPrincipal,
  studentIds: readonly string[],
): Promise<ParentTransportTrackingSnapshot> {
  if (principal.principalType !== "parent") {
    throw new Error("Parent identity required");
  }

  const linkedStudentIds = [...new Set(studentIds)].slice(0, 50);
  const generatedAt = new Date().toISOString();
  if (!linkedStudentIds.length) {
    return {
      generatedAt,
      children: [],
      privacy: {
        scope: "linked_students_only",
        locationHistoryExposed: false,
        driverContactExposed: false,
        activeTripLocationOnly: true,
      },
    };
  }

  return transaction(principal.tenantId, async (client) => {
    const result = await client.query<ParentTransportRow>(`
      SELECT
        student.id AS "studentId",
        trim(student.first_name || ' ' || student.last_name) AS "studentName",
        student.admission_number AS "admissionNumber",
        route.id AS "routeId",
        route.route_name AS "routeName",
        route.route_code AS "routeCode",
        vehicle.id AS "vehicleId",
        vehicle.vehicle_number AS "vehicleNumber",
        vehicle.vehicle_type AS "vehicleType",
        trip.id AS "tripId",
        trip.status AS "tripStatus",
        trip.direction AS "tripDirection",
        trip.service_date::text AS "serviceDate",
        pickup.id AS "pickupStopId",
        pickup.stop_name AS "pickupStopName",
        pickup.latitude AS "pickupLatitude",
        pickup.longitude AS "pickupLongitude",
        pickup.geofence_radius_meters AS "pickupRadius",
        drop_stop.id AS "dropStopId",
        drop_stop.stop_name AS "dropStopName",
        drop_stop.latitude AS "dropLatitude",
        drop_stop.longitude AS "dropLongitude",
        drop_stop.geofence_radius_meters AS "dropRadius",
        journey.event_type AS "journeyEventType",
        journey.captured_at::text AS "journeyCapturedAt",
        location.latitude,
        location.longitude,
        location.accuracy_meters AS "accuracyMeters",
        location.speed_kph AS "speedKph",
        location.captured_at::text AS "capturedAt"
      FROM transport_student_assignments student_assignment
      JOIN students student
        ON student.tenant_id = student_assignment.tenant_id
       AND student.id = student_assignment.student_id
       AND student.status = 'active'
      JOIN transport_routes route
        ON route.tenant_id = student_assignment.tenant_id
       AND route.id = student_assignment.route_id
       AND route.status = 'active'
      LEFT JOIN transport_route_stops pickup
        ON pickup.tenant_id = student_assignment.tenant_id
       AND pickup.id = student_assignment.pickup_stop_id
       AND pickup.status = 'active'
      LEFT JOIN transport_route_stops drop_stop
        ON drop_stop.tenant_id = student_assignment.tenant_id
       AND drop_stop.id = student_assignment.drop_stop_id
       AND drop_stop.status = 'active'
      LEFT JOIN LATERAL (
        SELECT assignment.id, assignment.vehicle_id
        FROM transport_driver_assignments assignment
        WHERE assignment.tenant_id = student_assignment.tenant_id
          AND assignment.route_id = student_assignment.route_id
          AND assignment.status = 'active'
          AND assignment.effective_from <= current_date
          AND (
            assignment.effective_to IS NULL
            OR assignment.effective_to >= current_date
          )
        ORDER BY assignment.effective_from DESC
        LIMIT 1
      ) driver_assignment ON true
      LEFT JOIN transport_vehicles vehicle
        ON vehicle.tenant_id = student_assignment.tenant_id
       AND vehicle.id = driver_assignment.vehicle_id
       AND vehicle.status = 'active'
      LEFT JOIN LATERAL (
        SELECT candidate.*
        FROM transport_trips candidate
        WHERE candidate.tenant_id = student_assignment.tenant_id
          AND candidate.route_id = student_assignment.route_id
          AND candidate.driver_assignment_id = driver_assignment.id
          AND candidate.status IN ('active', 'paused', 'scheduled')
          AND candidate.service_date BETWEEN current_date AND current_date + 1
        ORDER BY
          CASE candidate.status
            WHEN 'active' THEN 1
            WHEN 'paused' THEN 2
            ELSE 3
          END,
          candidate.service_date,
          candidate.scheduled_start_at NULLS LAST
        LIMIT 1
      ) trip ON true
      LEFT JOIN LATERAL (
        SELECT event.event_type, event.captured_at
        FROM mobile_transport_events event
        WHERE event.tenant_id = student_assignment.tenant_id
          AND event.trip_id = trip.id
          AND event.student_id = student_assignment.student_id
          AND event.event_type IN ('student_boarded', 'student_dropped')
        ORDER BY event.captured_at DESC, event.created_at DESC
        LIMIT 1
      ) journey ON true
      LEFT JOIN LATERAL (
        SELECT event.latitude, event.longitude, event.accuracy_meters,
          event.speed_kph, event.captured_at
        FROM mobile_transport_events event
        WHERE event.tenant_id = student_assignment.tenant_id
          AND event.trip_id = trip.id
          AND event.event_type = 'location'
          AND trip.status = 'active'
        ORDER BY event.captured_at DESC, event.created_at DESC
        LIMIT 1
      ) location ON true
      WHERE student_assignment.tenant_id = $1::uuid
        AND student_assignment.student_id = ANY($2::uuid[])
        AND student_assignment.status = 'active'
        AND student_assignment.effective_from <= current_date
        AND (
          student_assignment.effective_to IS NULL
          OR student_assignment.effective_to >= current_date
        )
      ORDER BY student.first_name, student.last_name, route.route_name
    `, [principal.tenantId, linkedStudentIds]);

    const nowMs = Date.now();
    const children: ParentTransportTrackingChild[] = result.rows.map((row) => {
      const pickupStop = parentStop(
        row.pickupStopId,
        row.pickupStopName,
        row.pickupLatitude,
        row.pickupLongitude,
        row.pickupRadius,
      );
      const dropStop = parentStop(
        row.dropStopId,
        row.dropStopName,
        row.dropLatitude,
        row.dropLongitude,
        row.dropRadius,
      );
      const targetStopType: "pickup" | "drop" =
        row.tripDirection === "drop" ? "drop" : "pickup";
      const targetStop = targetStopType === "drop" ? dropStop : pickupStop;

      let live: ParentTransportTrackingChild["live"] = null;
      if (
        row.tripStatus === "active"
        && row.latitude !== null
        && row.longitude !== null
        && row.capturedAt
      ) {
        const { freshness, ageSeconds } = liveFreshness(row.capturedAt, nowMs);
        const distanceToStop = targetStop
          ? distanceMeters(
              row.latitude,
              row.longitude,
              targetStop.latitude,
              targetStop.longitude,
            )
          : null;
        live = {
          latitude: row.latitude,
          longitude: row.longitude,
          accuracyMeters: row.accuracyMeters,
          speedKph: row.speedKph,
          capturedAt: row.capturedAt,
          freshness,
          ageSeconds,
          targetStopType,
          targetStop,
          distanceToStopMeters: distanceToStop === null
            ? null
            : Math.round(distanceToStop),
          etaMinutes: distanceToStop === null || !targetStop
            ? null
            : etaMinutes(
                distanceToStop,
                row.speedKph,
                targetStop.geofenceRadiusMeters,
                freshness,
              ),
        };
      }

      return {
        student: {
          id: row.studentId,
          fullName: row.studentName,
          admissionNumber: row.admissionNumber,
        },
        route: {
          id: row.routeId,
          name: row.routeName,
          code: row.routeCode,
        },
        vehicle: row.vehicleId && row.vehicleNumber && row.vehicleType
          ? {
              id: row.vehicleId,
              number: row.vehicleNumber,
              type: row.vehicleType,
            }
          : null,
        trip: row.tripId && row.tripStatus && row.tripDirection && row.serviceDate
          ? {
              id: row.tripId,
              status: row.tripStatus,
              direction: row.tripDirection,
              serviceDate: row.serviceDate,
            }
          : null,
        pickupStop,
        dropStop,
        journey: row.tripId
          ? {
              status: row.journeyEventType === "student_dropped"
                ? "dropped"
                : row.journeyEventType === "student_boarded"
                  ? "boarded"
                  : "waiting",
              capturedAt: row.journeyCapturedAt,
            }
          : null,
        live,
      };
    });

    return {
      generatedAt,
      children,
      privacy: {
        scope: "linked_students_only",
        locationHistoryExposed: false,
        driverContactExposed: false,
        activeTripLocationOnly: true,
      },
    };
  });
}

function isStudentJourneyEvent(
  eventType: RecordMobileTransportEventInput["eventType"],
): boolean {
  return eventType === "student_boarded" || eventType === "student_dropped";
}

async function validateStudentJourneyTransition(
  client: PoolClient,
  principal: MobileAuthenticatedPrincipal,
  input: RecordMobileTransportEventInput,
): Promise<MobileTransportEvent | null> {
  if (!isStudentJourneyEvent(input.eventType)) return null;
  if (!input.tripId || !input.studentId) {
    throw new Error("Boarding events require an active trip and student");
  }

  const assignment = await client.query(`
    SELECT student_assignment.id
    FROM transport_trips trip
    JOIN transport_driver_assignments driver_assignment
      ON driver_assignment.tenant_id = trip.tenant_id
     AND driver_assignment.id = trip.driver_assignment_id
     AND driver_assignment.route_id = trip.route_id
     AND driver_assignment.status = 'active'
     AND driver_assignment.effective_from <= current_date
     AND (
       driver_assignment.effective_to IS NULL
       OR driver_assignment.effective_to >= current_date
     )
    JOIN transport_drivers driver
      ON driver.tenant_id = driver_assignment.tenant_id
     AND driver.id = driver_assignment.driver_id
     AND driver.status = 'active'
    JOIN transport_student_assignments student_assignment
      ON student_assignment.tenant_id = trip.tenant_id
     AND student_assignment.route_id = trip.route_id
     AND student_assignment.student_id = $4::uuid
     AND student_assignment.status = 'active'
     AND student_assignment.effective_from <= current_date
     AND (
       student_assignment.effective_to IS NULL
       OR student_assignment.effective_to >= current_date
     )
    WHERE trip.tenant_id = $1::uuid
      AND trip.id = $2::uuid
      AND trip.status = 'active'
      AND driver.user_id = $3::uuid
    LIMIT 1
    FOR UPDATE OF student_assignment
  `, [
    principal.tenantId,
    input.tripId,
    principal.userId,
    input.studentId,
  ]);

  if (!assignment.rows[0]) {
    throw new Error("Active assigned student trip required");
  }

  const existing = await client.query<MobileTransportEvent>(`
    SELECT id, tenant_id AS "tenantId",
      mobile_identity_id AS "mobileIdentityId",
      session_id AS "sessionId", trip_id AS "tripId",
      student_id AS "studentId", stop_id AS "stopId",
      event_type AS "eventType", latitude, longitude,
      accuracy_meters AS "accuracyMeters", speed_kph AS "speedKph",
      heading_degrees AS "headingDegrees",
      captured_at::text AS "capturedAt",
      idempotency_key AS "idempotencyKey",
      metadata, created_at::text AS "createdAt"
    FROM mobile_transport_events
    WHERE tenant_id = $1::uuid
      AND trip_id = $2::uuid
      AND student_id = $3::uuid
      AND event_type IN ('student_boarded', 'student_dropped')
    ORDER BY captured_at DESC, created_at DESC
  `, [
    principal.tenantId,
    input.tripId,
    input.studentId,
  ]);

  const boarded = existing.rows.find(
    (event) => event.eventType === "student_boarded",
  ) ?? null;
  const dropped = existing.rows.find(
    (event) => event.eventType === "student_dropped",
  ) ?? null;

  if (input.eventType === "student_boarded") {
    if (boarded) return boarded;
    if (dropped) throw new Error("Student journey is already completed");
    return null;
  }

  if (dropped) return dropped;
  if (!boarded) throw new Error("Student must be boarded before drop");
  return null;
}

type TransportAlertContext = {
  routeId: string;
  direction: "pickup" | "drop";
  routeName: string;
  vehicleNumber: string;
  stopName: string | null;
};

function shouldCreateTransportAlert(
  eventType: RecordMobileTransportEventInput["eventType"],
): boolean {
  return eventType === "stop_arrived"
    || eventType === "stop_departed"
    || eventType === "stop_approaching"
    || eventType === "sos"
    || eventType === "student_boarded"
    || eventType === "student_dropped";
}

async function insertTransportAlertOutbox(
  client: PoolClient,
  principal: MobileAuthenticatedPrincipal,
  event: MobileTransportEvent,
): Promise<void> {
  if (!shouldCreateTransportAlert(event.eventType) || !event.tripId) return;

  const contextResult = await client.query<TransportAlertContext>(`
    SELECT trip.route_id AS "routeId",
      trip.direction,
      route.route_name AS "routeName",
      vehicle.vehicle_number AS "vehicleNumber",
      stop.stop_name AS "stopName"
    FROM transport_trips trip
    JOIN transport_driver_assignments driver_assignment
      ON driver_assignment.tenant_id = trip.tenant_id
     AND driver_assignment.id = trip.driver_assignment_id
    JOIN transport_routes route
      ON route.tenant_id = trip.tenant_id
     AND route.id = trip.route_id
    JOIN transport_vehicles vehicle
      ON vehicle.tenant_id = driver_assignment.tenant_id
     AND vehicle.id = driver_assignment.vehicle_id
    LEFT JOIN transport_route_stops stop
      ON stop.tenant_id = trip.tenant_id
     AND stop.route_id = trip.route_id
     AND stop.id = $3::uuid
    WHERE trip.tenant_id = $1::uuid
      AND trip.id = $2::uuid
    LIMIT 1
  `, [
    principal.tenantId,
    event.tripId,
    event.stopId,
  ]);

  const context = contextResult.rows[0];
  if (!context) throw new Error("Transport alert context could not be resolved");

  let studentId: string | null = null;
  let studentName: string | null = null;
  let studentIds: string[] = [];

  if (
    (event.eventType === "student_boarded" || event.eventType === "student_dropped")
    && event.studentId
  ) {
    const studentResult = await client.query<{
      studentId: string;
      studentName: string;
    }>(`
      SELECT assignment.student_id::text AS "studentId",
        concat_ws(' ', student.first_name, student.last_name) AS "studentName"
      FROM transport_student_assignments assignment
      JOIN students student
        ON student.tenant_id = assignment.tenant_id
       AND student.id = assignment.student_id
      WHERE assignment.tenant_id = $1::uuid
        AND assignment.route_id = $2::uuid
        AND assignment.student_id = $3::uuid
        AND assignment.status = 'active'
        AND assignment.effective_from <= current_date
        AND (assignment.effective_to IS NULL OR assignment.effective_to >= current_date)
      LIMIT 1
    `, [
      principal.tenantId,
      context.routeId,
      event.studentId,
    ]);

    const assignedStudent = studentResult.rows[0];
    if (!assignedStudent) {
      throw new Error("Transport alert student assignment could not be resolved");
    }
    studentId = assignedStudent.studentId;
    studentName = assignedStudent.studentName;
    studentIds = [assignedStudent.studentId];
  }

  if (
    (event.eventType === "stop_arrived" || event.eventType === "stop_approaching")
    && event.stopId
  ) {
    const assignedStudents = await client.query<{ studentId: string }>(`
      SELECT assignment.student_id::text AS "studentId"
      FROM transport_student_assignments assignment
      WHERE assignment.tenant_id = $1::uuid
        AND assignment.route_id = $2::uuid
        AND assignment.status = 'active'
        AND assignment.effective_from <= current_date
        AND (assignment.effective_to IS NULL OR assignment.effective_to >= current_date)
        AND (
          ($4::text = 'pickup' AND assignment.pickup_stop_id = $3::uuid)
          OR
          ($4::text = 'drop' AND assignment.drop_stop_id = $3::uuid)
        )
      ORDER BY assignment.student_id
      LIMIT 200
    `, [
      principal.tenantId,
      context.routeId,
      event.stopId,
      context.direction,
    ]);
    studentIds = assignedStudents.rows.map((row) => row.studentId);
  }

  await client.query(`
    INSERT INTO outbox_events (
      id, tenant_id, topic, aggregate_type, aggregate_id,
      payload, status, attempts, available_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), $1::uuid, 'transport.alert', 'mobile_transport_event',
      $2::text, $3::jsonb, 'pending', 0, now(), now(), now()
    )
  `, [
    principal.tenantId,
    event.id,
    JSON.stringify({
      transportEventId: event.id,
      transportEventType: event.eventType,
      tripId: event.tripId,
      studentId,
      studentIds,
      studentName,
      stopId: event.stopId,
      stopName: context.stopName,
      routeName: context.routeName,
      vehicleNumber: context.vehicleNumber,
      direction: context.direction,
      latitude: event.latitude,
      longitude: event.longitude,
      accuracyMeters: event.accuracyMeters,
      severity: event.eventType === "sos" ? "critical" : "normal",
      capturedAt: event.capturedAt,
    }),
  ]);
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
  const committed = await transaction(principal.tenantId, async (client) => {
    const existing = await client.query<MobileTransportEvent>(`
      SELECT id, tenant_id AS "tenantId", mobile_identity_id AS "mobileIdentityId",
        session_id AS "sessionId", trip_id AS "tripId", student_id AS "studentId",
        stop_id AS "stopId", event_type AS "eventType", latitude, longitude,
        accuracy_meters AS "accuracyMeters", speed_kph AS "speedKph",
        heading_degrees AS "headingDegrees", captured_at::text AS "capturedAt",
        idempotency_key AS "idempotencyKey", metadata, created_at::text AS "createdAt"
      FROM mobile_transport_events
      WHERE tenant_id = $1::uuid AND mobile_identity_id = $2::uuid
        AND idempotency_key = $3::text
      LIMIT 1
    `, [principal.tenantId, principal.mobileIdentityId, input.idempotencyKey]);
    if (existing.rows[0]) return { event: existing.rows[0], replayed: true };

    await purgeExpiredLocationEvents(
      client,
      principal.tenantId,
      input.eventType,
    );

    const recentSos = await findRecentSos(client, principal, input);
    if (recentSos) return { event: recentSos, replayed: true };

    const existingStudentJourney = await validateStudentJourneyTransition(
      client,
      principal,
      input,
    );
    if (existingStudentJourney) {
      return { event: existingStudentJourney, replayed: true };
    }

    const existingStopTransition = await findStopTransition(
      client,
      principal,
      input,
    );
    if (existingStopTransition) {
      return { event: existingStopTransition, replayed: true };
    }

    const result = await client.query<MobileTransportEvent>(`
      INSERT INTO mobile_transport_events (
        id, tenant_id, mobile_identity_id, session_id, trip_id, student_id,
        stop_id, event_type, latitude, longitude, accuracy_meters, speed_kph,
        heading_degrees, captured_at, idempotency_key, metadata, created_at
      ) VALUES (
        gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
        $6::uuid, $7::text, $8::double precision, $9::double precision,
        $10::double precision, $11::double precision, $12::double precision,
        $13::timestamptz, $14::text, $15::jsonb, now()
      )
      ON CONFLICT DO NOTHING
      RETURNING id, tenant_id AS "tenantId", mobile_identity_id AS "mobileIdentityId",
        session_id AS "sessionId", trip_id AS "tripId", student_id AS "studentId",
        stop_id AS "stopId", event_type AS "eventType", latitude, longitude,
        accuracy_meters AS "accuracyMeters", speed_kph AS "speedKph",
        heading_degrees AS "headingDegrees", captured_at::text AS "capturedAt",
        idempotency_key AS "idempotencyKey", metadata, created_at::text AS "createdAt"
    `, [
      principal.tenantId,
      principal.mobileIdentityId,
      principal.sessionId,
      input.tripId ?? null,
      input.studentId ?? null,
      input.stopId ?? null,
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
    if (event) {
      await applyTransportTripTransition(client, principal, input);
      await insertTransportAlertOutbox(client, principal, event);
      return { event, replayed: false };
    }
    const replay = await client.query<MobileTransportEvent>(`
      SELECT id, tenant_id AS "tenantId", mobile_identity_id AS "mobileIdentityId",
        session_id AS "sessionId", trip_id AS "tripId", student_id AS "studentId",
        stop_id AS "stopId", event_type AS "eventType", latitude, longitude,
        accuracy_meters AS "accuracyMeters", speed_kph AS "speedKph",
        heading_degrees AS "headingDegrees", captured_at::text AS "capturedAt",
        idempotency_key AS "idempotencyKey", metadata, created_at::text AS "createdAt"
      FROM mobile_transport_events
      WHERE tenant_id = $1::uuid AND mobile_identity_id = $2::uuid
        AND idempotency_key = $3::text
      LIMIT 1
    `, [principal.tenantId, principal.mobileIdentityId, input.idempotencyKey]);
    if (replay.rows[0]) return { event: replay.rows[0], replayed: true };

    const stopReplay = await findStopTransition(client, principal, input);
    if (stopReplay) return { event: stopReplay, replayed: true };

    const journeyReplay = await validateStudentJourneyTransition(
      client,
      principal,
      input,
    );
    if (journeyReplay) return { event: journeyReplay, replayed: true };

    const sosReplay = await findRecentSos(client, principal, input);
    if (sosReplay) return { event: sosReplay, replayed: true };

    throw new Error("Transport event could not be recorded");
  });
  if (!committed.replayed && shouldCreateTransportAlert(committed.event.eventType)) {
    void wakeNotificationWorker().catch(() => undefined);
  }
  return committed;
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
        stop_id AS "stopId", event_type AS "eventType", latitude, longitude,
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
