import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  LOCATION_RETENTION_BATCH_SIZE,
  LOCATION_RETENTION_MAX_BATCHES_PER_SWEEP,
  LOCATION_RETENTION_SWEEP_INTERVAL_MS,
  mobileTransportLocationRetentionDays,
} from "../server/mobile-app/retention.ts";

const postgres = readFileSync("server/mobile-app/postgres-repository.ts", "utf8");
const service = readFileSync("server/mobile-app/service.ts", "utf8");
const docs = readFileSync("docs/STAGE10-LOCATION-RETENTION.md", "utf8");

test("location retention defaults to thirty days and remains bounded", () => {
  assert.equal(mobileTransportLocationRetentionDays(undefined), 30);
  assert.equal(mobileTransportLocationRetentionDays("7"), 7);
  assert.equal(mobileTransportLocationRetentionDays("0"), 1);
  assert.equal(mobileTransportLocationRetentionDays("999"), 90);
  assert.equal(mobileTransportLocationRetentionDays("invalid"), 30);
});

test("retention sweep cadence and batch work are explicitly bounded", () => {
  assert.equal(LOCATION_RETENTION_SWEEP_INTERVAL_MS, 6 * 60 * 60 * 1000);
  assert.equal(LOCATION_RETENTION_BATCH_SIZE, 5_000);
  assert.equal(LOCATION_RETENTION_MAX_BATCHES_PER_SWEEP, 8);
});

test("PostgreSQL purge is tenant scoped and deletes only raw location events", () => {
  assert.match(postgres, /async function purgeExpiredLocationEvents/);
  assert.match(postgres, /if \(eventType !== "location"\) return 0/);
  assert.match(postgres, /event\.tenant_id = \$1::uuid/);
  assert.match(postgres, /event\.event_type = 'location'/);
  assert.match(postgres, /target\.tenant_id = \$1::uuid/);
  assert.match(postgres, /target\.event_type = 'location'/);
  assert.match(postgres, /FOR UPDATE SKIP LOCKED/);
});

test("purge uses a retention cutoff and bounded batch deletion", () => {
  assert.match(postgres, /make_interval\(days => \$2::int\)/);
  assert.match(postgres, /LIMIT \$3::int/);
  assert.match(postgres, /LOCATION_RETENTION_MAX_BATCHES_PER_SWEEP/);
  assert.match(postgres, /LOCATION_RETENTION_SWEEP_INTERVAL_MS/);
});

test("retention runs automatically only from real GPS location traffic", () => {
  assert.match(
    postgres,
    /await purgeExpiredLocationEvents\(\s*client,\s*principal\.tenantId,\s*input\.eventType,\s*\)/,
  );
  assert.match(postgres, /if \(eventType !== "location"\) return 0/);
});

test("mobile transport policy reports the implemented retention boundary", () => {
  assert.match(service, /retentionAutomation: true/);
  assert.match(service, /retentionMode: "tenant_activity_triggered"/);
  assert.match(service, /locationRetentionDays: mobileTransportLocationRetentionDays\(\)/);
  assert.match(service, /locationEventOnly: true/);
});

test("documentation preserves safety and compliance boundaries", () => {
  assert.match(docs, /raw `location` events only/i);
  assert.match(docs, /SOS, boarding\/drop,\s+trip, stop and geofence events are not deleted/i);
  assert.match(docs, /Stage 12/i);
});
