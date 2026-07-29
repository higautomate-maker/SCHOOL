-- Custom SQL migration file, put your code below! --
-- The application role must not own these tables and must not have BYPASSRLS.
-- Every tenant transaction sets app.tenant_id with set_config(..., true).
CREATE OR REPLACE FUNCTION app_current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenants_isolation" ON "tenants"
  USING ("id" = app_current_tenant_id())
  WITH CHECK ("id" = app_current_tenant_id());

ALTER TABLE "campuses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campuses" FORCE ROW LEVEL SECURITY;
CREATE POLICY "campuses_isolation" ON "campuses"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

ALTER TABLE "academic_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "academic_sessions_isolation" ON "academic_sessions"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

ALTER TABLE "school_classes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_classes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "school_classes_isolation" ON "school_classes"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

ALTER TABLE "class_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "class_sections" FORCE ROW LEVEL SECURITY;
CREATE POLICY "class_sections_isolation" ON "class_sections"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

ALTER TABLE "subjects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subjects" FORCE ROW LEVEL SECURITY;
CREATE POLICY "subjects_isolation" ON "subjects"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

ALTER TABLE "school_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "school_settings_isolation" ON "school_settings"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

ALTER TABLE "school_configurations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_configurations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "school_configurations_isolation" ON "school_configurations"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
CREATE POLICY "memberships_isolation" ON "memberships"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_isolation" ON "subscriptions"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

ALTER TABLE "module_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "module_policies" FORCE ROW LEVEL SECURITY;
CREATE POLICY "module_policies_isolation" ON "module_policies"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "audit_events_isolation" ON "audit_events"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

ALTER TABLE "school_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_invitations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "school_invitations_isolation" ON "school_invitations"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

ALTER TABLE "idempotency_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY "idempotency_records_isolation" ON "idempotency_records"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "roles_isolation" ON "roles"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "role_permissions_isolation" ON "role_permissions"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "students" FORCE ROW LEVEL SECURITY;
CREATE POLICY "students_isolation" ON "students"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

ALTER TABLE "student_attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_attendance" FORCE ROW LEVEL SECURITY;
CREATE POLICY "student_attendance_isolation" ON "student_attendance"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

ALTER TABLE "fee_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_invoices" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fee_invoices_isolation" ON "fee_invoices"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

ALTER TABLE "fee_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fee_payments_isolation" ON "fee_payments"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

ALTER TABLE "module_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "module_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY "module_records_isolation" ON "module_records"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());

ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbox_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "outbox_events_isolation" ON "outbox_events"
  USING ("tenant_id" = app_current_tenant_id())
  WITH CHECK ("tenant_id" = app_current_tenant_id());
