# Stage 10 — Transport Arrival and Journey Notifications

Transport alerts reuse the existing Stage 8 outbox, queue worker, inbox, and
delivery adapters.

A newly accepted `stop_arrived`, `stop_departed`, `student_boarded`, or
`student_dropped` event writes its `transport.alert` outbox record inside the
same PostgreSQL transaction. Replayed transport events create no new outbox
record. Redis worker wake happens only after commit.

## Parent recipient rules

Parent recipients are resolved from server-side active transport assignments.

- `stop_arrived`: Parents whose linked child is assigned to that exact pickup
  or drop stop for the current trip direction.
- `student_boarded`: the assigned student's Parent.
- `student_dropped`: the assigned student's Parent.
- `stop_departed`: School operational alert only.

The School receives one operational audience notification for every supported
transport alert event.

## Channels

The existing Stage 8 delivery expansion remains authoritative, so in-app plans
can also expand to email, SMS, and push once those adapters are configured.

## Privacy and replay protection

The Driver does not select Parent recipients. Assignment validation and
recipient resolution are performed on the server. Existing mobile-event
idempotency plus outbox creation only on a new event prevents duplicate alerts
from GPS/geofence retries.

## Next sub-block

`stop_approaching` is not part of the current transport event contract. The
next sub-block adds the pre-arrival distance threshold and its Parent alert.

No migration, commit, push, merge, or deployment is performed here.
