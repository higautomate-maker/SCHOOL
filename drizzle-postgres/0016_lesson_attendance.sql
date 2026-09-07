-- Subject/period attendance is deliberately separate from the official daily
-- register. A lesson save must never update student_attendance.
CREATE TABLE lesson_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  academic_session_id uuid NOT NULL,
  class_id uuid NOT NULL,
  section_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  lesson_key text NOT NULL,
  attendance_date date NOT NULL,
  student_id uuid NOT NULL,
  status attendance_status NOT NULL,
  note text NOT NULL DEFAULT '',
  marked_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_attendance_key_ck CHECK (char_length(lesson_key) BETWEEN 1 AND 120),
  CONSTRAINT lesson_attendance_note_ck CHECK (char_length(note) <= 240),
  CONSTRAINT lesson_attendance_session_fk FOREIGN KEY (tenant_id, academic_session_id)
    REFERENCES academic_sessions(tenant_id, id),
  CONSTRAINT lesson_attendance_section_fk FOREIGN KEY (tenant_id, class_id, section_id)
    REFERENCES class_sections(tenant_id, class_id, id),
  CONSTRAINT lesson_attendance_subject_fk FOREIGN KEY (tenant_id, subject_id)
    REFERENCES subjects(tenant_id, id),
  CONSTRAINT lesson_attendance_student_fk FOREIGN KEY (tenant_id, student_id)
    REFERENCES students(tenant_id, id)
);
CREATE UNIQUE INDEX lesson_attendance_student_uq ON lesson_attendance
  (tenant_id, academic_session_id, class_id, section_id, subject_id, attendance_date, lesson_key, student_id);
CREATE INDEX lesson_attendance_register_idx ON lesson_attendance
  (tenant_id, academic_session_id, class_id, section_id, subject_id, attendance_date);
ALTER TABLE lesson_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_attendance FORCE ROW LEVEL SECURITY;
CREATE POLICY lesson_attendance_isolation ON lesson_attendance
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
