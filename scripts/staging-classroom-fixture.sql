-- Staging-only, idempotent synthetic classroom fixture.
-- Never run against production. It expands the existing Greenfield acceptance tenant.
BEGIN;

SELECT set_config('app.tenant_id', '1c602856-3fec-486f-b18d-a791f124b206', true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tenants
    WHERE id = '1c602856-3fec-486f-b18d-a791f124b206'::uuid
      AND status IN ('trial', 'active')
  ) THEN
    RAISE EXCEPTION 'Greenfield staging tenant is missing or not active';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM academic_sessions
    WHERE tenant_id = '1c602856-3fec-486f-b18d-a791f124b206'::uuid
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Greenfield staging tenant has no active academic session';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE lower(email) = 'greenfield.teacher.test@higschool.test'
  ) THEN
    RAISE EXCEPTION 'Greenfield staging teacher identity is missing';
  END IF;
END $$;

WITH target AS (
  SELECT
    '1c602856-3fec-486f-b18d-a791f124b206'::uuid AS tenant_id,
    (SELECT id FROM campuses WHERE tenant_id = '1c602856-3fec-486f-b18d-a791f124b206'::uuid ORDER BY created_at LIMIT 1) AS campus_id,
    (SELECT id FROM academic_sessions WHERE tenant_id = '1c602856-3fec-486f-b18d-a791f124b206'::uuid AND status = 'active' ORDER BY starts_on LIMIT 1) AS session_id,
    (SELECT id FROM users WHERE lower(email) = 'greenfield.teacher.test@higschool.test') AS teacher_id
  )
INSERT INTO school_classes (id, tenant_id, name, code, display_order, active)
SELECT '81000000-0000-4000-8000-000000000001'::uuid, tenant_id, 'Grade 8', 'G8', 8, true
FROM target
ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name, active = true, updated_at = now();

INSERT INTO class_sections (id, tenant_id, class_id, name, capacity)
SELECT '82000000-0000-4000-8000-000000000001'::uuid, tenant_id,
       (SELECT id FROM school_classes WHERE tenant_id = target.tenant_id AND code = 'G8'), 'A', 40
FROM (SELECT '1c602856-3fec-486f-b18d-a791f124b206'::uuid AS tenant_id) target
ON CONFLICT (class_id, name) DO UPDATE SET capacity = 40, updated_at = now();

INSERT INTO subjects (id, tenant_id, name, code, type, active)
SELECT gen_random_uuid(), '1c602856-3fec-486f-b18d-a791f124b206'::uuid, name, code, 'core', true
FROM (VALUES
  ('Mathematics', 'MATH'), ('English Language', 'ENG'), ('General Science', 'SCI'),
  ('Social Studies', 'SST'), ('Hindi', 'HIN'), ('Physical Education', 'PE')
) AS subject(name, code)
ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name, active = true, updated_at = now();

-- Keep the already-linked mobile student as the class anchor.
WITH target AS (
  SELECT
    '1c602856-3fec-486f-b18d-a791f124b206'::uuid AS tenant_id,
    (SELECT id FROM campuses WHERE tenant_id = '1c602856-3fec-486f-b18d-a791f124b206'::uuid ORDER BY created_at LIMIT 1) AS campus_id,
    (SELECT id FROM academic_sessions WHERE tenant_id = '1c602856-3fec-486f-b18d-a791f124b206'::uuid AND status = 'active' ORDER BY starts_on LIMIT 1) AS session_id,
    (SELECT id FROM users WHERE lower(email) = 'greenfield.teacher.test@higschool.test') AS teacher_id
  )
INSERT INTO students (
  id, tenant_id, campus_id, academic_session_id, admission_number, roll_number,
  first_name, last_name, gender, date_of_birth, admission_date, class_name,
  section_name, guardian_name, guardian_phone, status, created_by
)
SELECT
  'e6fbf585-3ff2-4a7d-ab9d-4a956cc57f97'::uuid, tenant_id, campus_id, session_id,
  'GF-8A-001', '01', 'Aarav', 'Sharma', 'male', '2013-03-12', current_date,
  'Grade 8', 'A', 'Neha Sharma', '+91 98765 20184', 'active', teacher_id
FROM target
ON CONFLICT (tenant_id, id) DO UPDATE SET
  academic_session_id = EXCLUDED.academic_session_id, class_name = EXCLUDED.class_name,
  section_name = EXCLUDED.section_name, roll_number = EXCLUDED.roll_number,
  admission_number = EXCLUDED.admission_number, status = 'active', updated_at = now();

WITH target AS (
  SELECT
    '1c602856-3fec-486f-b18d-a791f124b206'::uuid AS tenant_id,
    (SELECT id FROM campuses WHERE tenant_id = '1c602856-3fec-486f-b18d-a791f124b206'::uuid ORDER BY created_at LIMIT 1) AS campus_id,
    (SELECT id FROM academic_sessions WHERE tenant_id = '1c602856-3fec-486f-b18d-a791f124b206'::uuid AND status = 'active' ORDER BY starts_on LIMIT 1) AS session_id,
    (SELECT id FROM users WHERE lower(email) = 'greenfield.teacher.test@higschool.test') AS teacher_id
  ), names AS (
    SELECT * FROM unnest(ARRAY['Diya','Vihaan','Anaya','Kabir','Myra','Reyansh','Ishita','Arjun','Saanvi','Advik','Kiara','Rohan','Aanya','Vivaan','Tara','Atharv','Meera','Neil','Anika','Dhruv','Zoya','Rudra','Ira','Yuvan','Nisha','Arnav','Avni','Kiaan','Sara'], ARRAY['Patel','Mehta','Gupta','Khan','Iyer','Malhotra','Verma','Das','Joshi','Singh','Shah','Bose','Rao','Kapoor','Nair','Bansal','Menon','Chopra','Sethi','Bhat','Qureshi','Deshmukh','Sen','Pillai','Mishra','Agarwal','Kulkarni','Saxena','Thomas']) AS n(first_name, last_name)
  )
INSERT INTO students (
  tenant_id, campus_id, academic_session_id, admission_number, roll_number,
  first_name, last_name, gender, date_of_birth, admission_date, class_name,
  section_name, guardian_name, guardian_phone, status, created_by
)
SELECT tenant_id, campus_id, session_id,
       format('GF-8A-%s', lpad((row_number() OVER () + 1)::text, 3, '0')),
       lpad((row_number() OVER () + 1)::text, 2, '0'), first_name, last_name,
       CASE WHEN row_number() OVER () % 2 = 0 THEN 'female' ELSE 'male' END::student_gender,
       (date '2013-01-01' + (((row_number() OVER () * 19) % 320)::int)), current_date,
       'Grade 8', 'A', format('%s Guardian', first_name),
       format('+91 98000 %05s', row_number() OVER ()::text), 'active', teacher_id
FROM target CROSS JOIN names
ON CONFLICT (tenant_id, admission_number) DO UPDATE SET
  class_name = EXCLUDED.class_name, section_name = EXCLUDED.section_name,
  status = 'active', updated_at = now();

-- Rebuild only this fixture's generic classroom records; never touch other tenant data.
DELETE FROM module_records
WHERE tenant_id = '1c602856-3fec-486f-b18d-a791f124b206'::uuid
  AND metadata ->> 'fixture' = 'greenfield-classroom-v1';

WITH target AS (
  SELECT '1c602856-3fec-486f-b18d-a791f124b206'::uuid tenant_id,
         (SELECT id FROM academic_sessions WHERE tenant_id = '1c602856-3fec-486f-b18d-a791f124b206'::uuid AND status = 'active' ORDER BY starts_on LIMIT 1) session_id,
         (SELECT id FROM users WHERE lower(email) = 'greenfield.teacher.test@higschool.test') teacher_id
  ), records AS (
    SELECT 'Academics' module_key, 'Timetable' workflow, 'Monday timetable — Grade 8 A' title, 'Mathematics 08:00 · English 09:00 · Science 10:30 · Social Studies 12:00' description, current_date record_date, NULL::date due_date, 'Grade 8 A' assignee, 'open' status
    UNION ALL SELECT 'Study Center', 'Homework & Assignments', 'Mathematics: Linear Equations', 'Complete exercises 4.1 and 4.2 with working.', current_date, current_date + 3, 'Grade 8 A', 'open'
    UNION ALL SELECT 'Study Center', 'Homework & Assignments', 'English: The Last Leaf', 'Write a 250-word character sketch of Behrman.', current_date - 1, current_date + 5, 'Grade 8 A', 'in_progress'
    UNION ALL SELECT 'Study Center', 'Lesson Planning', 'Science: Force and Pressure', 'Lab observation and pressure demonstration.', current_date - 2, NULL, 'Grade 8 A', 'completed'
    UNION ALL SELECT 'Assessment', 'Assessments', 'Unit Test 1 — Mathematics', 'Linear equations and number systems · 40 marks.', current_date - 4, NULL, 'Grade 8 A', 'completed'
    UNION ALL SELECT 'Assessment', 'Assessments', 'Science Quiz — Force and Pressure', 'Short quiz · 20 marks.', current_date + 3, NULL, 'Grade 8 A', 'open'
    UNION ALL SELECT 'Communicate', 'Notice Board', 'Independence Day rehearsal', 'House-wise rehearsal starts at 8:00 AM.', current_date, current_date + 7, 'All Grade 8 families', 'open'
    UNION ALL SELECT 'Communicate', 'Notice Board', 'Parent-teacher meeting', 'Meeting slots are open for Grade 8 A families.', current_date - 1, current_date + 10, 'Grade 8 A', 'open'
  )
INSERT INTO module_records (tenant_id, academic_session_id, module_key, workflow, title, description, record_date, due_date, assignee, priority, status, metadata, created_by)
SELECT tenant_id, session_id, module_key, workflow, title, description, record_date, due_date, assignee, 'normal', status::record_status,
       jsonb_build_object('fixture','greenfield-classroom-v1','class','Grade 8','section','A'), teacher_id
FROM target CROSS JOIN records;

-- A visible five-day attendance history for the whole class.
WITH target AS (
  SELECT '1c602856-3fec-486f-b18d-a791f124b206'::uuid tenant_id,
         (SELECT id FROM academic_sessions WHERE tenant_id = '1c602856-3fec-486f-b18d-a791f124b206'::uuid AND status = 'active' ORDER BY starts_on LIMIT 1) session_id,
         (SELECT id FROM users WHERE lower(email) = 'greenfield.teacher.test@higschool.test') teacher_id
  )
INSERT INTO student_attendance (tenant_id, academic_session_id, student_id, attendance_date, status, note, marked_by)
SELECT target.tenant_id, target.session_id, s.id, current_date - d.day,
       CASE WHEN (COALESCE(NULLIF(regexp_replace(s.roll_number, '\\D', '', 'g'), '')::int, 1) + d.day) % 11 = 0 THEN 'late'::attendance_status
            WHEN (COALESCE(NULLIF(regexp_replace(s.roll_number, '\\D', '', 'g'), '')::int, 1) + d.day) % 17 = 0 THEN 'absent'::attendance_status
            ELSE 'present'::attendance_status END,
       'Greenfield classroom demo attendance', target.teacher_id
FROM target
CROSS JOIN generate_series(0, 4) AS d(day)
JOIN students s ON s.tenant_id = target.tenant_id AND s.class_name = 'Grade 8' AND s.section_name = 'A'
ON CONFLICT (tenant_id, student_id, attendance_date) DO UPDATE SET
  status = EXCLUDED.status, note = EXCLUDED.note, marked_by = EXCLUDED.marked_by, updated_at = now();

-- Fee cards for the linked student: one paid, one partial, one due.
DELETE FROM fee_payments WHERE tenant_id = '1c602856-3fec-486f-b18d-a791f124b206'::uuid AND reference LIKE 'GF-DEMO-%';
DELETE FROM fee_invoices WHERE tenant_id = '1c602856-3fec-486f-b18d-a791f124b206'::uuid AND fee_type LIKE 'Greenfield Demo%';
WITH target AS (
  SELECT '1c602856-3fec-486f-b18d-a791f124b206'::uuid tenant_id,
         (SELECT id FROM academic_sessions WHERE tenant_id = '1c602856-3fec-486f-b18d-a791f124b206'::uuid AND status = 'active' ORDER BY starts_on LIMIT 1) session_id,
         (SELECT id FROM users WHERE lower(email) = 'greenfield.teacher.test@higschool.test') teacher_id,
         (SELECT id FROM students WHERE tenant_id = '1c602856-3fec-486f-b18d-a791f124b206'::uuid AND id = 'e6fbf585-3ff2-4a7d-ab9d-4a956cc57f97'::uuid) student_id
  )
INSERT INTO fee_invoices (tenant_id, academic_session_id, student_id, fee_type, amount_paise, paid_paise, due_date, status, created_by)
SELECT tenant_id, session_id, student_id, fee_type, amount, paid, due_date, status::invoice_status, teacher_id
FROM target CROSS JOIN (VALUES
  ('Greenfield Demo — Term 1 Tuition', 450000::bigint, 450000::bigint, current_date - 10, 'paid'),
  ('Greenfield Demo — Term 2 Tuition', 450000::bigint, 225000::bigint, current_date + 12, 'partial'),
  ('Greenfield Demo — Transport', 120000::bigint, 0::bigint, current_date + 20, 'due')
) AS invoice(fee_type, amount, paid, due_date, status);

COMMIT;
