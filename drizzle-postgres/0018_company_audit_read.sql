-- Company administrators may read audit history across schools. This policy
-- grants SELECT only; tenant-scoped inserts and updates remain unchanged.
CREATE POLICY "audit_events_platform_read" ON "audit_events"
  FOR SELECT USING (app_platform_read_enabled());

CREATE INDEX "audit_company_time_id_idx" ON "audit_events" ("occurred_at" DESC, "id" DESC);
CREATE INDEX "audit_tenant_time_id_idx" ON "audit_events" ("tenant_id", "occurred_at" DESC, "id" DESC);
