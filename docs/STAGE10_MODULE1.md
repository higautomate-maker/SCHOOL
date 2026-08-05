# Stage 10 Module 1 — Transport Master Data

This patch adds:

- Drivers, vehicles, routes, stops, driver assignments, student assignments and trips.
- Tenant-isolated PostgreSQL schema and RLS.
- School transport read/write API:
  - `GET /api/v1/schools/{schoolId}/transport`
  - `POST /api/v1/schools/{schoolId}/transport`
- Driver transport snapshot with route, vehicle, trip, stops and named students.
- A redesigned Hig Driver dashboard without UUIDs.
- Correct ready/active/paused/completed UI states.
- Greenfield staging seed data.

It deliberately keeps Stage 9 foreground GPS tracking. Background tracking,
geofencing and parent live-map productionization belong to later Stage 10 modules.

## Apply migration

Run `drizzle-postgres/0011_transport_master_data.sql` against the staging
`production -> staging_school` database.

Then run `scripts/stage10-greenfield-transport-seed.sql`.

## Validation

- `npm run lint`
- `npm test`
- `npm run build`
- `cd mobile/driver_gps_app && flutter analyze`
- Build/install the Driver APK with the existing staging dart-defines.

## Production admin completion

- The School Transport workspace reads and writes the authenticated
  `/api/v1/schools/:schoolId/transport` endpoint.
- Preview vehicles, routes, locations and timelines were removed from the
  authenticated Transport UI.
- Active school users can be registered as drivers without entering UUIDs.
- Administrators can create vehicles, routes and ordered stops; assign drivers,
  vehicles and students; and schedule trips.
- The live tracking screen reads the latest foreground location per trip and
  recent trip, boarding, drop and SOS events.
- `mobile_transport_events` retains mobile-service-only writes while adding a
  tenant-scoped SELECT policy for the separately authorized Transport admin API.
- Same-route foreign keys prevent stop and trip assignment mismatches, while
  API guards require active tenant users and active transport resources.
- Dedicated validation is available through `npm run stage10:test`.
