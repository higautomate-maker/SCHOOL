# Stage 10 — Android active-trip background GPS

## Implemented

- Android Driver GPS continues during an active trip when the app is minimized or the screen is locked by using the Geolocator Android foreground service.
- The service is started only from a visible Driver activity after the driver starts/resumes an assigned trip.
- A persistent Android notification states that location is being shared with the school for the active trip.
- Tracking uses high accuracy, a 25 metre distance filter, and a 15 second active update interval. Wi-Fi and wake locks are deliberately disabled.
- Location event metadata records whether the Flutter UI is resumed or backgrounded.
- An active server trip can restore its local stream when the Driver app is visible again without sending a duplicate `trip_started` event.
- Pause, complete and logout stop the local location stream before continuing.
- Existing idempotency, 72-hour offline expiry and reconnect flushing remain in place. During an outage, Driver GPS coalesces pending updates and queues at most one retained GPS sample every three minutes, keeping the existing 100-write queue bounded while preserving several hours of representative trip positions.

## Server-side enforcement

- `metadata.background=true` is accepted only for GPS `location` events.
- Background trip-control, student boarding/drop and SOS events remain rejected.
- Every GPS location must reference the driver's exact assigned trip and that trip must already be `active`.
- `trip_started` transitions a scheduled/paused trip to active.
- `trip_paused` transitions only an active trip to paused.
- `trip_completed` transitions only an active/paused trip to completed.
- Event persistence and PostgreSQL `transport_trips` state transition occur in the same transaction.
- Trip updates remain tenant-bound and driver-bound, preventing a transporter from changing another driver's trip.
- Duplicate idempotency replay does not apply a second state transition.

## Android permissions

The Driver app declares:

- `ACCESS_COARSE_LOCATION`
- `ACCESS_FINE_LOCATION`
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_LOCATION`

It deliberately does **not** request `ACCESS_BACKGROUND_LOCATION`. The supported flow starts the location foreground service while the Driver activity is visible; it then continues as an active foreground service when the UI is minimized or locked. The app must not try to create a location foreground service from the background.

## Privacy boundary

- No location stream before an active trip.
- No silent always-on driver tracking.
- Persistent Android notification while active-trip tracking runs.
- GPS stops on Pause, Complete and Logout.
- A force-stopped Android application cannot continue tracking and is not claimed to do so.

## Remaining Stage 10 acceptance/work

- Physical Android locked-screen road acceptance test (deferred to final staging UAT).
- Mobile-data loss and reconnect road acceptance test (deferred to final staging UAT).
- OEM battery-saver acceptance on representative devices.
- iOS background GPS implementation and Xcode/native validation.
- Geofencing and stop arrival/departure automation.
- Parent live bus map/ETA.
- Location retention/deletion automation.
- Full SOS escalation workflow.
