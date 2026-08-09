-- Stage 11A: production payment foundation.
-- Local migration only until staging migration approval.

CREATE TABLE "payment_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "invoice_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "provider_order_id" text,
  "idempotency_key" text NOT NULL,
  "invoice_amount_paise" bigint NOT NULL,
  "surcharge_paise" bigint DEFAULT 0 NOT NULL,
  "amount_paise" bigint NOT NULL,
  "currency" text DEFAULT 'INR' NOT NULL,
  "status" text DEFAULT 'created' NOT NULL,
  "initiated_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,

  CONSTRAINT "payment_orders_invoice_fk"
    FOREIGN KEY ("tenant_id", "invoice_id")
    REFERENCES "fee_invoices"("tenant_id", "id")
    ON DELETE RESTRICT,

  CONSTRAINT "payment_orders_student_fk"
    FOREIGN KEY ("tenant_id", "student_id")
    REFERENCES "students"("tenant_id", "id")
    ON DELETE RESTRICT,

  CONSTRAINT "payment_orders_tenant_id_id_uq"
    UNIQUE ("tenant_id", "id"),

  CONSTRAINT "payment_orders_provider_ck"
    CHECK ("provider" IN ('razorpay')),

  CONSTRAINT "payment_orders_currency_ck"
    CHECK ("currency" = 'INR'),

  CONSTRAINT "payment_orders_amount_ck"
    CHECK (
      "invoice_amount_paise" > 0
      AND "surcharge_paise" >= 0
      AND "amount_paise" =
        "invoice_amount_paise" + "surcharge_paise"
    ),

  CONSTRAINT "payment_orders_status_ck"
    CHECK (
      "status" IN (
        'created',
        'attempted',
        'paid',
        'failed',
        'cancelled',
        'expired',
        'requires_reconciliation',
        'partially_refunded',
        'refunded'
      )
    ),

  CONSTRAINT "payment_orders_idempotency_ck"
    CHECK (
      char_length("idempotency_key") BETWEEN 8 AND 200
    ),

  CONSTRAINT "payment_orders_tenant_idempotency_uq"
    UNIQUE ("tenant_id", "provider", "idempotency_key")
);

CREATE UNIQUE INDEX "payment_orders_provider_order_uq"
  ON "payment_orders" ("tenant_id", "provider", "provider_order_id")
  WHERE "provider_order_id" IS NOT NULL;

CREATE INDEX "payment_orders_invoice_idx"
  ON "payment_orders" (
    "tenant_id", "invoice_id", "created_at" DESC
  );

CREATE INDEX "payment_orders_status_idx"
  ON "payment_orders" (
    "tenant_id", "status", "created_at" DESC
  );

CREATE TABLE "payment_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "payment_order_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "provider_payment_id" text,
  "amount_paise" bigint NOT NULL,
  "currency" text DEFAULT 'INR' NOT NULL,
  "method" text,
  "status" text DEFAULT 'created' NOT NULL,
  "failure_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,

  CONSTRAINT "payment_attempts_order_fk"
    FOREIGN KEY ("tenant_id", "payment_order_id")
    REFERENCES "payment_orders"("tenant_id", "id")
    ON DELETE CASCADE,

  CONSTRAINT "payment_attempts_tenant_id_id_uq"
    UNIQUE ("tenant_id", "id"),

  CONSTRAINT "payment_attempts_provider_ck"
    CHECK ("provider" IN ('razorpay')),

  CONSTRAINT "payment_attempts_currency_ck"
    CHECK ("currency" = 'INR'),

  CONSTRAINT "payment_attempts_amount_ck"
    CHECK ("amount_paise" > 0),

  CONSTRAINT "payment_attempts_status_ck"
    CHECK (
      "status" IN (
        'created',
        'authorized',
        'captured',
        'failed',
        'partially_refunded',
        'refunded'
      )
    )
);

CREATE UNIQUE INDEX "payment_attempts_provider_payment_uq"
  ON "payment_attempts" (
    "tenant_id", "provider", "provider_payment_id"
  )
  WHERE "provider_payment_id" IS NOT NULL;

CREATE INDEX "payment_attempts_order_idx"
  ON "payment_attempts" (
    "tenant_id", "payment_order_id", "created_at" DESC
  );

CREATE TABLE "payment_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "provider_event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "payload_sha256" text NOT NULL,
  "signature_verified" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'received' NOT NULL,
  "failure_code" text,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone,

  CONSTRAINT "payment_webhook_events_tenant_id_id_uq"
    UNIQUE ("tenant_id", "id"),

  CONSTRAINT "payment_webhook_events_provider_ck"
    CHECK ("provider" IN ('razorpay')),

  CONSTRAINT "payment_webhook_events_status_ck"
    CHECK (
      "status" IN ('received', 'processed', 'ignored', 'failed')
    ),

  CONSTRAINT "payment_webhook_events_hash_ck"
    CHECK ("payload_sha256" ~ '^[0-9a-f]{64}$'),

  CONSTRAINT "payment_webhook_events_provider_event_uq"
    UNIQUE ("tenant_id", "provider", "provider_event_id")
);

CREATE INDEX "payment_webhook_events_status_idx"
  ON "payment_webhook_events" (
    "tenant_id", "status", "received_at" DESC
  );

ALTER TABLE "payment_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_orders" FORCE ROW LEVEL SECURITY;

ALTER TABLE "payment_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_attempts" FORCE ROW LEVEL SECURITY;

ALTER TABLE "payment_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_webhook_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY "payment_orders_isolation"
  ON "payment_orders"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

CREATE POLICY "payment_attempts_isolation"
  ON "payment_attempts"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

CREATE POLICY "payment_webhook_events_isolation"
  ON "payment_webhook_events"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

REVOKE ALL ON "payment_orders" FROM PUBLIC;
REVOKE ALL ON "payment_attempts" FROM PUBLIC;
REVOKE ALL ON "payment_webhook_events" FROM PUBLIC;

-- Stage 11C: Razorpay refund and reconciliation foundation.

CREATE TABLE "payment_refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "payment_order_id" uuid NOT NULL,
  "provider" text DEFAULT 'razorpay' NOT NULL,
  "provider_payment_id" text NOT NULL,
  "provider_refund_id" text,
  "idempotency_key" text NOT NULL,
  "principal_paise" bigint NOT NULL,
  "surcharge_paise" bigint DEFAULT 0 NOT NULL,
  "amount_paise" bigint NOT NULL,
  "currency" text DEFAULT 'INR' NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'requested' NOT NULL,
  "requested_by_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone,

  CONSTRAINT "payment_refunds_order_fk"
    FOREIGN KEY ("tenant_id", "payment_order_id")
    REFERENCES "payment_orders"("tenant_id", "id")
    ON DELETE RESTRICT,

  CONSTRAINT "payment_refunds_tenant_id_id_uq"
    UNIQUE ("tenant_id", "id"),

  CONSTRAINT "payment_refunds_provider_ck"
    CHECK ("provider" = 'razorpay'),

  CONSTRAINT "payment_refunds_currency_ck"
    CHECK ("currency" = 'INR'),

  CONSTRAINT "payment_refunds_amount_ck"
    CHECK (
      "principal_paise" > 0
      AND "surcharge_paise" >= 0
      AND "amount_paise" =
        "principal_paise" + "surcharge_paise"
    ),

  CONSTRAINT "payment_refunds_reason_ck"
    CHECK (char_length("reason") BETWEEN 5 AND 240),

  CONSTRAINT "payment_refunds_status_ck"
    CHECK (
      "status" IN (
        'requested',
        'pending',
        'processed',
        'failed'
      )
    ),

  CONSTRAINT "payment_refunds_idempotency_ck"
    CHECK (
      "idempotency_key" ~ '^[A-Za-z0-9_-]{10,200}$'
    ),

  CONSTRAINT "payment_refunds_tenant_idempotency_uq"
    UNIQUE ("tenant_id", "provider", "idempotency_key")
);

CREATE UNIQUE INDEX "payment_refunds_provider_refund_uq"
  ON "payment_refunds" (
    "tenant_id", "provider", "provider_refund_id"
  )
  WHERE "provider_refund_id" IS NOT NULL;

CREATE INDEX "payment_refunds_order_idx"
  ON "payment_refunds" (
    "tenant_id", "payment_order_id", "created_at" DESC
  );

CREATE INDEX "payment_refunds_status_idx"
  ON "payment_refunds" (
    "tenant_id", "status", "created_at" DESC
  );

ALTER TABLE "payment_refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_refunds" FORCE ROW LEVEL SECURITY;

CREATE POLICY "payment_refunds_isolation"
  ON "payment_refunds"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

REVOKE ALL ON "payment_refunds" FROM PUBLIC;
