-- Additive only. Requires staging migration and explicit assignment provisioning
-- before the new attendance flow is enabled. Never infer grants from demo data.
ALTER TABLE class_sections ADD CONSTRAINT class_sections_tenant_class_id_uq
  UNIQUE (tenant_id, class_id, id);
ALTER TABLE subjects ADD CONSTRAINT subjects_tenant_id_uq UNIQUE (tenant_id, id);

CREATE TABLE teacher_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  academic_session_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  class_id uuid NOT NULL,
  section_id uuid NOT NULL,
  kind text NOT NULL CONSTRAINT teacher_assignments_kind_ck CHECK (kind IN ('class_teacher', 'subject_teacher')),
  subject_id uuid,
  active boolean NOT NULL DEFAULT true,
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_assignments_kind_subject_ck CHECK (
    (kind = 'class_teacher' AND subject_id IS NULL)
    OR (kind = 'subject_teacher' AND subject_id IS NOT NULL)
  ),
  CONSTRAINT teacher_assignments_session_fk FOREIGN KEY (tenant_id, academic_session_id)
    REFERENCES academic_sessions(tenant_id, id),
  CONSTRAINT teacher_assignments_section_fk FOREIGN KEY (tenant_id, class_id, section_id)
    REFERENCES class_sections(tenant_id, class_id, id),
  CONSTRAINT teacher_assignments_subject_fk FOREIGN KEY (tenant_id, subject_id)
    REFERENCES subjects(tenant_id, id)
);
CREATE UNIQUE INDEX teacher_assignments_class_uq ON teacher_assignments
  (tenant_id, academic_session_id, user_id, class_id, section_id)
  WHERE kind = 'class_teacher';
CREATE UNIQUE INDEX teacher_assignments_subject_uq ON teacher_assignments
  (tenant_id, academic_session_id, user_id, class_id, section_id, subject_id)
  WHERE kind = 'subject_teacher';
CREATE INDEX teacher_assignments_lookup_idx ON teacher_assignments
  (tenant_id, user_id, academic_session_id) WHERE active;
ALTER TABLE teacher_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY teacher_assignments_isolation ON teacher_assignments
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
