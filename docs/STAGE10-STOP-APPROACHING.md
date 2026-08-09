# Stage 10 — Stop Approaching Alerts

## Purpose

`stop_approaching` gives the Parent a warning before the bus reaches the
student's assigned pickup/drop stop.

## Detection

The Driver app reuses the active-trip GPS stream. No Android OS geofence API,
boot receiver, or always-on background-location permission is introduced.

For each route stop:

- arrival radius = the configured stop geofence radius;
- approach lead = 1.5 × radius, bounded to 300–1500 meters;
- approach threshold = arrival radius + approach lead.

The approach event fires when the bus is outside the arrival radius but inside
the approach threshold.

## De-duplication

`stop_approaching` is emitted once per tenant/trip/stop. Migration 0012's
existing stop-transition unique index is extended to include approach events.

The Driver also restores emitted approach state from the transport event
snapshot. Offline/retry duplicates remain protected by the PostgreSQL unique
transition contract.

## Security

`stop_approaching`:

- requires the exact active assigned trip;
- requires a route stop in the Driver's current route snapshot;
- must contain `metadata.automatic = true`;
- is treated as GPS-derived geofencing;
- remains allowed through the existing active-trip Android foreground service.

## Notifications

The existing Stage 8 `transport.alert` outbox is reused.

Parent recipients are derived server-side from active student transport
assignments matching the exact pickup/drop stop for the trip direction.

A Parent receives a message that the school bus is approaching the assigned
stop and asks them to be ready. The School receives one operational approach
alert as well.

## Migration status

No new migration is introduced. Migration 0012 is still local and unapplied,
so this development step extends its event constraint and unique stop-event
index before any staging migration occurs.

Nothing is committed, pushed, merged, migrated, or deployed by this validation
step.
