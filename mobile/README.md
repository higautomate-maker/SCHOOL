# Hig School Flutter apps

This folder contains three Flutter source projects connected to the same Hig School API:

- `student_parent_app` — 13 modules for students and parents.
- `staff_admin_app` — 16 modules for teachers, staff and school administrators.
- `driver_gps_app` — live trip, GPS, route, vehicle and SOS workflows.

## Create Android and iOS runners

Flutter is not bundled in the delivery environment, so generate the standard signed-platform runners on a machine with Flutter 3.24 or newer:

```bash
cd mobile/student_parent_app
flutter create . --platforms=android,ios --org com.higautomation
flutter pub get

cd ../staff_admin_app
flutter create . --platforms=android,ios --org com.higautomation
flutter pub get

cd ../driver_gps_app
flutter create . --platforms=android,ios --org com.higautomation
flutter pub get
```

Run against the local web/API server:

```bash
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3002
```

For iOS Simulator use `http://127.0.0.1:3002`. For a physical device use the computer’s LAN address or the hosted HTTPS domain.

The Driver app requires Android fine/background location permissions and iOS `NSLocationWhenInUseUsageDescription` plus background location mode before store release.
