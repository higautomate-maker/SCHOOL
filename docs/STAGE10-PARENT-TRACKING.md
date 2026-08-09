# Stage 10 — Parent Live Transport Tracking + ETA

The Parent app now has a dedicated Transport Tracking screen.

## Privacy

The server derives linked student IDs from the authenticated parent's
server-side assignments. The client cannot request an arbitrary student.

Only the linked child, assigned route/vehicle, child pickup/drop stops,
current active trip, latest active-trip GPS point, freshness, distance and
ETA are returned.

The Parent read model does not expose passenger lists, driver contact
details, driver licence details, unrestricted fleet data or GPS history.

## Refresh

The Live Transport screen refreshes every 15 seconds only while mounted.

## ETA

ETA uses the latest GPS position and straight-line distance to the child's
relevant stop. Recent measured speed is bounded for safety; otherwise a
conservative fallback speed is used. GPS older than 15 minutes is treated as
offline and receives no ETA.

This ETA is an estimate and is not yet traffic-aware.

## Remaining Stage 10

- student boarding/drop production workflow;
- stop-approach/arrival notifications;
- SOS escalation;
- GPS retention/deletion automation;
- iOS background GPS validation;
- final multi-app and real-road staging UAT.
