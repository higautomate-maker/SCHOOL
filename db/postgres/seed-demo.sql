-- Deterministic non-production seed. Never run against a production database.
BEGIN;

INSERT INTO users (id, email, full_name, status)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'company.demo@higschool.test', 'HIG Company Demo', 'active'),
  ('10000000-0000-4000-8000-000000000002', 'school.demo@higschool.test', 'Priya Sharma', 'active'),
  ('10000000-0000-4000-8000-000000000003', 'teacher.demo@higschool.test', 'Neha Kapoor', 'active'),
  ('10000000-0000-4000-8000-000000000004', 'parent.demo@higschool.test', 'Rajesh Sharma', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO plans (id, name, monthly_price_paise, annual_price_paise, active)
VALUES ('20000000-0000-4000-8000-000000000001', 'Growth', 349900, 3499000, true)
ON CONFLICT (id) DO NOTHING;

SELECT set_config('app.tenant_id', '30000000-0000-4000-8000-000000000001', true);

INSERT INTO tenants (id, name, slug, status, country_code)
VALUES ('30000000-0000-4000-8000-000000000001', 'HIG Model School', 'hig-model-school', 'active', 'IN')
ON CONFLICT (id) DO NOTHING;

INSERT INTO campuses (id, tenant_id, name, code, city)
VALUES (
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'Main Campus',
  'MAIN',
  'New Delhi'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO academic_sessions (id, tenant_id, name, starts_on, ends_on, status)
VALUES (
  '50000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '2026–27',
  '2026-04-01',
  '2027-03-31',
  'active'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO subscriptions (id, tenant_id, plan_id, status, period_ends_at)
VALUES (
  '60000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'active',
  '2027-03-31T18:29:59Z'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO memberships (tenant_id, user_id, role_key, campus_id)
VALUES
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'school_admin', '40000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'teacher', '40000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'parent', '40000000-0000-4000-8000-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO module_policies (tenant_id, module_key, enabled, source, updated_by)
SELECT
  '30000000-0000-4000-8000-000000000001',
  module_key,
  true,
  'plan',
  '10000000-0000-4000-8000-000000000001'
FROM unnest(ARRAY[
  'student_information',
  'fees_finance',
  'attendance',
  'examinations',
  'communication'
]) AS module_key
ON CONFLICT (tenant_id, module_key) DO UPDATE
SET enabled = EXCLUDED.enabled, source = EXCLUDED.source, updated_by = EXCLUDED.updated_by;

INSERT INTO roles (id, tenant_id, name, key, system, description, created_by)
VALUES
  ('70000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'School Administrator', 'school_admin', true, 'Full access within enabled school modules.', '10000000-0000-4000-8000-000000000001'),
  ('70000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'Teacher', 'teacher', true, 'Assigned class and teaching workflows.', '10000000-0000-4000-8000-000000000002'),
  ('70000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'Parent', 'parent', true, 'Read access for linked children.', '10000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO role_permissions (tenant_id, role_id, permission)
VALUES
  ('30000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'roles.manage'),
  ('30000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'students.manage'),
  ('30000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002', 'attendance.mark'),
  ('30000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002', 'students.view_assigned'),
  ('30000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000003', 'students.view_linked')
ON CONFLICT DO NOTHING;

INSERT INTO school_settings (
  tenant_id, short_name, email, phone, principal_name, address, updated_by
) VALUES (
  '30000000-0000-4000-8000-000000000001',
  'HIG',
  'school.demo@higschool.test',
  '+91 98765 43210',
  'Priya Sharma',
  'New Delhi, India',
  '10000000-0000-4000-8000-000000000002'
)
ON CONFLICT (tenant_id) DO NOTHING;

COMMIT;
