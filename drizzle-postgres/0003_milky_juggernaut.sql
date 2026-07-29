CREATE UNIQUE INDEX "idempotency_key_uq" ON "idempotency_records" USING btree ("key");
--> statement-breakpoint
-- Platform school creation is a narrowly scoped write context. It is separate
-- from Company catalogue reads and from every tenant-owned operation.
CREATE OR REPLACE FUNCTION app_platform_create_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.platform_create', true), ''), 'false')::boolean
$$;
--> statement-breakpoint
CREATE POLICY "tenants_platform_create" ON "tenants"
  FOR INSERT WITH CHECK (app_platform_create_enabled());
--> statement-breakpoint
CREATE POLICY "campuses_platform_create" ON "campuses"
  FOR INSERT WITH CHECK (app_platform_create_enabled());
--> statement-breakpoint
CREATE POLICY "subscriptions_platform_create" ON "subscriptions"
  FOR INSERT WITH CHECK (app_platform_create_enabled());
--> statement-breakpoint
CREATE POLICY "memberships_platform_create" ON "memberships"
  FOR INSERT WITH CHECK (app_platform_create_enabled());
--> statement-breakpoint
CREATE POLICY "module_policies_platform_create" ON "module_policies"
  FOR INSERT WITH CHECK (app_platform_create_enabled());
--> statement-breakpoint
CREATE POLICY "school_invitations_platform_create" ON "school_invitations"
  FOR INSERT WITH CHECK (app_platform_create_enabled());
--> statement-breakpoint
CREATE POLICY "audit_events_platform_create" ON "audit_events"
  FOR INSERT WITH CHECK (app_platform_create_enabled());
--> statement-breakpoint
CREATE POLICY "idempotency_records_platform_create_read" ON "idempotency_records"
  FOR SELECT USING (app_platform_create_enabled());
--> statement-breakpoint
CREATE POLICY "idempotency_records_platform_create_write" ON "idempotency_records"
  FOR INSERT WITH CHECK (app_platform_create_enabled());
