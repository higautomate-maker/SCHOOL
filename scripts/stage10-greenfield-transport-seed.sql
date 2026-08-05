BEGIN;

SELECT set_config(
  'app.tenant_id',
  '1c602856-3fec-486f-b18d-a791f124b206',
  true
);

INSERT INTO transport_drivers (
  id, tenant_id, user_id, employee_code, mobile_number,
  license_number, license_expiry, status
)
SELECT
  '41000000-0000-4000-8000-000000000001'::uuid,
  '1c602856-3fec-486f-b18d-a791f124b206'::uuid,
  id,
  'DRV-001',
  '+91 99999 00001',
  'HR-DRV-TEST-001',
  current_date + 365,
  'active'
FROM users
WHERE lower(email) = 'greenfield.driver.test@higschool.test'
ON CONFLICT (tenant_id, user_id) DO UPDATE SET
  employee_code = EXCLUDED.employee_code,
  mobile_number = EXCLUDED.mobile_number,
  license_number = EXCLUDED.license_number,
  license_expiry = EXCLUDED.license_expiry,
  status = 'active',
  updated_at = now();

INSERT INTO transport_vehicles (
  id, tenant_id, vehicle_number, registration_number,
  vehicle_type, capacity, gps_device_id, status
)
VALUES (
  '42000000-0000-4000-8000-000000000001'::uuid,
  '1c602856-3fec-486f-b18d-a791f124b206'::uuid,
  'Bus 01',
  'HR36AB1234',
  'school_bus',
  40,
  'DRIVER-PHONE-001',
  'active'
)
ON CONFLICT (tenant_id, vehicle_number) DO UPDATE SET
  registration_number = EXCLUDED.registration_number,
  vehicle_type = EXCLUDED.vehicle_type,
  capacity = EXCLUDED.capacity,
  gps_device_id = EXCLUDED.gps_device_id,
  status = 'active',
  updated_at = now();

INSERT INTO transport_routes (
  id, tenant_id, route_name, route_code, direction, shift, status
)
VALUES (
  '43000000-0000-4000-8000-000000000001'::uuid,
  '1c602856-3fec-486f-b18d-a791f124b206'::uuid,
  'Greenfield Route A',
  'GF-A',
  'both',
  'morning',
  'active'
)
ON CONFLICT (tenant_id, route_code) DO UPDATE SET
  route_name = EXCLUDED.route_name,
  direction = EXCLUDED.direction,
  shift = EXCLUDED.shift,
  status = 'active',
  updated_at = now();

INSERT INTO transport_route_stops (
  id, tenant_id, route_id, stop_name, sequence_number,
  latitude, longitude, pickup_time, drop_time,
  geofence_radius_meters, status
)
VALUES
(
  '44000000-0000-4000-8000-000000000001'::uuid,
  '1c602856-3fec-486f-b18d-a791f124b206'::uuid,
  '43000000-0000-4000-8000-000000000001'::uuid,
  'Sector 4 Gate',
  1,
  28.1970,
  76.6170,
  '07:30',
  '14:30',
  200,
  'active'
),
(
  '44000000-0000-4000-8000-000000000002'::uuid,
  '1c602856-3fec-486f-b18d-a791f124b206'::uuid,
  '43000000-0000-4000-8000-000000000001'::uuid,
  'Market Road',
  2,
  28.2050,
  76.6250,
  '07:45',
  '14:15',
  200,
  'active'
),
(
  '44000000-0000-4000-8000-000000000003'::uuid,
  '1c602856-3fec-486f-b18d-a791f124b206'::uuid,
  '43000000-0000-4000-8000-000000000001'::uuid,
  'School Main Gate',
  3,
  28.2150,
  76.6350,
  '08:00',
  '14:00',
  250,
  'active'
)
ON CONFLICT (tenant_id, route_id, sequence_number) DO UPDATE SET
  stop_name = EXCLUDED.stop_name,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  pickup_time = EXCLUDED.pickup_time,
  drop_time = EXCLUDED.drop_time,
  geofence_radius_meters = EXCLUDED.geofence_radius_meters,
  status = 'active',
  updated_at = now();

INSERT INTO transport_driver_assignments (
  id, tenant_id, driver_id, vehicle_id, route_id,
  effective_from, effective_to, status
)
VALUES (
  '45000000-0000-4000-8000-000000000001'::uuid,
  '1c602856-3fec-486f-b18d-a791f124b206'::uuid,
  '41000000-0000-4000-8000-000000000001'::uuid,
  '42000000-0000-4000-8000-000000000001'::uuid,
  '43000000-0000-4000-8000-000000000001'::uuid,
  current_date,
  NULL,
  'active'
)
ON CONFLICT (tenant_id, id) DO UPDATE SET
  driver_id = EXCLUDED.driver_id,
  vehicle_id = EXCLUDED.vehicle_id,
  route_id = EXCLUDED.route_id,
  effective_from = EXCLUDED.effective_from,
  effective_to = NULL,
  status = 'active',
  updated_at = now();

INSERT INTO transport_student_assignments (
  id, tenant_id, student_id, route_id,
  pickup_stop_id, drop_stop_id,
  effective_from, effective_to, status
)
VALUES (
  '46000000-0000-4000-8000-000000000001'::uuid,
  '1c602856-3fec-486f-b18d-a791f124b206'::uuid,
  'e6fbf585-3ff2-4a7d-ab9d-4a956cc57f97'::uuid,
  '43000000-0000-4000-8000-000000000001'::uuid,
  '44000000-0000-4000-8000-000000000001'::uuid,
  '44000000-0000-4000-8000-000000000003'::uuid,
  current_date,
  NULL,
  'active'
)
ON CONFLICT (tenant_id, id) DO UPDATE SET
  route_id = EXCLUDED.route_id,
  pickup_stop_id = EXCLUDED.pickup_stop_id,
  drop_stop_id = EXCLUDED.drop_stop_id,
  effective_from = EXCLUDED.effective_from,
  effective_to = NULL,
  status = 'active',
  updated_at = now();

INSERT INTO transport_trips (
  id, tenant_id, driver_assignment_id, route_id,
  service_date, direction, scheduled_start_at, status
)
VALUES (
  '47000000-0000-4000-8000-000000000001'::uuid,
  '1c602856-3fec-486f-b18d-a791f124b206'::uuid,
  '45000000-0000-4000-8000-000000000001'::uuid,
  '43000000-0000-4000-8000-000000000001'::uuid,
  current_date,
  'pickup',
  current_date + time '07:30',
  'scheduled'
)
ON CONFLICT (tenant_id, route_id, service_date, direction) DO UPDATE SET
  driver_assignment_id = EXCLUDED.driver_assignment_id,
  scheduled_start_at = EXCLUDED.scheduled_start_at,
  status = CASE
    WHEN transport_trips.status = 'completed' THEN transport_trips.status
    ELSE 'scheduled'
  END,
  updated_at = now();

INSERT INTO mobile_identity_assignments (
  tenant_id, mobile_identity_id, resource_type, resource_id,
  status, revoked_at, revoked_reason, created_at, updated_at
)
SELECT
  '1c602856-3fec-486f-b18d-a791f124b206'::uuid,
  identity.id,
  item.resource_type,
  item.resource_id,
  'active',
  NULL,
  NULL,
  now(),
  now()
FROM mobile_identities identity
JOIN users driver ON driver.id = identity.user_id
CROSS JOIN (
  VALUES
    ('vehicle'::text, '42000000-0000-4000-8000-000000000001'::uuid),
    ('route'::text, '43000000-0000-4000-8000-000000000001'::uuid),
    ('trip'::text, '47000000-0000-4000-8000-000000000001'::uuid)
) AS item(resource_type, resource_id)
WHERE identity.tenant_id =
      '1c602856-3fec-486f-b18d-a791f124b206'::uuid
  AND identity.audience::text = 'transporter'
  AND lower(driver.email) = 'greenfield.driver.test@higschool.test'
ON CONFLICT (
  tenant_id, mobile_identity_id, resource_type, resource_id
)
DO UPDATE SET
  status = 'active',
  revoked_at = NULL,
  revoked_reason = NULL,
  updated_at = now();

COMMIT;
