-- Stage 10: production student boarding/drop journey workflow.
-- Created locally only. Validation does not apply this migration.

ALTER TABLE "mobile_transport_events"
  ADD CONSTRAINT "mobile_transport_events_student_journey_ck"
  CHECK (
    "event_type" NOT IN ('student_boarded', 'student_dropped')
    OR ("trip_id" IS NOT NULL AND "student_id" IS NOT NULL)
  );

CREATE UNIQUE INDEX "mobile_transport_events_student_transition_uq"
  ON "mobile_transport_events" (
    "tenant_id", "trip_id", "student_id", "event_type"
  )
  WHERE "event_type" IN ('student_boarded', 'student_dropped');

CREATE INDEX "mobile_transport_events_student_journey_idx"
  ON "mobile_transport_events" (
    "tenant_id", "trip_id", "student_id", "captured_at" DESC
  )
  WHERE "event_type" IN ('student_boarded', 'student_dropped');
