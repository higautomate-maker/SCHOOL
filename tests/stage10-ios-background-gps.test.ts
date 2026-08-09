import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const driver = readFileSync("mobile/driver_gps_app/lib/main.dart", "utf8");
const plist = readFileSync("mobile/driver_gps_app/ios/Runner/Info.plist", "utf8");
const podfile = readFileSync("mobile/driver_gps_app/ios/Podfile", "utf8");
const service = readFileSync("server/mobile-app/service.ts", "utf8");
const docs = readFileSync("docs/STAGE10-IOS-BACKGROUND-GPS.md", "utf8");

test("iOS declares Always permission and Location Updates background mode", () => {
  assert.match(plist, /NSLocationWhenInUseUsageDescription/);
  assert.match(plist, /NSLocationAlwaysAndWhenInUseUsageDescription/);
  assert.match(plist, /UIBackgroundModes[\s\S]*<string>location<\/string>/);
});

test("iOS does not bypass the geolocator Always permission path", () => {
  assert.doesNotMatch(podfile, /BYPASS_PERMISSION_LOCATION_ALWAYS\s*=\s*1/);
});

test("Driver requires Always permission before iOS active-trip tracking", () => {
  assert.match(driver, /defaultTargetPlatform == TargetPlatform\.iOS[\s\S]*permission == LocationPermission\.whileInUse/);
  assert.match(driver, /defaultTargetPlatform == TargetPlatform\.iOS[\s\S]*permission != LocationPermission\.always/);
  assert.match(driver, /Set iPhone Location access to Always for active-trip tracking/);
});

test("Driver uses automotive AppleSettings for active-trip background GPS", () => {
  assert.match(driver, /return AppleSettings\(/);
  assert.match(driver, /activityType: ActivityType\.automotiveNavigation/);
  assert.match(driver, /distanceFilter: 25/);
  assert.match(driver, /pauseLocationUpdatesAutomatically: false/);
  assert.match(driver, /showBackgroundLocationIndicator: true/);
  assert.match(driver, /allowBackgroundLocationUpdates: true/);
  assert.match(driver, /Geolocator\.getPositionStream/);
});

test("server policy publishes explicit iOS tracking boundary", () => {
  assert.match(service, /iosBackgroundTracking: true/);
  assert.match(service, /iosAlwaysLocationPermissionRequired: true/);
  assert.match(service, /iosBackgroundMode: "location"/);
  assert.match(service, /iosTrackingScope: "assigned_active_trip_only"/);
});

test("iOS documentation is explicit about physical acceptance and force-quit behavior", () => {
  assert.match(docs, /physical iPhone/i);
  assert.match(docs, /force-quit/i);
  assert.match(docs, /active trip/i);
  assert.match(docs, /App Store/i);
});
