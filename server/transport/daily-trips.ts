import type { PoolClient } from "pg";

/**
 * Materialise today's journeys for active driver assignments.
 *
 * A route configured for both directions gets an independent pickup and drop
 * trip. The unique route/date/direction constraint makes this safe to call on
 * every mobile refresh and ensures a completed morning trip is never reused
 * for the afternoon return or for the next school day.
 */
export async function ensureDailyTransportTrips(
  client: PoolClient,
  tenantId: string,
  driverUserId?: string,
): Promise<number> {
  const result = await client.query(`
    WITH eligible_assignments AS (
      SELECT
        assignment.tenant_id,
        assignment.id AS driver_assignment_id,
        assignment.route_id,
        route.direction AS route_direction
      FROM transport_driver_assignments assignment
      JOIN transport_drivers driver
        ON driver.tenant_id = assignment.tenant_id
       AND driver.id = assignment.driver_id
       AND driver.status = 'active'
      JOIN transport_vehicles vehicle
        ON vehicle.tenant_id = assignment.tenant_id
       AND vehicle.id = assignment.vehicle_id
       AND vehicle.status = 'active'
      JOIN transport_routes route
        ON route.tenant_id = assignment.tenant_id
       AND route.id = assignment.route_id
       AND route.status = 'active'
      WHERE assignment.tenant_id = $1::uuid
        AND assignment.status = 'active'
        AND assignment.effective_from <= current_date
        AND (
          assignment.effective_to IS NULL
          OR assignment.effective_to >= current_date
        )
        AND ($2::uuid IS NULL OR driver.user_id = $2::uuid)
    ), daily_directions AS (
      SELECT
        eligible.tenant_id,
        eligible.driver_assignment_id,
        eligible.route_id,
        direction.value AS direction
      FROM eligible_assignments eligible
      CROSS JOIN LATERAL unnest(
        CASE eligible.route_direction
          WHEN 'pickup' THEN ARRAY['pickup']::text[]
          WHEN 'drop' THEN ARRAY['drop']::text[]
          ELSE ARRAY['pickup', 'drop']::text[]
        END
      ) AS direction(value)
    )
    INSERT INTO transport_trips (
      tenant_id,
      driver_assignment_id,
      route_id,
      service_date,
      direction,
      scheduled_start_at,
      status
    )
    SELECT
      daily.tenant_id,
      daily.driver_assignment_id,
      daily.route_id,
      current_date,
      daily.direction,
      NULL,
      'scheduled'
    FROM daily_directions daily
    ON CONFLICT (tenant_id, route_id, service_date, direction) DO NOTHING
    RETURNING id
  `, [tenantId, driverUserId ?? null]);

  return result.rowCount ?? 0;
}
