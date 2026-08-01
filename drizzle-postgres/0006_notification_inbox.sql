CREATE UNIQUE INDEX "notification_deliveries_tenant_id_uq"
  ON "notification_deliveries" ("tenant_id", "id");

CREATE TABLE "notification_reads" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "delivery_id" uuid NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "read_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notification_reads_pk" PRIMARY KEY ("tenant_id", "delivery_id", "user_id"),
  CONSTRAINT "notification_reads_tenant_delivery_fk"
    FOREIGN KEY ("tenant_id", "delivery_id")
    REFERENCES "notification_deliveries"("tenant_id", "id")
    ON DELETE CASCADE
);

CREATE INDEX "notification_reads_user_idx"
  ON "notification_reads" ("tenant_id", "user_id", "read_at" DESC);

ALTER TABLE "notification_reads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_reads" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notification_reads_isolation" ON "notification_reads"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

REVOKE ALL ON "notification_reads" FROM PUBLIC;
