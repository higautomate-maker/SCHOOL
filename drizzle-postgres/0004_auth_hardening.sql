CREATE TYPE "public"."membership_status" AS ENUM('invited','active','suspended','revoked');
ALTER TABLE "memberships" ADD COLUMN "status" "membership_status" DEFAULT 'active' NOT NULL;
ALTER TABLE "memberships" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TABLE "auth_credentials" ("user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id"),"password_hash" text NOT NULL,"credential_version" bigint DEFAULT 1 NOT NULL,"must_change_password" boolean DEFAULT false NOT NULL,"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,"disabled_at" timestamp with time zone,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE "auth_sessions" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"token_hash" text NOT NULL,"user_id" uuid NOT NULL REFERENCES "users"("id"),"active_tenant_id" uuid REFERENCES "tenants"("id"),"credential_version" bigint NOT NULL,"csrf_hash" text NOT NULL,"issued_at" timestamp with time zone DEFAULT now() NOT NULL,"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,"idle_expires_at" timestamp with time zone NOT NULL,"absolute_expires_at" timestamp with time zone NOT NULL,"revoked_at" timestamp with time zone,"revoke_reason" text,"ip_hash" text,"user_agent_hash" text);
CREATE UNIQUE INDEX "auth_sessions_token_hash_uq" ON "auth_sessions" ("token_hash");
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" ("user_id");
CREATE INDEX "auth_sessions_expiry_idx" ON "auth_sessions" ("idle_expires_at","absolute_expires_at");
CREATE TABLE "password_reset_tokens" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"user_id" uuid NOT NULL REFERENCES "users"("id"),"token_hash" text NOT NULL,"expires_at" timestamp with time zone NOT NULL,"consumed_at" timestamp with time zone,"requested_at" timestamp with time zone DEFAULT now() NOT NULL,"ip_hash" text);
CREATE UNIQUE INDEX "password_reset_token_hash_uq" ON "password_reset_tokens" ("token_hash");
CREATE INDEX "password_reset_expiry_idx" ON "password_reset_tokens" ("expires_at");
CREATE TABLE "platform_role_assignments" ("user_id" uuid NOT NULL REFERENCES "users"("id"),"role_key" text NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,CONSTRAINT "platform_role_assignments_user_id_role_key_pk" PRIMARY KEY("user_id","role_key"));
CREATE INDEX "school_invitations_token_hash_idx" ON "school_invitations" ("token_hash");
CREATE OR REPLACE FUNCTION app_auth_service_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.auth_service', true), ''), 'false')::boolean
$$;
ALTER TABLE "auth_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth_credentials" FORCE ROW LEVEL SECURITY;
CREATE POLICY "auth_credentials_service" ON "auth_credentials"
  USING (app_auth_service_enabled()) WITH CHECK (app_auth_service_enabled());
ALTER TABLE "auth_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "auth_sessions_service" ON "auth_sessions"
  USING (app_auth_service_enabled()) WITH CHECK (app_auth_service_enabled());
ALTER TABLE "password_reset_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "password_reset_tokens" FORCE ROW LEVEL SECURITY;
CREATE POLICY "password_reset_tokens_service" ON "password_reset_tokens"
  USING (app_auth_service_enabled()) WITH CHECK (app_auth_service_enabled());
ALTER TABLE "platform_role_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_role_assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "platform_role_assignments_service" ON "platform_role_assignments"
  USING (app_auth_service_enabled()) WITH CHECK (app_auth_service_enabled());
CREATE POLICY "memberships_auth_service_read" ON "memberships"
  FOR SELECT USING (app_auth_service_enabled());
CREATE POLICY "memberships_auth_service_update" ON "memberships"
  FOR UPDATE USING (app_auth_service_enabled()) WITH CHECK (app_auth_service_enabled());
CREATE POLICY "school_invitations_auth_service_read" ON "school_invitations"
  FOR SELECT USING (app_auth_service_enabled());
CREATE POLICY "school_invitations_auth_service_update" ON "school_invitations"
  FOR UPDATE USING (app_auth_service_enabled()) WITH CHECK (app_auth_service_enabled());
CREATE POLICY "roles_platform_create" ON "roles"
  FOR INSERT WITH CHECK (app_platform_create_enabled());
CREATE POLICY "role_permissions_platform_create" ON "role_permissions"
  FOR INSERT WITH CHECK (app_platform_create_enabled());
REVOKE ALL ON "auth_credentials", "auth_sessions", "password_reset_tokens", "platform_role_assignments" FROM PUBLIC;
