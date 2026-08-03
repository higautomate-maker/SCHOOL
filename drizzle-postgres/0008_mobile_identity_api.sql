-- Stage 9 Batch 1: production mobile identity and API foundation.
--
-- This migration is additive. It does not alter the accepted browser
-- authentication session model and does not provision any mobile accounts.

CREATE TYPE "public"."mobile_principal_type"
  AS ENUM ('school', 'parent', 'student', 'transporter');

CREATE TYPE "public"."mobile_assignment_status"
  AS ENUM ('active', 'suspended', 'revoked');

CREATE TABLE "mobile_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "audience" "app_audience" NOT NULL,
  "status" "membership_status" DEFAULT 'invited' NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,

  CONSTRAINT "mobile_identities_tenant_id_id_uq"
    UNIQUE ("tenant_id", "id"),

  CONSTRAINT "mobile_identities_tenant_user_audience_uq"
    UNIQUE ("tenant_id", "user_id", "audience"),

  CONSTRAINT "mobile_identities_revocation_ck"
    CHECK (
      ("status" = 'revoked' AND "revoked_at" IS NOT NULL)
      OR "status" <> 'revoked'
    )
);

CREATE INDEX "mobile_identities_tenant_audience_status_idx"
  ON "mobile_identities" (
    "tenant_id",
    "audience",
    "status"
  );

CREATE INDEX "mobile_identities_user_status_idx"
  ON "mobile_identities" (
    "user_id",
    "status"
  );

CREATE TABLE "mobile_identity_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "mobile_identity_id" uuid NOT NULL,
  "resource_type" text NOT NULL,
  "resource_id" uuid NOT NULL,
  "status" "mobile_assignment_status" DEFAULT 'active' NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,

  CONSTRAINT "mobile_identity_assignments_identity_fk"
    FOREIGN KEY ("tenant_id", "mobile_identity_id")
    REFERENCES "mobile_identities"("tenant_id", "id")
    ON DELETE CASCADE,

  CONSTRAINT "mobile_identity_assignments_tenant_id_id_uq"
    UNIQUE ("tenant_id", "id"),

  CONSTRAINT "mobile_identity_assignments_resource_uq"
    UNIQUE (
      "tenant_id",
      "mobile_identity_id",
      "resource_type",
      "resource_id"
    ),

  CONSTRAINT "mobile_identity_assignments_resource_type_ck"
    CHECK (
      "resource_type" IN ('student', 'vehicle', 'route', 'trip')
    ),

  CONSTRAINT "mobile_identity_assignments_revocation_ck"
    CHECK (
      ("status" = 'revoked' AND "revoked_at" IS NOT NULL)
      OR "status" <> 'revoked'
    )
);

CREATE INDEX "mobile_identity_assignments_lookup_idx"
  ON "mobile_identity_assignments" (
    "tenant_id",
    "mobile_identity_id",
    "resource_type",
    "status"
  );

CREATE TABLE "mobile_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "mobile_identity_id" uuid,
  "principal_type" "mobile_principal_type" NOT NULL,

  "access_token_hash" text NOT NULL,
  "refresh_token_hash" text NOT NULL,
  "refresh_family_id" uuid NOT NULL,
  "refresh_rotation" bigint DEFAULT 0 NOT NULL,
  "credential_version" bigint NOT NULL,

  "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "access_expires_at" timestamp with time zone NOT NULL,
  "refresh_expires_at" timestamp with time zone NOT NULL,

  "revoked_at" timestamp with time zone,
  "revoke_reason" text,

  "device_id_hash" text,
  "device_platform" text,
  "app_version" text,
  "ip_hash" text,
  "user_agent_hash" text,

  CONSTRAINT "mobile_sessions_identity_fk"
    FOREIGN KEY ("tenant_id", "mobile_identity_id")
    REFERENCES "mobile_identities"("tenant_id", "id"),

  CONSTRAINT "mobile_sessions_tenant_id_id_uq"
    UNIQUE ("tenant_id", "id"),

  CONSTRAINT "mobile_sessions_access_token_hash_uq"
    UNIQUE ("access_token_hash"),

  CONSTRAINT "mobile_sessions_refresh_token_hash_uq"
    UNIQUE ("refresh_token_hash"),

  CONSTRAINT "mobile_sessions_principal_identity_ck"
    CHECK (
      (
        "principal_type" = 'school'
        AND "mobile_identity_id" IS NULL
      )
      OR
      (
        "principal_type" <> 'school'
        AND "mobile_identity_id" IS NOT NULL
      )
    ),

  CONSTRAINT "mobile_sessions_rotation_ck"
    CHECK ("refresh_rotation" >= 0),

  CONSTRAINT "mobile_sessions_expiry_order_ck"
    CHECK (
      "issued_at" < "access_expires_at"
      AND "access_expires_at" <= "refresh_expires_at"
    )
);

CREATE INDEX "mobile_sessions_user_active_idx"
  ON "mobile_sessions" (
    "user_id",
    "tenant_id",
    "revoked_at",
    "refresh_expires_at"
  );

CREATE INDEX "mobile_sessions_family_active_idx"
  ON "mobile_sessions" (
    "refresh_family_id",
    "revoked_at"
  );

CREATE INDEX "mobile_sessions_identity_active_idx"
  ON "mobile_sessions" (
    "tenant_id",
    "mobile_identity_id",
    "revoked_at"
  );

CREATE TABLE "mobile_refresh_token_uses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "session_id" uuid NOT NULL,
  "refresh_family_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "rotation" bigint NOT NULL,
  "used_at" timestamp with time zone DEFAULT now() NOT NULL,
  "replay_detected_at" timestamp with time zone,
  "device_id_hash" text,
  "ip_hash" text,

  CONSTRAINT "mobile_refresh_token_uses_session_fk"
    FOREIGN KEY ("tenant_id", "session_id")
    REFERENCES "mobile_sessions"("tenant_id", "id")
    ON DELETE CASCADE,

  CONSTRAINT "mobile_refresh_token_uses_hash_uq"
    UNIQUE ("token_hash"),

  CONSTRAINT "mobile_refresh_token_uses_rotation_uq"
    UNIQUE ("session_id", "rotation"),

  CONSTRAINT "mobile_refresh_token_uses_rotation_ck"
    CHECK ("rotation" >= 0)
);

CREATE INDEX "mobile_refresh_token_uses_family_idx"
  ON "mobile_refresh_token_uses" (
    "refresh_family_id",
    "used_at" DESC
  );

CREATE INDEX "mobile_refresh_token_uses_session_idx"
  ON "mobile_refresh_token_uses" (
    "tenant_id",
    "session_id",
    "used_at" DESC
  );

-- Mobile-authentication repositories must explicitly enable this service
-- context inside a transaction. Tenant context is required separately.
CREATE OR REPLACE FUNCTION app_mobile_auth_service_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(
      current_setting('app.mobile_auth_service', true),
      ''
    ),
    'false'
  )::boolean
$$;

ALTER TABLE "mobile_identities"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mobile_identities"
  FORCE ROW LEVEL SECURITY;

CREATE POLICY "mobile_identities_mobile_auth_service"
  ON "mobile_identities"
  FOR ALL
  USING (
    app_mobile_auth_service_enabled()
    AND "tenant_id" = app_current_tenant_id()
  )
  WITH CHECK (
    app_mobile_auth_service_enabled()
    AND "tenant_id" = app_current_tenant_id()
  );

ALTER TABLE "mobile_identity_assignments"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mobile_identity_assignments"
  FORCE ROW LEVEL SECURITY;

CREATE POLICY "mobile_identity_assignments_mobile_auth_service"
  ON "mobile_identity_assignments"
  FOR ALL
  USING (
    app_mobile_auth_service_enabled()
    AND "tenant_id" = app_current_tenant_id()
  )
  WITH CHECK (
    app_mobile_auth_service_enabled()
    AND "tenant_id" = app_current_tenant_id()
  );

ALTER TABLE "mobile_sessions"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mobile_sessions"
  FORCE ROW LEVEL SECURITY;

CREATE POLICY "mobile_sessions_mobile_auth_service"
  ON "mobile_sessions"
  FOR ALL
  USING (
    app_mobile_auth_service_enabled()
    AND "tenant_id" = app_current_tenant_id()
  )
  WITH CHECK (
    app_mobile_auth_service_enabled()
    AND "tenant_id" = app_current_tenant_id()
  );

ALTER TABLE "mobile_refresh_token_uses"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mobile_refresh_token_uses"
  FORCE ROW LEVEL SECURITY;

CREATE POLICY "mobile_refresh_token_uses_mobile_auth_service"
  ON "mobile_refresh_token_uses"
  FOR ALL
  USING (
    app_mobile_auth_service_enabled()
    AND "tenant_id" = app_current_tenant_id()
  )
  WITH CHECK (
    app_mobile_auth_service_enabled()
    AND "tenant_id" = app_current_tenant_id()
  );

-- Parent and Student assignments are restricted to a Student record in the
-- same tenant. Vehicle, route, and trip assignment types remain fail-closed
-- until their tenant-scoped operational tables are implemented.
CREATE OR REPLACE FUNCTION validate_mobile_identity_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  identity_audience "app_audience";
BEGIN
  SELECT "audience"
    INTO identity_audience
    FROM "mobile_identities"
   WHERE "tenant_id" = NEW."tenant_id"
     AND "id" = NEW."mobile_identity_id";

  IF identity_audience IS NULL THEN
    RAISE EXCEPTION 'Mobile identity is unavailable';
  END IF;

  IF identity_audience IN ('parent', 'student') THEN
    IF NEW."resource_type" <> 'student' THEN
      RAISE EXCEPTION
        'Parent and Student identities require a Student assignment';
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM "students"
       WHERE "tenant_id" = NEW."tenant_id"
         AND "id" = NEW."resource_id"
    ) THEN
      RAISE EXCEPTION
        'Assigned Student is unavailable in this tenant';
    END IF;
  ELSIF identity_audience = 'transporter' THEN
    IF NEW."resource_type" = 'student' THEN
      IF NOT EXISTS (
        SELECT 1
          FROM "students"
         WHERE "tenant_id" = NEW."tenant_id"
           AND "id" = NEW."resource_id"
      ) THEN
        RAISE EXCEPTION
          'Assigned Student is unavailable in this tenant';
      END IF;
    ELSE
      RAISE EXCEPTION
        'Transport resource assignment is not enabled yet';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "mobile_identity_assignments_validate"
BEFORE INSERT OR UPDATE
ON "mobile_identity_assignments"
FOR EACH ROW
EXECUTE FUNCTION validate_mobile_identity_assignment();

-- Session creation revalidates the selected School membership or mobile
-- relationship. Runtime token resolution must repeat these checks.
CREATE OR REPLACE FUNCTION validate_mobile_session_principal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  identity_audience "app_audience";
BEGIN
  IF NEW."principal_type" = 'school' THEN
    IF NEW."mobile_identity_id" IS NOT NULL THEN
      RAISE EXCEPTION
        'School sessions cannot use a mobile identity';
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM "memberships"
       WHERE "tenant_id" = NEW."tenant_id"
         AND "user_id" = NEW."user_id"
         AND "status" = 'active'
    ) THEN
      RAISE EXCEPTION
        'Active School membership is required';
    END IF;
  ELSE
    SELECT "audience"
      INTO identity_audience
      FROM "mobile_identities"
     WHERE "tenant_id" = NEW."tenant_id"
       AND "id" = NEW."mobile_identity_id"
       AND "user_id" = NEW."user_id"
       AND "status" = 'active';

    IF identity_audience IS NULL THEN
      RAISE EXCEPTION
        'Active mobile relationship is required';
    END IF;

    IF identity_audience::text <> NEW."principal_type"::text THEN
      RAISE EXCEPTION
        'Mobile principal does not match the relationship';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "mobile_sessions_validate_principal"
BEFORE INSERT OR UPDATE OF
  "tenant_id",
  "user_id",
  "mobile_identity_id",
  "principal_type"
ON "mobile_sessions"
FOR EACH ROW
EXECUTE FUNCTION validate_mobile_session_principal();
