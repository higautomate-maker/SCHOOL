-- Stage 9 mobile application completion: protected push registrations and
-- foreground transport events. Background tracking, geofencing, and retention
-- automation remain Stage 10 concerns.

CREATE TABLE "mobile_device_registrations" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "mobile_identity_id" uuid,
  "session_id" uuid NOT NULL,
  "platform" text NOT NULL,
  "provider" text NOT NULL,
  "token_hash" text NOT NULL,
  "token_ciphertext" text NOT NULL,
  "app_id" text NOT NULL,
  "app_version" text,
  "status" text DEFAULT 'active' NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,

  CONSTRAINT "mobile_device_registrations_session_fk"
    FOREIGN KEY ("tenant_id", "session_id")
    REFERENCES "mobile_sessions"("tenant_id", "id")
    ON DELETE CASCADE,
  CONSTRAINT "mobile_device_registrations_identity_fk"
    FOREIGN KEY ("tenant_id", "mobile_identity_id")
    REFERENCES "mobile_identities"("tenant_id", "id")
    ON DELETE CASCADE,
  CONSTRAINT "mobile_device_registrations_platform_ck"
    CHECK ("platform" IN ('android', 'ios')),
  CONSTRAINT "mobile_device_registrations_provider_ck"
    CHECK ("provider" IN ('firebase', 'apns')),
  CONSTRAINT "mobile_device_registrations_status_ck"
    CHECK ("status" IN ('active', 'revoked')),
  CONSTRAINT "mobile_device_registrations_status_timestamp_ck"
    CHECK (("status" = 'active' AND "revoked_at" IS NULL)
      OR ("status" = 'revoked' AND "revoked_at" IS NOT NULL))
);

-- Device registrations are authorization-adjacent delivery credentials. Any
-- mobile session revocation must disable its registrations in the same
-- transaction, including credential changes and refresh replay revocations.
CREATE OR REPLACE FUNCTION revoke_mobile_devices_for_session()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."revoked_at" IS NULL AND NEW."revoked_at" IS NOT NULL THEN
    UPDATE "mobile_device_registrations"
       SET "status" = 'revoked',
           "revoked_at" = COALESCE("revoked_at", NEW."revoked_at"),
           "updated_at" = NEW."revoked_at"
     WHERE "tenant_id" = NEW."tenant_id"
       AND "session_id" = NEW."id"
       AND "status" = 'active';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "mobile_sessions_revoke_device_registrations"
AFTER UPDATE OF "revoked_at" ON "mobile_sessions"
FOR EACH ROW
EXECUTE FUNCTION revoke_mobile_devices_for_session();

CREATE UNIQUE INDEX "mobile_device_registrations_token_uq"
  ON "mobile_device_registrations" ("tenant_id", "token_hash");
CREATE INDEX "mobile_device_registrations_user_idx"
  ON "mobile_device_registrations" ("tenant_id", "user_id", "status");
CREATE INDEX "mobile_device_registrations_session_idx"
  ON "mobile_device_registrations" ("tenant_id", "session_id", "status");

CREATE TABLE "mobile_transport_events" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "mobile_identity_id" uuid NOT NULL,
  "session_id" uuid NOT NULL,
  "trip_id" uuid,
  "student_id" uuid,
  "event_type" text NOT NULL,
  "latitude" double precision,
  "longitude" double precision,
  "accuracy_meters" double precision,
  "speed_kph" double precision,
  "heading_degrees" double precision,
  "captured_at" timestamp with time zone NOT NULL,
  "idempotency_key" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,

  CONSTRAINT "mobile_transport_events_identity_fk"
    FOREIGN KEY ("tenant_id", "mobile_identity_id")
    REFERENCES "mobile_identities"("tenant_id", "id")
    ON DELETE CASCADE,
  CONSTRAINT "mobile_transport_events_session_fk"
    FOREIGN KEY ("tenant_id", "session_id")
    REFERENCES "mobile_sessions"("tenant_id", "id")
    ON DELETE CASCADE,
  CONSTRAINT "mobile_transport_events_student_fk"
    FOREIGN KEY ("tenant_id", "student_id")
    REFERENCES "students"("tenant_id", "id")
    ON DELETE SET NULL,
  CONSTRAINT "mobile_transport_events_type_ck"
    CHECK ("event_type" IN (
      'trip_started', 'trip_paused', 'trip_completed', 'location',
      'student_boarded', 'student_dropped', 'sos'
    )),
  CONSTRAINT "mobile_transport_events_coordinates_ck"
    CHECK (
      ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90)
      AND ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)
      AND ("accuracy_meters" IS NULL OR "accuracy_meters" BETWEEN 0 AND 10000)
      AND ("speed_kph" IS NULL OR "speed_kph" BETWEEN 0 AND 400)
      AND ("heading_degrees" IS NULL OR "heading_degrees" BETWEEN 0 AND 360)
      AND ("event_type" <> 'location' OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL))
    ),
  CONSTRAINT "mobile_transport_events_boarding_student_ck"
    CHECK ("event_type" NOT IN ('student_boarded', 'student_dropped') OR "student_id" IS NOT NULL)
);

CREATE UNIQUE INDEX "mobile_transport_events_idempotency_uq"
  ON "mobile_transport_events" ("tenant_id", "mobile_identity_id", "idempotency_key");
CREATE INDEX "mobile_transport_events_trip_idx"
  ON "mobile_transport_events" ("tenant_id", "trip_id", "captured_at" DESC);
CREATE INDEX "mobile_transport_events_identity_idx"
  ON "mobile_transport_events" ("tenant_id", "mobile_identity_id", "captured_at" DESC);

ALTER TABLE "mobile_device_registrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mobile_device_registrations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "mobile_transport_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mobile_transport_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY "mobile_device_registrations_mobile_auth_service"
  ON "mobile_device_registrations" FOR ALL
  USING (app_mobile_auth_service_enabled() AND "tenant_id" = app_current_tenant_id())
  WITH CHECK (app_mobile_auth_service_enabled() AND "tenant_id" = app_current_tenant_id());

CREATE POLICY "mobile_transport_events_mobile_auth_service"
  ON "mobile_transport_events" FOR ALL
  USING (app_mobile_auth_service_enabled() AND "tenant_id" = app_current_tenant_id())
  WITH CHECK (app_mobile_auth_service_enabled() AND "tenant_id" = app_current_tenant_id());

REVOKE ALL ON "mobile_device_registrations" FROM PUBLIC;
REVOKE ALL ON "mobile_transport_events" FROM PUBLIC;
