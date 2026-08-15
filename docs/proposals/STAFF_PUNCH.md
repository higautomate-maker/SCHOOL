# Proposal: Staff Self-Attendance "Punch" (geofenced) — NOT auto-applied

Status: **PROPOSED**. Per the repository rule ("do not create destructive
migrations; if a schema change is truly needed, propose it separately with a
rollback plan; do not apply it automatically"), this feature is delivered as a
reviewed proposal. The **security-critical logic is already implemented and
tested** (`server/attendance/staff-punch-safeguards.ts` +
`tests/emergent-staff-punch-safeguards.test.ts`, 7 tests passing). The schema
migration and endpoint below are ready to apply on your go-ahead.

## Why a schema change is needed
Existing tables cover student attendance and transport GPS, but there is no
store for **staff self-attendance punches** with a captured location + device
time. This requires ONE new additive table (non-destructive).

## Safeguards (implemented, pure, tested)
`evaluateStaffPunch()` enforces, using server-trusted inputs:
1. **Ordering** — cannot punch the same state twice; cannot punch out before in.
2. **Device-clock integrity** — rejects when the untrusted device clock differs
   from the authoritative server clock by more than `MAX_CLOCK_SKEW_SECONDS` (120s).
3. **Geofence** — Haversine distance must be within the campus
   `radiusMeters`; otherwise rejected.
All rejection reasons are safe, non-technical strings and never echo coordinates.

## Proposed migration (additive, reversible)

### SQLite — `drizzle/0014_staff_attendance_punch.sql`
```sql
CREATE TABLE IF NOT EXISTS staff_attendance_punches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  staff_user_id TEXT NOT NULL,
  punch_type TEXT NOT NULL CHECK (punch_type IN ('in','out')),
  recorded_at TEXT NOT NULL,          -- server time (ISO)
  device_time TEXT,                   -- untrusted device time (ISO)
  clock_skew_seconds INTEGER,
  latitude REAL,
  longitude REAL,
  distance_meters INTEGER,
  within_geofence INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'mobile',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_staff_punches_tenant_staff_time
  ON staff_attendance_punches (tenant_id, staff_user_id, recorded_at);
```

### PostgreSQL — `drizzle-postgres/0015_staff_attendance_punch.sql`
```sql
CREATE TABLE IF NOT EXISTS staff_attendance_punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_user_id UUID NOT NULL,
  punch_type TEXT NOT NULL CHECK (punch_type IN ('in','out')),
  recorded_at TIMESTAMPTZ NOT NULL,
  device_time TIMESTAMPTZ,
  clock_skew_seconds INTEGER,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  distance_meters INTEGER,
  within_geofence BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'mobile',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_punches_tenant_staff_time
  ON staff_attendance_punches (tenant_id, staff_user_id, recorded_at);

-- Tenant isolation (match existing RLS convention in 0001_tenant_rls.sql):
ALTER TABLE staff_attendance_punches ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_punches_tenant_isolation ON staff_attendance_punches
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
```
Add `"0015_staff_attendance_punch.sql"` to `POSTGRES_MIGRATION_NAMES` in
`server/runtime/postgres-migrations.ts` (the unit gate requires manifest sync).

### Rollback
```sql
-- SQLite & PostgreSQL
DROP TABLE IF EXISTS staff_attendance_punches;
-- PostgreSQL only: policy drops with the table.
```
Remove the manifest entry. No other table is touched, so rollback is clean and
non-destructive to existing data.

## Proposed endpoint contract (backward-compatible extension)
`POST /api/v1/mobile/attendance/punch` (staff/`school` principal only)
```jsonc
// request
{ "type": "in" | "out", "latitude": 12.97, "longitude": 77.59, "deviceTime": "<ISO>" }
// success 200
{ "punch": { "type": "in", "recordedAt": "<ISO>", "withinGeofence": true } }
// rejected 422  (safe reason, no internals)
{ "error": "You must be on the school premises to record attendance." }
```
- Auth: `authenticatedMobilePrincipal` + require `principalType === 'school'` and
  the `attendance` module entitlement + a `staff.attendance.punch` permission
  (add to the role catalogue — a **permission addition gated by Company + role**,
  keeping fail-closed).
- Server loads the campus geofence, computes `serverTimeMs = Date.now()`, calls
  `evaluateStaffPunch(...)`, and only inserts on `accepted === true`.
- Idempotency: reuse the existing `idempotency-key` header pattern.
- Writes an `audit_events` row (`staff.attendance.punch`).

## Tests to add on apply
- Repository slice (sqlite + postgres) insert/read.
- Endpoint: on-premises accept; off-premises reject; skewed-clock reject;
  duplicate-state reject; unauthorized principal denied (401/403).
(The pure safeguard tests already exist and pass.)

## Why not auto-applied here
Applying the SQLite migration would auto-run at runtime (file-based loader), and
editing the Postgres manifest changes production migration behaviour. That is
exactly the "apply automatically" the repo rule forbids, so it awaits your
go-ahead. Everything above is copy-paste ready.
