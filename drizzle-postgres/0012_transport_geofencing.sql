-- Stage 10: active-trip GPS-derived stop geofencing.
-- This migration is additive and is not applied by this local validation script.

ALTER TABLE "mobile_transport_events"
  ADD COLUMN "stop_id" uuid;

ALTER TABLE "mobile_transport_events"
  ADD CONSTRAINT "mobile_transport_events_stop_fk"
  FOREIGN KEY ("tenant_id", "stop_id")
  REFERENCES "transport_route_stops"("tenant_id", "id")
  ON DELETE RESTRICT;

ALTER TABLE "mobile_transport_events"
  DROP CONSTRAINT "mobile_transport_events_type_ck";

ALTER TABLE "mobile_transport_events"
  ADD CONSTRAINT "mobile_transport_events_type_ck"
  CHECK ("event_type" IN (
    'trip_started', 'trip_paused', 'trip_completed', 'location',
    'student_boarded', 'student_dropped', 'sos',
    'stop_arrived', 'stop_departed', 'stop_approaching'
  ));

ALTER TABLE "mobile_transport_events"
  ADD CONSTRAINT "mobile_transport_events_geofence_stop_ck"
  CHECK (
    "event_type" NOT IN ('stop_arrived', 'stop_departed', 'stop_approaching')
    OR ("trip_id" IS NOT NULL AND "stop_id" IS NOT NULL)
  );

CREATE UNIQUE INDEX "mobile_transport_events_stop_transition_uq"
  ON "mobile_transport_events" (
    "tenant_id", "trip_id", "stop_id", "event_type"
  )
  WHERE "event_type" IN ('stop_arrived', 'stop_departed', 'stop_approaching');

CREATE INDEX "mobile_transport_events_stop_idx"
  ON "mobile_transport_events" (
    "tenant_id", "trip_id", "stop_id", "captured_at" DESC
  )
  WHERE "stop_id" IS NOT NULL;
