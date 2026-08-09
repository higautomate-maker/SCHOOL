# Stage 10 — Transport/GPS acceptance report

Date: 2026-08-09

Status: **Engineering complete; production acceptance remains conditional on physical road UAT.**

## Completed scope

- Driver, vehicle, route, stop, assignment and trip administration.
- Driver foreground and locked-screen Android GPS for active trips.
- Battery- and network-bounded location collection, offline coalescing,
  idempotent replay and automatic reconnect flushing.
- iOS active-trip background-location implementation and privacy declarations.
- Trip state enforcement and tenant/driver assignment checks.
- Geofencing, stop approach, arrival and departure detection.
- Student boarding and drop-off events.
- Parent live trip position, stop context and ETA without location history or
  driver contact disclosure.
- Parent approach/arrival/departure and student-journey notifications.
- SOS escalation, acknowledgement, resolution and audit flow.
- Thirty-day bounded GPS retention with automatic tenant-scoped deletion.

## Automated evidence

- `npm run stage10:test`: **71 passed, 0 failed**.
- Full Node test suite: **343 tests, 329 passed, 14 explicitly planned, 0
  failed**.
- TypeScript type checking and production build passed.
- ESLint has no errors.
- Flutter analysis passed with zero issues for the shared mobile package and
  the Student/Parent, Staff/Admin and Driver applications.
- PostgreSQL migrations `0012_transport_geofencing.sql` and
  `0013_transport_student_journey.sql` are applied on staging with the expected
  checksums.
- The Stage 11 staging release that contains Stage 10 is healthy and ready at
  `staging-school.higaai.com`.

## Environment-only validation limitation

The Flutter 3.44.8 `darwin-x64` test runner aborts inside Dart CPU detection
when executed through Intel translation on the ARM validation Mac. All four
projects complete native ARM static analysis successfully. This is recorded as
a validation-host limitation, not an application test failure. Android Gradle
packaging also requires a large first-use toolchain download in this clean
workspace; it is not used as evidence of a product defect.

## Mandatory physical UAT still required

Run on representative Android and iPhone devices against staging:

1. Start an assigned trip and lock the screen for at least 30 minutes.
2. Verify location continues with the required persistent OS indication.
3. Disable mobile data, drive through multiple samples, restore data and verify
   bounded, ordered, duplicate-safe recovery.
4. Enable OEM battery saver and repeat the locked-screen route.
5. Cross approach, arrival and departure geofences in both directions.
6. Board and drop a linked student and verify only the linked parent receives
   the correct journey state.
7. Verify parent live position/ETA exposes neither historical coordinates nor
   driver contact details.
8. Trigger, acknowledge and resolve SOS with school staff and verify the audit
   record and escalation notifications.
9. Pause, complete and log out; verify GPS collection stops in every case.

Record phone model, OS version, battery mode, network transitions, timestamps,
trip ID and screenshots. Any cross-tenant disclosure, missing locked-screen
tracking, duplicate student event or unresolved SOS is an immediate no-go.

## Acceptance decision

Stage 10 software implementation is complete. Stage 10 must not be marked
production-accepted until the physical UAT matrix above is signed off. No
production cutover or public launch is authorized by this report.
