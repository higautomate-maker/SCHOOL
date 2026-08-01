CREATE OR REPLACE FUNCTION app_queue_service_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.queue_service', true), ''), 'false')::boolean
$$;

ALTER TABLE "outbox_events" ADD COLUMN "processing_started_at" timestamp with time zone;
ALTER TABLE "outbox_events" ADD COLUMN "lease_expires_at" timestamp with time zone;
ALTER TABLE "outbox_events" ADD COLUMN "worker_id" text;
CREATE INDEX "outbox_lease_recovery_idx" ON "outbox_events" ("status", "lease_expires_at");

CREATE TABLE "notification_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "outbox_event_id" uuid NOT NULL REFERENCES "outbox_events"("id"),
  "recipient_type" text NOT NULL,
  "recipient_id" uuid,
  "channel" text NOT NULL,
  "destination_hash" text,
  "template_key" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" bigint DEFAULT 0 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "delivered_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "last_error" text,
  "provider_message_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notification_deliveries_recipient_type_ck" CHECK ("recipient_type" IN ('user','staff','student','parent','driver','audience')),
  CONSTRAINT "notification_deliveries_channel_ck" CHECK ("channel" IN ('in_app','email','sms','push','capture')),
  CONSTRAINT "notification_deliveries_status_ck" CHECK ("status" IN ('pending','processing','delivered','failed','skipped','dead_letter')),
  CONSTRAINT "notification_deliveries_attempts_ck" CHECK ("attempts" >= 0)
);
CREATE UNIQUE INDEX "notification_deliveries_idempotency_uq"
  ON "notification_deliveries" (
    "tenant_id",
    "outbox_event_id",
    "recipient_type",
    COALESCE("recipient_id", '00000000-0000-0000-0000-000000000000'::uuid),
    "channel",
    "template_key"
  );
CREATE INDEX "notification_deliveries_dispatch_idx"
  ON "notification_deliveries" ("status", "available_at");
CREATE INDEX "notification_deliveries_tenant_recipient_idx"
  ON "notification_deliveries" ("tenant_id", "recipient_type", "recipient_id", "created_at" DESC);
CREATE INDEX "notification_deliveries_outbox_idx"
  ON "notification_deliveries" ("tenant_id", "outbox_event_id");

CREATE TABLE "notification_delivery_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "delivery_id" uuid NOT NULL REFERENCES "notification_deliveries"("id"),
  "attempt_number" bigint NOT NULL,
  "channel" text NOT NULL,
  "provider" text NOT NULL,
  "status" text NOT NULL,
  "error_code" text,
  "error_message" text,
  "provider_message_id" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT "notification_delivery_attempts_number_ck" CHECK ("attempt_number" > 0),
  CONSTRAINT "notification_delivery_attempts_channel_ck" CHECK ("channel" IN ('in_app','email','sms','push','capture')),
  CONSTRAINT "notification_delivery_attempts_status_ck" CHECK ("status" IN ('started','delivered','failed','skipped')),
  CONSTRAINT "notification_delivery_attempts_tenant_delivery_attempt_uq" UNIQUE ("tenant_id", "delivery_id", "attempt_number")
);
CREATE INDEX "notification_delivery_attempts_delivery_idx"
  ON "notification_delivery_attempts" ("tenant_id", "delivery_id", "attempt_number" DESC);
CREATE INDEX "notification_delivery_attempts_status_idx"
  ON "notification_delivery_attempts" ("status", "started_at");

CREATE TABLE "notification_dead_letters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "outbox_event_id" uuid REFERENCES "outbox_events"("id"),
  "delivery_id" uuid REFERENCES "notification_deliveries"("id"),
  "topic" text NOT NULL,
  "channel" text,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "attempts" bigint DEFAULT 0 NOT NULL,
  "failure_reason" text NOT NULL,
  "failed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "replayed_at" timestamp with time zone,
  "replayed_by" uuid,
  CONSTRAINT "notification_dead_letters_attempts_ck" CHECK ("attempts" >= 0),
  CONSTRAINT "notification_dead_letters_channel_ck" CHECK ("channel" IS NULL OR "channel" IN ('in_app','email','sms','push','capture')),
  CONSTRAINT "notification_dead_letters_reference_ck" CHECK ("outbox_event_id" IS NOT NULL OR "delivery_id" IS NOT NULL)
);
CREATE UNIQUE INDEX "notification_dead_letters_delivery_uq"
  ON "notification_dead_letters" ("tenant_id", "delivery_id")
  WHERE "delivery_id" IS NOT NULL;
CREATE UNIQUE INDEX "notification_dead_letters_outbox_uq"
  ON "notification_dead_letters" ("tenant_id", "outbox_event_id", "topic")
  WHERE "delivery_id" IS NULL AND "outbox_event_id" IS NOT NULL;
CREATE INDEX "notification_dead_letters_unreplayed_idx"
  ON "notification_dead_letters" ("failed_at")
  WHERE "replayed_at" IS NULL;

ALTER TABLE "notification_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_deliveries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notification_deliveries_isolation" ON "notification_deliveries"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());
CREATE POLICY "notification_deliveries_queue_service" ON "notification_deliveries"
  USING (app_queue_service_enabled())
  WITH CHECK (app_queue_service_enabled());

ALTER TABLE "notification_delivery_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_delivery_attempts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notification_delivery_attempts_isolation" ON "notification_delivery_attempts"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());
CREATE POLICY "notification_delivery_attempts_queue_service" ON "notification_delivery_attempts"
  USING (app_queue_service_enabled())
  WITH CHECK (app_queue_service_enabled());

ALTER TABLE "notification_dead_letters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_dead_letters" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notification_dead_letters_isolation" ON "notification_dead_letters"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());
CREATE POLICY "notification_dead_letters_queue_service" ON "notification_dead_letters"
  USING (app_queue_service_enabled())
  WITH CHECK (app_queue_service_enabled());

CREATE POLICY "outbox_events_queue_service_read" ON "outbox_events"
  FOR SELECT USING (app_queue_service_enabled());
CREATE POLICY "outbox_events_queue_service_update" ON "outbox_events"
  FOR UPDATE USING (app_queue_service_enabled())
  WITH CHECK (app_queue_service_enabled());

REVOKE ALL ON "notification_deliveries", "notification_delivery_attempts", "notification_dead_letters" FROM PUBLIC;
