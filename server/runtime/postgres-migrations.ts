// Keep this manifest synchronized with drizzle-postgres/*.sql. The unit gate
// verifies it, allowing readiness to remain compatible with non-Node bundles.
export const POSTGRES_MIGRATION_NAMES = [
  "0000_messy_blade.sql",
  "0001_tenant_rls.sql",
  "0002_platform_read_rls.sql",
  "0003_milky_juggernaut.sql",
  "0004_auth_hardening.sql",
  "0005_notifications_queues.sql",
  "0006_notification_inbox.sql",
  "0007_access_policy_foundation.sql",
  "0008_mobile_identity_api.sql",
  "0009_mobile_token_locators.sql",
  "0010_mobile_app_completion.sql",
  "0011_transport_master_data.sql",
  "0012_transport_geofencing.sql",
  "0013_transport_student_journey.sql",
  "0014_payment_foundation.sql",
] as const;
