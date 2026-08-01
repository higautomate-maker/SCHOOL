CREATE TYPE "public"."app_audience" AS ENUM('parent', 'student', 'transporter');
--> statement-breakpoint
CREATE TABLE "plan_module_policies" (
  "plan_id" uuid NOT NULL REFERENCES "plans"("id"),
  "module_key" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL REFERENCES "users"("id"),
  CONSTRAINT "plan_module_policies_plan_id_module_key_pk" PRIMARY KEY("plan_id", "module_key")
);
--> statement-breakpoint
CREATE INDEX "plan_module_policies_enabled_idx"
  ON "plan_module_policies" ("plan_id", "enabled");
--> statement-breakpoint
CREATE TABLE "plan_app_feature_policies" (
  "plan_id" uuid NOT NULL REFERENCES "plans"("id"),
  "audience" "app_audience" NOT NULL,
  "feature_key" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL REFERENCES "users"("id"),
  CONSTRAINT "plan_app_feature_policies_plan_audience_feature_pk"
    PRIMARY KEY("plan_id", "audience", "feature_key")
);
--> statement-breakpoint
CREATE INDEX "plan_app_feature_policies_enabled_idx"
  ON "plan_app_feature_policies" ("plan_id", "audience", "enabled");
--> statement-breakpoint
CREATE TABLE "tenant_app_feature_policies" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "audience" "app_audience" NOT NULL,
  "feature_key" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "source" "policy_source" NOT NULL,
  "configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL REFERENCES "users"("id"),
  CONSTRAINT "tenant_app_feature_policies_tenant_audience_feature_pk"
    PRIMARY KEY("tenant_id", "audience", "feature_key")
);
--> statement-breakpoint
CREATE INDEX "tenant_app_feature_policies_enabled_idx"
  ON "tenant_app_feature_policies" ("tenant_id", "audience", "enabled");
--> statement-breakpoint
-- Company policy administration is separate from tenant, authentication and queue contexts.
-- The application must set this transaction-local value only after platform authorization.
CREATE OR REPLACE FUNCTION app_platform_policy_management_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.platform_policy_management', true), ''),
    'false'
  )::boolean
$$;
--> statement-breakpoint
-- Authorized app-policy services use this context together with app.current_tenant_id.
-- It never grants write access to a school tenant.
CREATE OR REPLACE FUNCTION app_access_policy_service_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.access_policy_service', true), ''),
    'false'
  )::boolean
$$;
--> statement-breakpoint
ALTER TABLE "plan_module_policies" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plan_module_policies" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "plan_module_policies_platform_manage"
  ON "plan_module_policies"
  FOR ALL
  USING (app_platform_policy_management_enabled())
  WITH CHECK (app_platform_policy_management_enabled());
--> statement-breakpoint
ALTER TABLE "plan_app_feature_policies" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plan_app_feature_policies" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "plan_app_feature_policies_platform_manage"
  ON "plan_app_feature_policies"
  FOR ALL
  USING (app_platform_policy_management_enabled())
  WITH CHECK (app_platform_policy_management_enabled());
--> statement-breakpoint
CREATE POLICY "plan_app_feature_policies_service_read"
  ON "plan_app_feature_policies"
  FOR SELECT
  USING (
    app_access_policy_service_enabled()
    AND EXISTS (
      SELECT 1
      FROM "subscriptions" AS subscription
      WHERE subscription."tenant_id" = app_current_tenant_id()
        AND subscription."plan_id" = "plan_app_feature_policies"."plan_id"
    )
  );
--> statement-breakpoint
ALTER TABLE "tenant_app_feature_policies" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenant_app_feature_policies" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_app_feature_policies_platform_manage"
  ON "tenant_app_feature_policies"
  FOR ALL
  USING (app_platform_policy_management_enabled())
  WITH CHECK (app_platform_policy_management_enabled());
--> statement-breakpoint
CREATE POLICY "tenant_app_feature_policies_service_read"
  ON "tenant_app_feature_policies"
  FOR SELECT
  USING (
    app_access_policy_service_enabled()
    AND "tenant_id" = app_current_tenant_id()
  );
--> statement-breakpoint
REVOKE ALL ON "plan_module_policies", "plan_app_feature_policies", "tenant_app_feature_policies" FROM PUBLIC;
--> statement-breakpoint
-- Temporary migration-only policies permit the bounded School Admin backfill.
-- They are removed immediately after the backfill and never become runtime access paths.
CREATE POLICY "roles_access_policy_backfill_read"
  ON "roles"
  FOR SELECT
  USING (app_platform_policy_management_enabled());
--> statement-breakpoint
CREATE POLICY "role_permissions_access_policy_backfill_insert"
  ON "role_permissions"
  FOR INSERT
  WITH CHECK (app_platform_policy_management_enabled());
--> statement-breakpoint
-- Existing system School Admin roles receive every newly introduced permission.
-- Custom roles are intentionally untouched. The write context is transaction-local.
DO $$
BEGIN
  PERFORM set_config('app.platform_policy_management', 'true', true);
  INSERT INTO "role_permissions" ("tenant_id", "role_id", "permission", "created_at")
  SELECT role."tenant_id", role."id", permission."permission", now()
  FROM "roles" AS role
  CROSS JOIN (VALUES
    ('academics.view'::text),
    ('academics.manage'::text),
    ('students.view'::text),
    ('students.manage'::text),
    ('attendance.view'::text),
    ('attendance.manage'::text),
    ('fees.view'::text),
    ('fees.collect'::text),
    ('fees.export'::text),
    ('exams.view'::text),
    ('exams.publish'::text),
    ('reports.view'::text),
    ('reports.manage'::text),
    ('settings.manage'::text),
    ('settings.view'::text),
    ('roles.view'::text),
    ('roles.manage'::text),
    ('operations.view'::text),
    ('operations.manage'::text),
    ('workspace.view'::text),
    ('workspace.manage'::text),
    ('accounts.view'::text),
    ('accounts.manage'::text),
    ('front_office.view'::text),
    ('front_office.manage'::text),
    ('lead_management.view'::text),
    ('lead_management.manage'::text),
    ('cbc_academics.view'::text),
    ('cbc_academics.manage'::text),
    ('human_resources.view'::text),
    ('human_resources.manage'::text),
    ('ptm_meetings.view'::text),
    ('ptm_meetings.manage'::text),
    ('lesson_planner.view'::text),
    ('lesson_planner.manage'::text),
    ('osm.view'::text),
    ('osm.manage'::text),
    ('assessment.view'::text),
    ('assessment.manage'::text),
    ('live_classes.view'::text),
    ('live_classes.manage'::text),
    ('study_center.view'::text),
    ('study_center.manage'::text),
    ('certificates.view'::text),
    ('certificates.manage'::text),
    ('communication.view'::text),
    ('communication.manage'::text),
    ('library.view'::text),
    ('library.manage'::text),
    ('inventory.view'::text),
    ('inventory.manage'::text),
    ('transport.view'::text),
    ('transport.manage'::text),
    ('hostel.view'::text),
    ('hostel.manage'::text),
    ('help_center.view'::text),
    ('help_center.manage'::text),
    ('asset_management.view'::text),
    ('asset_management.manage'::text)
) AS permission("permission")
  WHERE role."system" = true
    AND role."key" = 'school_admin'
  ON CONFLICT ("tenant_id", "role_id", "permission") DO NOTHING;
END
$$;
--> statement-breakpoint
DROP POLICY "roles_access_policy_backfill_read" ON "roles";
--> statement-breakpoint
DROP POLICY "role_permissions_access_policy_backfill_insert" ON "role_permissions";
