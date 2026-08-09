import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const driver = read("mobile/driver_gps_app/lib/main.dart");
const driverManifest = read(
  "mobile/driver_gps_app/android/app/src/main/AndroidManifest.xml",
);
const studentManifest = read(
  "mobile/student_parent_app/android/app/src/main/AndroidManifest.xml",
);
const staffManifest = read(
  "mobile/staff_admin_app/android/app/src/main/AndroidManifest.xml",
);
const mobileCore = read(
  "mobile/packages/hig_mobile_core/lib/hig_mobile_core.dart",
);
const bootstrap = read("mobile/scripts/bootstrap_flutter_platforms.sh");

test("Stage 10 Android Driver declares only active-trip foreground-service location permissions", () => {
  assert.match(driverManifest, /android\.permission\.FOREGROUND_SERVICE/);
  assert.match(
    driverManifest,
    /android\.permission\.FOREGROUND_SERVICE_LOCATION/,
  );
  assert.doesNotMatch(driverManifest, /ACCESS_BACKGROUND_LOCATION/);
  assert.doesNotMatch(studentManifest, /FOREGROUND_SERVICE_LOCATION/);
  assert.doesNotMatch(staffManifest, /FOREGROUND_SERVICE_LOCATION/);
  assert.match(bootstrap, /FOREGROUND_SERVICE_LOCATION/);
  assert.match(bootstrap, /do not request always-on background location/i);
});

test("Driver uses battery-conscious Android foreground-service GPS", () => {
  assert.match(driver, /AndroidSettings\(/);
  assert.match(driver, /foregroundNotificationConfig:/);
  assert.match(driver, /Hig Driver · Trip tracking active/);
  assert.match(driver, /setOngoing: true/);
  assert.match(driver, /enableWifiLock: false/);
  assert.match(driver, /enableWakeLock: false/);
  assert.match(driver, /intervalDuration: const Duration\(seconds: 15\)/);
  assert.match(driver, /distanceFilter: 25/);
});

test("Driver lifecycle metadata and restoration do not duplicate trip-start", () => {
  assert.match(driver, /with WidgetsBindingObserver/);
  assert.match(driver, /'background': !appVisible/);
  assert.doesNotMatch(driver, /'background': false/);
  assert.match(driver, /restoreActiveTracking\(\)/);
  assert.match(
    driver,
    /startTracking\(emitTripStarted: false, restored: true\)/,
  );
  assert.match(driver, /if \(!mounted \|\| !appVisible/);
});

test("Pause, completion and logout stop local GPS before continuing", () => {
  assert.match(
    driver,
    /Future<void> pause\(\)[\s\S]*await stopTracking\(\);[\s\S]*trip_paused/,
  );
  assert.match(
    driver,
    /Future<void> complete\(\)[\s\S]*await stopTracking\(\);[\s\S]*trip_completed/,
  );
  assert.match(
    driver,
    /Future<void> logout\(\)[\s\S]*await stopTracking\(\);/,
  );
});

test("GPS outage behavior remains bounded and reconnect-safe", () => {
  assert.match(
    driver,
    /offlineLocationSampleInterval = Duration\(minutes: 3\)/,
  );
  assert.match(driver, /pendingPosition = position/);
  assert.match(driver, /if \(wasOffline\) unawaited\(widget\.api\.flushQueue\(\)\)/);
  assert.match(mobileCore, /queue\.length <= 100/);
  assert.match(mobileCore, /inHours <= 72/);
  assert.match(mobileCore, /class OfflineSyncService/);
  assert.match(mobileCore, /api\.flushQueue\(\)/);
});

test("Stage 10 wildcard command includes background GPS contract", () => {
  const packageJson = JSON.parse(read("package.json")) as {
    scripts?: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts?.["stage10:test"],
    "node --experimental-strip-types --test tests/stage10-*.test.ts",
  );
});
