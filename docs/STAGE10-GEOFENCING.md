# Stage 10 — GPS-Derived Stop Geofencing

## Implemented

The Android Hig Driver app now derives route-stop geofence transitions from the same active-trip foreground-service GPS stream used for background-safe tracking.

For each assigned route stop:

- `geofenceRadiusMeters` is supplied by the School Transport route configuration.
- `stop_arrived` is emitted when the active trip enters the configured radius.
- `stop_departed` is emitted only after a recorded arrival and after the device moves beyond the stop radius plus a 25% hysteresis band.
- Hysteresis is bounded between 25 m and 100 m to reduce GPS-jitter arrival/departure flapping.
- The client restores already-recorded stop transitions from the transport snapshot.
- PostgreSQL enforces at most one arrival and one departure per trip/stop/event type.
- Stop transitions carry the current GPS coordinates and distance/radius metadata.
- Stop events are accepted only for the driver's exact assigned active trip and one of that route's stops.

## Background and privacy model

This does not use Android's always-on OS geofence APIs.

It reuses the existing location foreground service while a driver has explicitly started an active trip. Therefore:

- no `ACCESS_BACKGROUND_LOCATION` permission is added;
- there is no boot receiver or silent always-on location tracking;
- geofence processing stops with Pause, Complete, Logout, or when active-trip GPS stops;
- the persistent Android location notification remains visible while tracking is active.

## Database migration

`drizzle-postgres/0012_transport_geofencing.sql` adds:

- `mobile_transport_events.stop_id`;
- tenant-bound route-stop foreign key;
- `stop_arrived` and `stop_departed` event types;
- a geofence event validity check;
- database-level trip/stop/event-type deduplication.

The migration is created locally only by this development step. It is not applied to staging or production by the validation script.

## Remaining Stage 10 work

- Parent live bus tracking and privacy-scoped ETA.
- Parent/school notifications based on stop approach/arrival.
- End-to-end SOS escalation workflow.
- Automated location retention/deletion.
- iOS background GPS validation.
- Final physical Android road, locked-screen, and network-recovery UAT.
