# Stage 10 — Production Student Boarding / Drop Workflow

## Journey state

Every assigned student follows a trip-scoped state machine:

1. Waiting
2. Boarded
3. Dropped

The Driver app restores the latest journey state after refresh or restart.

The Driver UI disables invalid transitions, while the server and PostgreSQL
remain authoritative.

## Boarding rules

A boarding/drop event requires:

- the authenticated transporter;
- the exact tenant;
- the exact active trip;
- the active driver assignment;
- the active student route assignment;
- the assigned student.

A student cannot be dropped before being boarded.

Repeated board/drop transitions are handled safely instead of creating
duplicate journey events.

## Database protection

Migration:

`drizzle-postgres/0013_transport_student_journey.sql`

adds trip/student journey validation and uniqueness for:

tenant + trip + student + transition type.

This protects against duplicate events even when mobile retries occur.

## Driver app

The Driver app now:

- restores Boarded/Dropped state from server events;
- permits Board only while the trip is active;
- permits Drop only after Board;
- disables invalid actions;
- preserves the existing offline mobile event queue.

## Parent app

Parent Live Transport exposes only the authenticated parent's linked child's
current journey state:

- Waiting
- Boarded
- Dropped

It does not expose other passenger journeys or passenger history.

## School transport portal

The recent-event audit feed resolves:

- event type;
- student ID;
- student name;
- stop ID;
- stop name;
- captured time;
- location metadata when available.

## Deployment status

Migration 0013 remains local during development.

This work is not committed, pushed, merged, migrated, or deployed by the
validation procedure.

## Remaining Stage 10

- stop approach / arrival notifications;
- parent and School transport alerts;
- SOS escalation;
- GPS retention/deletion automation;
- iOS background GPS validation;
- final physical-road and multi-app staging UAT.
