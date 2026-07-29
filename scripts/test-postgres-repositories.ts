import assert from "node:assert/strict";
import {
  getPostgresPool,
  withTenantDatabase,
} from "../server/runtime/postgres.ts";
import {
  getPostgresSchoolDetail,
  performPostgresSchoolAction,
} from "../server/schools/management-postgres-repository.ts";
import {
  applyPostgresConfigurationAction,
  getPostgresConfiguration,
} from "../server/configuration/postgres-repository.ts";
import {
  applyPostgresFoundationAction,
  getPostgresFoundation,
} from "../server/foundation/postgres-repository.ts";
import {
  applyPostgresRoleAction,
  listPostgresRoles,
} from "../server/access/postgres-repository.ts";
import {
  createPostgresStudent,
  findPostgresStudentReplay,
  listPostgresStudents,
} from "../server/students/postgres-repository.ts";
import {
  applyPostgresWorkspaceAction,
  getPostgresWorkspace,
} from "../server/workspace/postgres-repository.ts";

const tenantId = "30000000-0000-4000-8000-000000000001";
const otherTenantId = "30000000-0000-4000-8000-000000000099";
const missingTenantId = "30000000-0000-4000-8000-000000000098";
const actor = {
  displayName: "Stage 3 Integration",
  email: "stage3.integration@higschool.test",
  fullName: "Stage 3 Integration",
};

try {
  const detail = await getPostgresSchoolDetail(tenantId);
  assert.equal(detail?.name, "HIG Model School");
  assert.equal(await getPostgresSchoolDetail(missingTenantId), null);

  const schoolAction = await performPostgresSchoolAction(
    tenantId,
    { action: "set_module", moduleKey: "communication", enabled: false },
    actor,
    "stage3-school-action",
  );
  assert.equal(
    schoolAction.modules.find((module) => module.key === "communication")?.enabled,
    false,
  );
  const replayedSchoolAction = await performPostgresSchoolAction(
    tenantId,
    { action: "set_module", moduleKey: "communication", enabled: false },
    actor,
    "stage3-school-action",
  );
  assert.deepEqual(replayedSchoolAction, schoolAction);

  const configuration = await applyPostgresConfigurationAction(
    tenantId,
    {
      action: "update_document",
      configKey: "notification_settings",
      payload: { attendanceAlerts: true, sender: "HIG School" },
    },
    actor,
  );
  assert.deepEqual(configuration.documents.notification_settings, {
    attendanceAlerts: true,
    sender: "HIG School",
  });
  assert.deepEqual(await getPostgresConfiguration(tenantId), configuration);

  await applyPostgresFoundationAction(
    tenantId,
    {
      action: "create_class",
      name: "Class 9",
      code: "IX",
      sections: ["A", "B"],
      capacity: 40,
    },
    actor,
  );
  await applyPostgresFoundationAction(
    tenantId,
    {
      action: "create_subject",
      name: "Mathematics",
      code: "MATH",
      type: "core",
    },
    actor,
  );
  const foundation = await getPostgresFoundation(tenantId);
  assert.equal(foundation.classes[0]?.sections.length, 2);
  assert.equal(foundation.subjects[0]?.code, "MATH");
  await assert.rejects(
    () => applyPostgresFoundationAction(
      tenantId,
      {
        action: "create_class",
        name: "Rollback Class",
        code: "ROLLBACK",
        sections: ["A", "A"],
        capacity: 30,
      },
      actor,
    ),
    /UNIQUE constraint failed/,
  );
  assert.equal(
    (await getPostgresFoundation(tenantId)).classes.some(
      (schoolClass) => schoolClass.code === "ROLLBACK",
    ),
    false,
  );

  const roles = await applyPostgresRoleAction(
    tenantId,
    {
      action: "create",
      name: "Admissions Officer",
      permissions: ["students.view", "students.manage"],
    },
    actor,
  );
  assert.ok(roles.some((role) => role.name === "Admissions Officer"));
  assert.deepEqual(await listPostgresRoles(tenantId, actor), roles);

  const studentInput = {
    admissionNumber: "HIG-STAGE3-001",
    rollNumber: "9A-01",
    firstName: "Aarav",
    lastName: "Mehta",
    gender: "male" as const,
    dateOfBirth: "2012-05-12",
    admissionDate: "2026-04-01",
    className: "Class 9",
    sectionName: "A",
    guardianName: "Rohan Mehta",
    guardianPhone: "+91 9876543210",
  };
  const student = await createPostgresStudent(
    tenantId,
    studentInput,
    actor,
    "stage3-student-create",
  );
  assert.equal(student.fullName, "Aarav Mehta");
  assert.equal(typeof student.dateOfBirth, "string");
  assert.equal(typeof student.admissionDate, "string");
  assert.equal(student.dateOfBirth, studentInput.dateOfBirth);
  assert.equal(student.admissionDate, studentInput.admissionDate);
  assert.deepEqual(
    await findPostgresStudentReplay(
      tenantId,
      "stage3-student-create",
      actor.email,
    ),
    student,
  );
  assert.ok(
    (await listPostgresStudents(tenantId)).some(
      (record) => record.id === student.id,
    ),
  );

  const workspace = await applyPostgresWorkspaceAction(
    tenantId,
    {
      action: "create_record",
      moduleKey: "Student Information",
      workflow: "Admission follow-up",
      title: "Verify transfer certificate",
      description: "Stage 3 integration record",
      recordDate: "2026-07-29",
      dueDate: "2026-07-31",
      amountPaise: null,
      assignee: "Admissions Officer",
      priority: "high",
    },
    actor,
  );
  const workspaceRecord = workspace.records[0];
  assert.ok(workspaceRecord);
  const completedWorkspace = await applyPostgresWorkspaceAction(
    tenantId,
    {
      action: "update_status",
      recordId: workspaceRecord.id,
      status: "completed",
    },
    actor,
  );
  assert.equal(completedWorkspace.records[0]?.status, "completed");
  assert.equal(
    (await getPostgresWorkspace(tenantId, "Student Information")).metrics.completed,
    1,
  );

  await assert.rejects(
    () => withTenantDatabase(tenantId, async (_database, client) => {
      await client.query(
        `INSERT INTO school_configurations (
           tenant_id, config_key, payload, updated_by
         )
         SELECT $1, 'rollback_probe', '{}'::jsonb, id
         FROM users
         WHERE lower(email) = lower($2)
         LIMIT 1`,
        [tenantId, actor.email],
      );
      throw new Error("intentional rollback");
    }),
    /intentional rollback/,
  );
  const rollbackProbe = await withTenantDatabase(
    tenantId,
    async (_database, client) => client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM school_configurations
       WHERE tenant_id = $1
         AND config_key = 'rollback_probe'`,
      [tenantId],
    ),
  );
  assert.equal(rollbackProbe.rows[0]?.count, "0");

  const isolation = await withTenantDatabase(
    tenantId,
    async (_database, client) => {
      const read = await client.query(
        `SELECT id
         FROM tenants
         WHERE id = $1`,
        [otherTenantId],
      );
      const write = await client.query(
        `UPDATE tenants
         SET name = 'Cross-tenant write must fail'
         WHERE id = $1`,
        [otherTenantId],
      );
      return { readCount: read.rowCount, writeCount: write.rowCount };
    },
  );
  assert.deepEqual(isolation, { readCount: 0, writeCount: 0 });

  console.log(
    "PostgreSQL school detail, configuration, foundation, roles, students, workspace, rollback, replay, and tenant-isolation checks passed.",
  );
} finally {
  await getPostgresPool().end();
}
