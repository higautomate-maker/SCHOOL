-- Stage 9 Batch 1: global opaque-token locator for tenant discovery.
--
-- This table is authentication infrastructure only. It stores token hashes and
-- the minimum identifiers needed to establish exact tenant context before the
-- authoritative mobile session is revalidated under tenant RLS.

CREATE TABLE "mobile_token_locators" (
  "token_hash" text PRIMARY KEY NOT NULL,
  "token_kind" text NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "session_id" uuid NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "refresh_family_id" uuid NOT NULL,
  "rotation" bigint NOT NULL,
  "state" text DEFAULT 'active' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "revoke_reason" text,

  CONSTRAINT "mobile_token_locators_session_fk"
    FOREIGN KEY ("tenant_id", "session_id")
    REFERENCES "mobile_sessions"("tenant_id", "id")
    ON DELETE CASCADE,

  CONSTRAINT "mobile_token_locators_kind_ck"
    CHECK ("token_kind" IN ('access', 'refresh')),

  CONSTRAINT "mobile_token_locators_state_ck"
    CHECK ("state" IN ('active', 'used', 'revoked', 'expired')),

  CONSTRAINT "mobile_token_locators_rotation_ck"
    CHECK ("rotation" >= 0),

  CONSTRAINT "mobile_token_locators_state_timestamp_ck"
    CHECK (
      ("state" = 'used' AND "token_kind" = 'refresh' AND "used_at" IS NOT NULL)
      OR ("state" = 'revoked' AND "revoked_at" IS NOT NULL)
      OR "state" IN ('active', 'expired')
    )
);

CREATE INDEX "mobile_token_locators_session_idx"
  ON "mobile_token_locators" ("session_id", "state");

CREATE INDEX "mobile_token_locators_user_idx"
  ON "mobile_token_locators" ("user_id", "state");

CREATE INDEX "mobile_token_locators_family_idx"
  ON "mobile_token_locators" ("refresh_family_id", "state");

CREATE INDEX "mobile_token_locators_expiry_idx"
  ON "mobile_token_locators" ("expires_at", "state");

ALTER TABLE "mobile_token_locators" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mobile_token_locators" FORCE ROW LEVEL SECURITY;

CREATE POLICY "mobile_token_locators_mobile_auth_service"
  ON "mobile_token_locators"
  FOR ALL
  USING (app_mobile_auth_service_enabled())
  WITH CHECK (app_mobile_auth_service_enabled());

REVOKE ALL ON "mobile_token_locators" FROM PUBLIC;

-- Keep locator lifecycle in the same statement/transaction as the authoritative
-- mobile session mutation. Runtime code must still lock and revalidate the
-- tenant-scoped session after using a locator.
CREATE OR REPLACE FUNCTION maintain_mobile_token_locators()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "mobile_token_locators" (
      "token_hash", "token_kind", "tenant_id", "session_id", "user_id",
      "refresh_family_id", "rotation", "state", "expires_at",
      "created_at", "updated_at"
    ) VALUES
      (
        NEW."access_token_hash", 'access', NEW."tenant_id", NEW."id",
        NEW."user_id", NEW."refresh_family_id", NEW."refresh_rotation",
        'active', NEW."access_expires_at", NEW."issued_at", NEW."issued_at"
      ),
      (
        NEW."refresh_token_hash", 'refresh', NEW."tenant_id", NEW."id",
        NEW."user_id", NEW."refresh_family_id", NEW."refresh_rotation",
        'active', NEW."refresh_expires_at", NEW."issued_at", NEW."issued_at"
      );

    INSERT INTO "audit_events" (
      "tenant_id", "actor_id", "action", "resource_type", "resource_id",
      "reason", "ip_hash", "metadata"
    ) VALUES (
      NEW."tenant_id", NEW."user_id", 'mobile.auth.login.success',
      'authentication', NEW."id"::text, 'success', NEW."ip_hash",
      jsonb_build_object(
        'principalType', NEW."principal_type"::text,
        'deviceIdHash', NEW."device_id_hash",
        'devicePlatform', NEW."device_platform",
        'appVersion', NEW."app_version",
        'userAgentHash', NEW."user_agent_hash"
      )
    );
    RETURN NEW;
  END IF;

  IF (OLD."access_token_hash" <> NEW."access_token_hash")
       <> (OLD."refresh_token_hash" <> NEW."refresh_token_hash") THEN
    RAISE EXCEPTION
      'Mobile access and refresh tokens must rotate together';
  END IF;

  IF OLD."refresh_token_hash" = NEW."refresh_token_hash"
     AND (
       OLD."refresh_rotation" <> NEW."refresh_rotation"
       OR OLD."refresh_family_id" <> NEW."refresh_family_id"
     ) THEN
    RAISE EXCEPTION
      'Mobile refresh metadata cannot change without token rotation';
  END IF;

  IF OLD."refresh_token_hash" <> NEW."refresh_token_hash" THEN
    IF NEW."refresh_rotation" <> OLD."refresh_rotation" + 1
       OR NEW."refresh_family_id" <> OLD."refresh_family_id" THEN
      RAISE EXCEPTION 'Invalid mobile refresh-token rotation';
    END IF;

    UPDATE "mobile_token_locators"
       SET "state" = 'revoked',
           "revoked_at" = COALESCE("revoked_at", NEW."last_seen_at"),
           "revoke_reason" = COALESCE("revoke_reason", 'rotated'),
           "updated_at" = NEW."last_seen_at"
     WHERE "token_hash" = OLD."access_token_hash"
       AND "token_kind" = 'access'
       AND "state" = 'active';

    UPDATE "mobile_token_locators"
       SET "state" = 'used',
           "used_at" = COALESCE("used_at", NEW."last_seen_at"),
           "updated_at" = NEW."last_seen_at"
     WHERE "token_hash" = OLD."refresh_token_hash"
       AND "token_kind" = 'refresh'
       AND "state" = 'active';

    INSERT INTO "mobile_refresh_token_uses" (
      "tenant_id", "session_id", "refresh_family_id", "token_hash",
      "rotation", "used_at", "device_id_hash", "ip_hash"
    ) VALUES (
      OLD."tenant_id", OLD."id", OLD."refresh_family_id",
      OLD."refresh_token_hash", OLD."refresh_rotation", NEW."last_seen_at",
      NEW."device_id_hash", NEW."ip_hash"
    );

    INSERT INTO "mobile_token_locators" (
      "token_hash", "token_kind", "tenant_id", "session_id", "user_id",
      "refresh_family_id", "rotation", "state", "expires_at",
      "created_at", "updated_at"
    ) VALUES
      (
        NEW."access_token_hash", 'access', NEW."tenant_id", NEW."id",
        NEW."user_id", NEW."refresh_family_id", NEW."refresh_rotation",
        'active', NEW."access_expires_at", NEW."last_seen_at", NEW."last_seen_at"
      ),
      (
        NEW."refresh_token_hash", 'refresh', NEW."tenant_id", NEW."id",
        NEW."user_id", NEW."refresh_family_id", NEW."refresh_rotation",
        'active', NEW."refresh_expires_at", NEW."last_seen_at", NEW."last_seen_at"
      );

    INSERT INTO "audit_events" (
      "tenant_id", "actor_id", "action", "resource_type", "resource_id",
      "reason", "ip_hash", "metadata"
    ) VALUES (
      NEW."tenant_id", NEW."user_id", 'mobile.auth.refresh.success',
      'authentication', NEW."id"::text, 'success', NEW."ip_hash",
      jsonb_build_object(
        'principalType', NEW."principal_type"::text,
        'rotation', NEW."refresh_rotation",
        'deviceIdHash', NEW."device_id_hash",
        'devicePlatform', NEW."device_platform",
        'appVersion', NEW."app_version",
        'userAgentHash', NEW."user_agent_hash"
      )
    );
  END IF;

  IF OLD."revoked_at" IS NULL AND NEW."revoked_at" IS NOT NULL THEN
    UPDATE "mobile_token_locators"
       SET "state" = 'revoked',
           "revoked_at" = COALESCE("revoked_at", NEW."revoked_at"),
           "revoke_reason" = COALESCE("revoke_reason", NEW."revoke_reason", 'revoked'),
           "updated_at" = NEW."revoked_at"
     WHERE "session_id" = NEW."id"
       AND "state" = 'active';

    INSERT INTO "audit_events" (
      "tenant_id", "actor_id", "action", "resource_type", "resource_id",
      "reason", "ip_hash", "metadata"
    ) VALUES (
      NEW."tenant_id", NEW."user_id",
      CASE
        WHEN NEW."revoke_reason" = 'logout' THEN 'mobile.auth.logout'
        ELSE 'mobile.auth.session.revoked'
      END,
      'authentication', NEW."id"::text, 'success', NEW."ip_hash",
      jsonb_build_object(
        'principalType', NEW."principal_type"::text,
        'revokeReason', COALESCE(NEW."revoke_reason", 'revoked'),
        'deviceIdHash', NEW."device_id_hash",
        'devicePlatform', NEW."device_platform",
        'appVersion', NEW."app_version",
        'userAgentHash', NEW."user_agent_hash"
      )
    );
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "mobile_sessions_maintain_token_locators"
AFTER INSERT OR UPDATE OF
  "access_token_hash",
  "refresh_token_hash",
  "refresh_rotation",
  "refresh_family_id",
  "revoked_at",
  "revoke_reason"
ON "mobile_sessions"
FOR EACH ROW
EXECUTE FUNCTION maintain_mobile_token_locators();
