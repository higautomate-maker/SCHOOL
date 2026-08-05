import type { PoolClient } from "pg";
import { getPostgresPool } from "../runtime/postgres.ts";
import type { MobileAuthenticatedPrincipal } from "../mobile-auth/types.ts";
import type { TransportAction } from "./validation.ts";
import type {
  DriverTransportSnapshot,
  TransportAdminSnapshot,
  TransportStop,
  TransportStudent,
} from "./types.ts";

async function transaction<Result>(
  tenantId: string,
  operation: (client: PoolClient) => Promise<Result>,
): Promise<Result> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.tenant_id', $1::text, true)",
      [tenantId],
    );
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

type AssignmentRow = {
  assignmentId: string;
  driverId: string;
  driverName: string;
  mobileNumber: string | null;
  licenseNumber: string;
  vehicleId: string;
  vehicleNumber: string;
  registrationNumber: string;
  vehicleType: string;
  capacity: number;
  routeId: string;
  routeName: string;
  routeCode: string;
  direction: string;
  shift: string;
  tripId: string | null;
  serviceDate: string | null;
  tripDirection: string | null;
  scheduledStartAt: string | null;
  tripStatus: string | null;
};

function isMissingTransportSchema(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42P01";
}

export async function loadDriverTransportSnapshot(
  principal: MobileAuthenticatedPrincipal,
): Promise<DriverTransportSnapshot | null> {
  try {
    return await transaction(principal.tenantId, async (client) => {
      const assignmentResult = await client.query<AssignmentRow>(`
        SELECT
          assignment.id AS "assignmentId",
          driver.id AS "driverId",
          users.full_name AS "driverName",
          driver.mobile_number AS "mobileNumber",
          driver.license_number AS "licenseNumber",
          vehicle.id AS "vehicleId",
          vehicle.vehicle_number AS "vehicleNumber",
          vehicle.registration_number AS "registrationNumber",
          vehicle.vehicle_type AS "vehicleType",
          vehicle.capacity,
          route.id AS "routeId",
          route.route_name AS "routeName",
          route.route_code AS "routeCode",
          route.direction,
          route.shift,
          trip.id AS "tripId",
          trip.service_date::text AS "serviceDate",
          trip.direction AS "tripDirection",
          trip.scheduled_start_at::text AS "scheduledStartAt",
          trip.status AS "tripStatus"
        FROM transport_drivers driver
        JOIN users
          ON users.id = driver.user_id
        JOIN transport_driver_assignments assignment
          ON assignment.tenant_id = driver.tenant_id
         AND assignment.driver_id = driver.id
         AND assignment.status = 'active'
         AND assignment.effective_from <= current_date
         AND (
           assignment.effective_to IS NULL
           OR assignment.effective_to >= current_date
         )
        JOIN transport_vehicles vehicle
          ON vehicle.tenant_id = assignment.tenant_id
         AND vehicle.id = assignment.vehicle_id
         AND vehicle.status = 'active'
        JOIN transport_routes route
          ON route.tenant_id = assignment.tenant_id
         AND route.id = assignment.route_id
         AND route.status = 'active'
        LEFT JOIN LATERAL (
          SELECT candidate.*
          FROM transport_trips candidate
          WHERE candidate.tenant_id = assignment.tenant_id
            AND candidate.driver_assignment_id = assignment.id
            AND candidate.status IN ('scheduled', 'active', 'paused')
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
        WHERE driver.tenant_id = $1::uuid
          AND driver.user_id = $2::uuid
          AND driver.status = 'active'
        ORDER BY assignment.effective_from DESC
        LIMIT 1
      `, [principal.tenantId, principal.userId]);

      const row = assignmentResult.rows[0];
      if (!row) return null;

      const stopsResult = await client.query<TransportStop>(`
        SELECT
          stop.id,
          stop.stop_name AS name,
          stop.sequence_number AS sequence,
          stop.latitude,
          stop.longitude,
          stop.pickup_time::text AS "pickupTime",
          stop.drop_time::text AS "dropTime",
          stop.geofence_radius_meters AS "geofenceRadiusMeters",
          count(student_assignment.id)::int AS "studentCount"
        FROM transport_route_stops stop
        LEFT JOIN transport_student_assignments student_assignment
          ON student_assignment.tenant_id = stop.tenant_id
         AND student_assignment.route_id = stop.route_id
         AND student_assignment.status = 'active'
         AND (
           student_assignment.pickup_stop_id = stop.id
           OR student_assignment.drop_stop_id = stop.id
         )
        WHERE stop.tenant_id = $1::uuid
          AND stop.route_id = $2::uuid
          AND stop.status = 'active'
        GROUP BY stop.id
        ORDER BY stop.sequence_number
      `, [principal.tenantId, row.routeId]);

      const studentsResult = await client.query<TransportStudent>(`
        SELECT
          student.id,
          trim(student.first_name || ' ' || student.last_name) AS "fullName",
          student.admission_number AS "admissionNumber",
          student.class_name AS "className",
          student.section_name AS "sectionName",
          student.guardian_name AS "guardianName",
          student.guardian_phone AS "guardianPhone",
          assignment.pickup_stop_id AS "pickupStopId",
          pickup.stop_name AS "pickupStopName",
          assignment.drop_stop_id AS "dropStopId",
          drop_stop.stop_name AS "dropStopName"
        FROM transport_student_assignments assignment
        JOIN students student
          ON student.tenant_id = assignment.tenant_id
         AND student.id = assignment.student_id
        LEFT JOIN transport_route_stops pickup
          ON pickup.tenant_id = assignment.tenant_id
         AND pickup.id = assignment.pickup_stop_id
        LEFT JOIN transport_route_stops drop_stop
          ON drop_stop.tenant_id = assignment.tenant_id
         AND drop_stop.id = assignment.drop_stop_id
        WHERE assignment.tenant_id = $1::uuid
          AND assignment.route_id = $2::uuid
          AND assignment.status = 'active'
          AND assignment.effective_from <= current_date
          AND (
            assignment.effective_to IS NULL
            OR assignment.effective_to >= current_date
          )
          AND student.status = 'active'
        ORDER BY student.first_name, student.last_name
      `, [principal.tenantId, row.routeId]);

      return {
        assignmentId: row.assignmentId,
        driver: {
          id: row.driverId,
          name: row.driverName,
          mobileNumber: row.mobileNumber,
          licenseNumber: row.licenseNumber,
        },
        vehicle: {
          id: row.vehicleId,
          number: row.vehicleNumber,
          registrationNumber: row.registrationNumber,
          type: row.vehicleType,
          capacity: row.capacity,
        },
        route: {
          id: row.routeId,
          name: row.routeName,
          code: row.routeCode,
          direction: row.direction,
          shift: row.shift,
        },
        trip: row.tripId
          ? {
              id: row.tripId,
              serviceDate: row.serviceDate ?? "",
              direction: row.tripDirection ?? "pickup",
              scheduledStartAt: row.scheduledStartAt,
              status: row.tripStatus ?? "scheduled",
            }
          : null,
        stops: stopsResult.rows,
        students: studentsResult.rows,
      };
    });
  } catch (error) {
    if (isMissingTransportSchema(error)) return null;
    throw error;
  }
}

export async function listTransportAdminSnapshot(
  tenantId: string,
): Promise<TransportAdminSnapshot> {
  return transaction(tenantId, async (client) => {
    const [
      drivers,
      vehicles,
      routes,
      stops,
      driverAssignments,
      studentAssignments,
      trips,
    ] = await Promise.all([
      client.query(`
        SELECT driver.id, driver.user_id AS "userId",
          users.full_name AS name, users.email,
          driver.employee_code AS "employeeCode",
          driver.mobile_number AS "mobileNumber",
          driver.license_number AS "licenseNumber",
          driver.license_expiry::text AS "licenseExpiry",
          driver.status
        FROM transport_drivers driver
        JOIN users ON users.id = driver.user_id
        WHERE driver.tenant_id = $1::uuid
        ORDER BY users.full_name
      `, [tenantId]),
      client.query(`
        SELECT id, vehicle_number AS "vehicleNumber",
          registration_number AS "registrationNumber",
          vehicle_type AS "vehicleType", capacity,
          gps_device_id AS "gpsDeviceId", status
        FROM transport_vehicles
        WHERE tenant_id = $1::uuid
        ORDER BY vehicle_number
      `, [tenantId]),
      client.query(`
        SELECT id, route_name AS "routeName", route_code AS "routeCode",
          direction, shift, status
        FROM transport_routes
        WHERE tenant_id = $1::uuid
        ORDER BY route_name
      `, [tenantId]),
      client.query(`
        SELECT id, route_id AS "routeId", stop_name AS "stopName",
          sequence_number AS "sequenceNumber", latitude, longitude,
          pickup_time::text AS "pickupTime",
          drop_time::text AS "dropTime",
          geofence_radius_meters AS "geofenceRadiusMeters", status
        FROM transport_route_stops
        WHERE tenant_id = $1::uuid
        ORDER BY route_id, sequence_number
      `, [tenantId]),
      client.query(`
        SELECT id, driver_id AS "driverId", vehicle_id AS "vehicleId",
          route_id AS "routeId", effective_from::text AS "effectiveFrom",
          effective_to::text AS "effectiveTo", status
        FROM transport_driver_assignments
        WHERE tenant_id = $1::uuid
        ORDER BY effective_from DESC
      `, [tenantId]),
      client.query(`
        SELECT id, student_id AS "studentId", route_id AS "routeId",
          pickup_stop_id AS "pickupStopId",
          drop_stop_id AS "dropStopId",
          effective_from::text AS "effectiveFrom",
          effective_to::text AS "effectiveTo", status
        FROM transport_student_assignments
        WHERE tenant_id = $1::uuid
        ORDER BY effective_from DESC
      `, [tenantId]),
      client.query(`
        SELECT id, driver_assignment_id AS "driverAssignmentId",
          route_id AS "routeId", service_date::text AS "serviceDate",
          direction, scheduled_start_at::text AS "scheduledStartAt",
          status, started_at::text AS "startedAt",
          completed_at::text AS "completedAt"
        FROM transport_trips
        WHERE tenant_id = $1::uuid
        ORDER BY service_date DESC, scheduled_start_at DESC
        LIMIT 200
      `, [tenantId]),
    ]);

    return {
      drivers: drivers.rows,
      vehicles: vehicles.rows,
      routes: routes.rows,
      stops: stops.rows,
      driverAssignments: driverAssignments.rows,
      studentAssignments: studentAssignments.rows,
      trips: trips.rows,
    };
  });
}

export async function applyTransportAction(
  tenantId: string,
  action: TransportAction,
): Promise<Record<string, unknown>> {
  return transaction(tenantId, async (client) => {
    switch (action.action) {
      case "create_vehicle": {
        const result = await client.query(`
          INSERT INTO transport_vehicles (
            tenant_id, vehicle_number, registration_number,
            vehicle_type, capacity, gps_device_id
          ) VALUES ($1::uuid, $2, $3, $4, $5, $6)
          RETURNING id, vehicle_number AS "vehicleNumber",
            registration_number AS "registrationNumber",
            vehicle_type AS "vehicleType", capacity,
            gps_device_id AS "gpsDeviceId", status
        `, [
          tenantId,
          action.vehicleNumber,
          action.registrationNumber,
          action.vehicleType,
          action.capacity,
          action.gpsDeviceId ?? null,
        ]);
        return result.rows[0] ?? {};
      }
      case "create_driver": {
        const result = await client.query(`
          INSERT INTO transport_drivers (
            tenant_id, user_id, employee_code, mobile_number,
            license_number, license_expiry
          ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::date)
          RETURNING id, user_id AS "userId",
            employee_code AS "employeeCode",
            mobile_number AS "mobileNumber",
            license_number AS "licenseNumber",
            license_expiry::text AS "licenseExpiry", status
        `, [
          tenantId,
          action.userId,
          action.employeeCode ?? null,
          action.mobileNumber ?? null,
          action.licenseNumber,
          action.licenseExpiry ?? null,
        ]);
        return result.rows[0] ?? {};
      }
      case "create_route": {
        const result = await client.query(`
          INSERT INTO transport_routes (
            tenant_id, route_name, route_code, direction, shift
          ) VALUES ($1::uuid, $2, $3, $4, $5)
          RETURNING id, route_name AS "routeName",
            route_code AS "routeCode", direction, shift, status
        `, [
          tenantId,
          action.routeName,
          action.routeCode,
          action.direction,
          action.shift,
        ]);
        return result.rows[0] ?? {};
      }
      case "create_stop": {
        const result = await client.query(`
          INSERT INTO transport_route_stops (
            tenant_id, route_id, stop_name, sequence_number,
            latitude, longitude, pickup_time, drop_time,
            geofence_radius_meters
          ) VALUES (
            $1::uuid, $2::uuid, $3, $4, $5, $6,
            $7::time, $8::time, $9
          )
          RETURNING id, route_id AS "routeId",
            stop_name AS "stopName",
            sequence_number AS "sequenceNumber",
            latitude, longitude,
            pickup_time::text AS "pickupTime",
            drop_time::text AS "dropTime",
            geofence_radius_meters AS "geofenceRadiusMeters",
            status
        `, [
          tenantId,
          action.routeId,
          action.stopName,
          action.sequenceNumber,
          action.latitude,
          action.longitude,
          action.pickupTime ?? null,
          action.dropTime ?? null,
          action.geofenceRadiusMeters,
        ]);
        return result.rows[0] ?? {};
      }
      case "assign_driver": {
        await client.query(`
          UPDATE transport_driver_assignments
             SET status = 'inactive',
                 effective_to = GREATEST(effective_from, $5::date - 1),
                 updated_at = now()
           WHERE tenant_id = $1::uuid
             AND (driver_id = $2::uuid OR vehicle_id = $3::uuid)
             AND status = 'active'
             AND effective_to IS NULL
        `, [
          tenantId,
          action.driverId,
          action.vehicleId,
          action.routeId,
          action.effectiveFrom,
        ]);
        const result = await client.query(`
          INSERT INTO transport_driver_assignments (
            tenant_id, driver_id, vehicle_id, route_id, effective_from
          ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::date)
          RETURNING id, driver_id AS "driverId",
            vehicle_id AS "vehicleId", route_id AS "routeId",
            effective_from::text AS "effectiveFrom", status
        `, [
          tenantId,
          action.driverId,
          action.vehicleId,
          action.routeId,
          action.effectiveFrom,
        ]);
        return result.rows[0] ?? {};
      }
      case "assign_student": {
        await client.query(`
          UPDATE transport_student_assignments
             SET status = 'inactive',
                 effective_to = GREATEST(effective_from, $4::date - 1),
                 updated_at = now()
           WHERE tenant_id = $1::uuid
             AND student_id = $2::uuid
             AND status = 'active'
             AND effective_to IS NULL
        `, [
          tenantId,
          action.studentId,
          action.routeId,
          action.effectiveFrom,
        ]);
        const result = await client.query(`
          INSERT INTO transport_student_assignments (
            tenant_id, student_id, route_id,
            pickup_stop_id, drop_stop_id, effective_from
          ) VALUES (
            $1::uuid, $2::uuid, $3::uuid,
            $4::uuid, $5::uuid, $6::date
          )
          RETURNING id, student_id AS "studentId",
            route_id AS "routeId",
            pickup_stop_id AS "pickupStopId",
            drop_stop_id AS "dropStopId",
            effective_from::text AS "effectiveFrom", status
        `, [
          tenantId,
          action.studentId,
          action.routeId,
          action.pickupStopId ?? null,
          action.dropStopId ?? null,
          action.effectiveFrom,
        ]);
        return result.rows[0] ?? {};
      }
      case "schedule_trip": {
        const result = await client.query(`
          INSERT INTO transport_trips (
            tenant_id, driver_assignment_id, route_id,
            service_date, direction, scheduled_start_at
          ) VALUES (
            $1::uuid, $2::uuid, $3::uuid,
            $4::date, $5, $6::timestamptz
          )
          ON CONFLICT (
            tenant_id, route_id, service_date, direction
          ) DO UPDATE SET
            driver_assignment_id = EXCLUDED.driver_assignment_id,
            scheduled_start_at = EXCLUDED.scheduled_start_at,
            updated_at = now()
          RETURNING id,
            driver_assignment_id AS "driverAssignmentId",
            route_id AS "routeId",
            service_date::text AS "serviceDate",
            direction,
            scheduled_start_at::text AS "scheduledStartAt",
            status
        `, [
          tenantId,
          action.driverAssignmentId,
          action.routeId,
          action.serviceDate,
          action.direction,
          action.scheduledStartAt ?? null,
        ]);
        return result.rows[0] ?? {};
      }
    }
  });
}
