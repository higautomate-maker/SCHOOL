# Stage 10 — SOS Emergency Escalation

The Driver SOS control is available only for the currently assigned trip when
that trip is Active or Paused. The Driver confirms before sending.

The app uses the most recent GPS point when available and attempts a fresh GPS
point when needed, but GPS failure does not block emergency transmission.

PostgreSQL takes a transaction-scoped advisory lock per tenant/trip and treats
another SOS captured within 60 seconds as a replay. This prevents duplicate
notification storms from retries or repeated taps.

A newly accepted SOS creates a `transport.alert` outbox event in the same
transaction. It includes trip, route, vehicle, latest available coordinates,
GPS accuracy, captured time, and severity `critical`.

SOS routes to the School audience only. The School transport portal retains its
red SOS highlighting/count and now shows vehicle identity plus an exact
emergency-location link when coordinates are available.

No database migration is introduced by this SOS block. Nothing is committed,
pushed, merged, migrated, or deployed by the validation script.
