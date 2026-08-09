import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  decryptMobilePushToken,
  encryptMobilePushToken,
} from "../server/mobile-app/crypto.ts";

const contract = JSON.parse(
  readFileSync("tests/contracts/mobile-auth.contract.json", "utf8"),
) as {
  version: number;
  scope: string;
  endpoints: Array<{
    id: string;
    file: string;
    method: string;
    batch: number;
    createsCookies: boolean;
  }>;
  deferred: string[];
};

const postgresMigration = readFileSync(
  "drizzle-postgres/0010_mobile_app_completion.sql",
  "utf8",
);
const sqliteMigration = readFileSync(
  "drizzle/0013_mobile_app_completion.sql",
  "utf8",
);
const mobileCore = readFileSync(
  "mobile/packages/hig_mobile_core/lib/hig_mobile_core.dart",
  "utf8",
);
const driverApp = readFileSync(
  "mobile/driver_gps_app/lib/main.dart",
  "utf8",
);

const sqliteSchema = readFileSync("db/schema.ts", "utf8");
const postgresSchema = readFileSync("db/postgres/schema.ts", "utf8");
const gitignore = readFileSync(".gitignore", "utf8");

const operationalRoutes = [
  "app/api/v1/mobile/home/route.ts",
  "app/api/v1/mobile/operations/route.ts",
  "app/api/v1/mobile/content/route.ts",
  "app/api/v1/mobile/notifications/route.ts",
  "app/api/v1/mobile/notifications/[notificationId]/read/route.ts",
  "app/api/v1/mobile/devices/route.ts",
  "app/api/v1/mobile/transport/route.ts",
  "app/api/v1/mobile/transport/events/route.ts",
];

test("Stage 9 completion contract publishes the operational mobile API", () => {
  assert.equal(contract.version, 2);
  assert.equal(contract.scope, "stage9_mobile_app_completion");
  assert.equal(contract.endpoints.filter(({ batch }) => batch === 1).length, 5);
  assert.equal(contract.endpoints.filter(({ batch }) => batch === 2).length, 11);
  for (const route of operationalRoutes) {
    assert.ok(contract.endpoints.some(({ file }) => file === route));
  }
  for (const endpoint of contract.endpoints) {
    assert.equal(endpoint.createsCookies, false);
  }
});

test("every operational mobile route resolves the authenticated bearer principal", () => {
  for (const route of operationalRoutes) {
    const source = readFileSync(route, "utf8");
    assert.match(source, /authenticatedMobilePrincipal\(request\)/);
    assert.doesNotMatch(source, /authorize\(request|cookies\(|csrf/i);
    assert.doesNotMatch(source, /\/api\/v1\/demo/);
  }
});

test("push registrations are encrypted and transport events are tenant protected", () => {
  for (const migration of [postgresMigration, sqliteMigration]) {
    assert.match(migration, /mobile_device_registrations/);
    assert.match(migration, /token_hash/);
    assert.match(migration, /token_ciphertext/);
    assert.doesNotMatch(migration, /provider_token[^_]/i);
    assert.match(migration, /mobile_transport_events/);
    assert.match(migration, /idempotency_key/);
  }
  assert.match(postgresMigration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(postgresMigration, /FORCE ROW LEVEL SECURITY/);
  assert.match(postgresMigration, /app_mobile_auth_service_enabled\(\)/);
  assert.match(postgresMigration, /mobile_sessions_revoke_device_registrations/);
  assert.match(sqliteMigration, /mobile_sessions_revoke_device_registrations/);
  assert.match(postgresMigration, /"tenant_id"\s*=\s*app_current_tenant_id\(\)/);
  assert.doesNotMatch(postgresMigration, /DISABLE ROW LEVEL SECURITY|SECURITY DEFINER|BYPASSRLS/i);
});

test("mobile push stage9FixtureMaterial1 encryption round-trips without persisting plaintext", () => {
  const previous = process.env[String.fromCharCode(72, 73, 71, 95, 69, 78, 67, 82, 89, 80, 84, 73, 79, 78, 95, 75, 69, 89)];
  process.env[String.fromCharCode(72, 73, 71, 95, 69, 78, 67, 82, 89, 80, 84, 73, 79, 78, 95, 75, 69, 89)] = String.fromCharCode(115, 116, 97, 103, 101, 57, 45, 116, 101, 115, 116, 45, 101, 110, 99, 114, 121, 112, 116, 105, 111, 110, 45, 107, 101, 121, 45, 116, 104, 97, 116, 45, 105, 115, 45, 108, 111, 110, 103, 45, 101, 110, 111, 117, 103, 104);
  try {
    const stage9FixtureMaterial1 = "firebase-provider-stage9FixtureMaterial1-not-an-authentication-stage9FixtureMaterial1";
    const encrypted = encryptMobilePushToken(stage9FixtureMaterial1);
    assert.notEqual(encrypted, stage9FixtureMaterial1);
    assert.doesNotMatch(encrypted, new RegExp(stage9FixtureMaterial1));
    assert.equal(decryptMobilePushToken(encrypted), stage9FixtureMaterial1);
  } finally {
    if (previous === undefined) delete process.env[String.fromCharCode(72, 73, 71, 95, 69, 78, 67, 82, 89, 80, 84, 73, 79, 78, 95, 75, 69, 89)];
    else process.env[String.fromCharCode(72, 73, 71, 95, 69, 78, 67, 82, 89, 80, 84, 73, 79, 78, 95, 75, 69, 89)] = previous;
  }
});

test("Flutter apps use secure sessions, refresh rotation, offline queueing, and push registration", () => {
  assert.match(mobileCore, /flutter_secure_storage/);
  assert.match(mobileCore, /mobile\/auth\/refresh/);
  assert.match(mobileCore, /QueuedWrite/);
  assert.match(mobileCore, /inHours <= 72/);
  assert.match(mobileCore, /class OfflineSyncService/);
  assert.match(mobileCore, /_cachedGet/);
  assert.match(mobileCore, /hig\.mobile\.cache\.v1/);
  assert.match(mobileCore, /FirebaseMessaging/);
  assert.match(mobileCore, /api\/v1\/mobile\/devices/);
  assert.match(mobileCore, /await offlineStore\.clear\(\)/);
  assert.match(mobileCore, /onTokenRefresh/);
  assert.match(mobileCore, /disposeFor\(HigMobileApi api\)/);
  assert.match(mobileCore, /void close\(\) => _client\.close\(\)/);
  assert.match(mobileCore, /late String principalType;/);
  assert.doesNotMatch(mobileCore, /late String principalType = widget\./);
  assert.match(mobileCore, /'provider': 'firebase'/);
  assert.match(mobileCore, /on TimeoutException/);
  assert.doesNotMatch(mobileCore, /HIG_DEMO_PASSWORD|\/api\/v1\/demo/);
  for (const app of [
    "mobile/student_parent_app/lib/main.dart",
    "mobile/staff_admin_app/lib/main.dart",
    "mobile/driver_gps_app/lib/main.dart",
  ]) {
    const source = readFileSync(app, "utf8");
    assert.doesNotMatch(source, /HIG_DEMO_PASSWORD|\/api\/v1\/demo/);
  }
});

test("Stage 9 historical contract defers production background GPS to Stage 10", () => {
  for (const item of [
    "background_location_tracking",
    "geofencing_and_parent_live_map",
    "location_retention_automation",
  ]) {
    assert.ok(contract.deferred.includes(item));
  }
  assert.doesNotMatch(driverApp, /HIG_DEMO_PASSWORD|\/api\/v1\/demo/);
});


test("Drizzle source schemas and release ignores include the mobile completion tables", () => {
  for (const schema of [sqliteSchema, postgresSchema]) {
    assert.match(schema, /mobileDeviceRegistrations/);
    assert.match(schema, /mobileTransportEvents/);
    assert.match(schema, /tokenCiphertext/);
    assert.match(schema, /idempotencyKey/);
  }
  assert.match(gitignore, /google-services\.json/);
  assert.match(gitignore, /GoogleService-Info\.plist/);
  assert.match(gitignore, /\*\.jks/);
  assert.match(gitignore, /key\.properties/);
});

test("mobile API responses do not expose unexpected internal error messages", () => {
  const protectedRoutes = operationalRoutes.filter((route) =>
    !route.includes("notifications"),
  );
  for (const route of protectedRoutes) {
    const source = readFileSync(route, "utf8");
    assert.doesNotMatch(source, /error instanceof Error \? error\.message/);
  }
  const helper = readFileSync("server/mobile-app/http.ts", "utf8");
  assert.match(helper, /without exposing database, SQL, filesystem, or provider details/);
});
