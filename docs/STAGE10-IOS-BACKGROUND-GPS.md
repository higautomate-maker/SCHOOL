# Stage 10 — iOS Active-Trip Background GPS

## Scope

The HIG Driver iOS application now uses the same assigned active-trip safety
boundary as Android. Tracking is not an always-on employee tracker: a driver
must open the application and start or resume an assigned school trip first.

## iOS permissions and background mode

The Runner declares both `NSLocationWhenInUseUsageDescription` and
`NSLocationAlwaysAndWhenInUseUsageDescription`, plus the iOS `location`
background mode.

For iOS, the Driver requires `LocationPermission.always` before starting or
resuming production background tracking. If the user has only While Using the
App permission, the app requests the upgrade and otherwise tells the driver to
set Location access to Always in iPhone Settings.

The project intentionally does not set `BYPASS_PERMISSION_LOCATION_ALWAYS=1`.

## Location stream

The active trip uses `AppleSettings` with:

- high accuracy;
- automotive navigation activity type;
- 25 metre movement filter;
- automatic pausing disabled during the active trip;
- background location updates enabled;
- the iOS background location indicator enabled for transparency.

Existing trip pause, completion and logout flows remain responsible for
stopping the location stream. Existing offline queueing, geofencing,
stop-approach/arrival detection and server-side active-trip authorization are
reused.

## iOS operating-system boundary

A user force-quit of the iOS app terminates the running application and must not
be represented as guaranteed continuous tracking. The driver must reopen the
app before tracking can resume.

This Stage 10 implementation does not attempt silent device boot tracking or
unassigned background tracking.

## App Store review

Background location is a review-sensitive capability. Store metadata must
explain that the Driver app shares school-bus location only during an assigned
active school trip for student safety, parent live tracking, stop alerts and
emergency response.

## Acceptance boundary

Flutter analysis and a no-codesign iOS device build provide development
validation. Final acceptance still requires a physical iPhone test covering:

- Always permission grant/upgrade;
- screen locked during an active trip;
- app sent to the background;
- mobile-data loss and recovery;
- pause, resume and complete;
- iOS background location indicator;
- force-quit and reopen behavior.

That physical iPhone test remains part of the combined staging UAT.

## Deployment status

This block requires no database migration.

Nothing is committed, pushed, merged, migrated, or deployed by this validation
script.
