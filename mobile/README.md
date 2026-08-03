# Hig School Flutter applications — Stage 9 completion

The repository contains three Flutter products that use the dedicated mobile bearer-token API. None of the apps use the sales-demo endpoints or build-time demo passwords.

- `student_parent_app` — Student and Parent identities, role-enabled modules, attendance, fees, homework, examinations, notices, requests, notifications, secure session restoration, offline cache, and queued writes.
- `staff_admin_app` — School staff/admin identity, Company-entitled modules, role permissions, attendance and fee actions, module record publishing, notifications, secure session restoration, offline cache, and queued writes.
- `driver_gps_app` — Transporter identity, assignment view, foreground trip/location events, offline event queue, push registration, and SOS. Background tracking, geofencing, live parent maps, and location-retention automation remain Stage 10.
- `packages/hig_mobile_core` — shared secure token store, refresh rotation, API client, offline cache/queue, Firebase token registration, and shared UI.

## Required toolchain

- Flutter 3.24 or newer with Dart 3.5 or newer
- Xcode for iOS builds
- Android Studio / Android SDK for Android builds
- CocoaPods for iOS plugin installation

## Generate native Android and iOS runners

Run once from the repository root:

```bash
bash mobile/scripts/bootstrap_flutter_platforms.sh
```

The script creates standard Android/iOS runner folders without replacing the checked-in Dart source. It adds foreground location permissions only to the Driver app. Stage 9 deliberately does not add Android background-location permission or iOS continuous-background location mode.

## Local run

Android emulator:

```bash
cd mobile/student_parent_app
flutter run \
  --dart-define=API_BASE_URL=http://10.0.2.2:3002 \
  --dart-define=HIG_TENANT_ID=YOUR_TENANT_UUID
```

For iOS Simulator use `http://127.0.0.1:3002`. Physical devices require the Mac LAN IP or an HTTPS staging domain.

## Push configuration

Copy the platform files supplied by Firebase into each app only after separate staging Firebase projects/apps have been created:

- Android: `android/app/google-services.json`
- iOS: `ios/Runner/GoogleService-Info.plist`

See `mobile/firebase/README.md`. Provider credentials and real remote-delivery acceptance are external release inputs and are not committed to Git.

## Validation

```bash
bash mobile/scripts/validate_flutter_apps.sh
```

This runs formatting checks, dependency resolution, static analysis, Flutter tests, Android debug APK builds, and unsigned iOS Simulator builds when the required SDKs are installed.
