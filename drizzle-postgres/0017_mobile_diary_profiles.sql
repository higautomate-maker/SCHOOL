CREATE TABLE mobile_diary (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 academic_session_id uuid NOT NULL, class_id uuid NOT NULL, section_id uuid NOT NULL, subject_id uuid NOT NULL,
 title text NOT NULL CHECK(char_length(title) BETWEEN 2 AND 140),
 description text NOT NULL CHECK(char_length(description) <= 4000),
 record_date date NOT NULL, due_date date NOT NULL CHECK(due_date >= record_date),
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,academic_session_id) REFERENCES academic_sessions(tenant_id,id),
 FOREIGN KEY(tenant_id,class_id,section_id) REFERENCES class_sections(tenant_id,class_id,id),
 FOREIGN KEY(tenant_id,subject_id) REFERENCES subjects(tenant_id,id)
);
CREATE INDEX mobile_diary_date_idx ON mobile_diary(tenant_id,record_date);
CREATE TABLE mobile_diary_completion (
 tenant_id uuid NOT NULL, diary_id uuid NOT NULL, student_id uuid NOT NULL,
 completed boolean NOT NULL, updated_by uuid NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,diary_id,student_id),
 FOREIGN KEY(tenant_id,diary_id) REFERENCES mobile_diary(tenant_id,id),
 FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id)
);
CREATE TABLE mobile_profile_photos (
 tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL REFERENCES users(id),
 photo text NOT NULL CHECK(char_length(photo) <= 400000), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,user_id)
);
ALTER TABLE mobile_diary ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_diary FORCE ROW LEVEL SECURITY;
CREATE POLICY mobile_diary_isolation ON mobile_diary USING(tenant_id=app_current_tenant_id()) WITH CHECK(tenant_id=app_current_tenant_id());
ALTER TABLE mobile_diary_completion ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_diary_completion FORCE ROW LEVEL SECURITY;
CREATE POLICY mobile_diary_completion_isolation ON mobile_diary_completion USING(tenant_id=app_current_tenant_id()) WITH CHECK(tenant_id=app_current_tenant_id());
ALTER TABLE mobile_profile_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_profile_photos FORCE ROW LEVEL SECURITY;
CREATE POLICY mobile_profile_photos_isolation ON mobile_profile_photos USING(tenant_id=app_current_tenant_id()) WITH CHECK(tenant_id=app_current_tenant_id());
