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
