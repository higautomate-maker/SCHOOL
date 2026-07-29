-- Custom SQL migration file, put your code below! --
CREATE OR REPLACE FUNCTION app_platform_read_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.platform_read', true), ''), 'false')::boolean
$$;

-- The platform reader receives SELECT-only visibility required by the Company
-- school catalogue. Mutations still use tenant context and tenant policies.
CREATE POLICY "tenants_platform_read" ON "tenants"
  FOR SELECT USING (app_platform_read_enabled());

CREATE POLICY "campuses_platform_read" ON "campuses"
  FOR SELECT USING (app_platform_read_enabled());

CREATE POLICY "subscriptions_platform_read" ON "subscriptions"
  FOR SELECT USING (app_platform_read_enabled());

CREATE POLICY "school_invitations_platform_read" ON "school_invitations"
  FOR SELECT USING (app_platform_read_enabled());

CREATE POLICY "students_platform_read" ON "students"
  FOR SELECT USING (app_platform_read_enabled());
