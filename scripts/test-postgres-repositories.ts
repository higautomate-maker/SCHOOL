import assert from "node:assert/strict";
import {
  defaultEnabledSchoolModuleKeys,
  schoolModuleKeys,
} from "../server/access/catalogue.ts";
import {
  getPostgresPool,
  withPlatformReadDatabase,
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
import {
  applyPostgresOperation,
  getPostgresOperations,
} from "../server/operations/postgres-repository.ts";
import {
  createPostgresSchool,
  findPostgresSchoolCreationReplay,
} from "../server/schools/postgres-repository.ts";

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

  const attendanceDate = "2026-07-29";
  const attendance = await applyPostgresOperation(
    tenantId,
    {
      action: "mark_attendance",
      studentId: student.id,
      attendanceDate,
      status: "present",
      note: "Stage 4 attendance",
    },
    actor,
    "stage4-attendance-create",
  );
  const attendanceRecord = attendance.attendance.find(
    (entry) => entry.studentId === student.id
      && entry.attendanceDate === attendanceDate,
  );
  assert.equal(attendanceRecord?.status, "present");
  assert.equal(typeof attendanceRecord?.attendanceDate, "string");
  assert.deepEqual(
    await applyPostgresOperation(
      tenantId,
      {
        action: "mark_attendance",
        studentId: student.id,
        attendanceDate,
        status: "present",
        note: "Stage 4 attendance",
      },
      actor,
      "stage4-attendance-create",
    ),
    attendance,
  );
  const updatedAttendance = await applyPostgresOperation(
    tenantId,
    {
      action: "mark_attendance",
      studentId: student.id,
      attendanceDate,
      status: "late",
      note: "Stage 4 attendance updated",
    },
    actor,
    "stage4-attendance-update",
  );
  assert.equal(
    updatedAttendance.attendance.find(
      (entry) => entry.studentId === student.id
        && entry.attendanceDate === attendanceDate,
    )?.status,
    "late",
  );

  const invoiced = await applyPostgresOperation(
    tenantId,
    {
      action: "create_invoice",
      studentId: student.id,
      feeType: "Stage 4 Tuition Fee",
      amountPaise: 10_000,
      dueDate: "2026-08-15",
    },
    actor,
    "stage4-invoice-create",
  );
  const invoice = invoiced.invoices.find(
    (entry) => entry.feeType === "Stage 4 Tuition Fee",
  );
  assert.ok(invoice);
  assert.equal(invoice.amountPaise, 10_000);
  assert.equal(invoice.paidPaise, 0);
  assert.equal(invoice.dueDate, "2026-08-15");
  assert.equal(typeof invoice.dueDate, "string");
  assert.equal(typeof invoice.createdAt, "string");
  const replayedInvoice = await applyPostgresOperation(
    tenantId,
    {
      action: "create_invoice",
      studentId: student.id,
      feeType: "Stage 4 Tuition Fee",
      amountPaise: 10_000,
      dueDate: "2026-08-15",
    },
    actor,
    "stage4-invoice-create",
  );
  assert.deepEqual(replayedInvoice, invoiced);
  assert.equal(
    replayedInvoice.invoices.filter(
      (entry) => entry.feeType === "Stage 4 Tuition Fee",
    ).length,
    1,
  );

  const firstPayment = await applyPostgresOperation(
    tenantId,
    {
      action: "record_payment",
      invoiceId: invoice.id,
      amountPaise: 4_000,
      method: "upi",
      reference: "STAGE4-UPI-1",
    },
    actor,
    "stage4-payment-first",
  );
  assert.equal(
    firstPayment.invoices.find((entry) => entry.id === invoice.id)?.paidPaise,
    4_000,
  );
  assert.equal(
    firstPayment.invoices.find((entry) => entry.id === invoice.id)?.status,
    "partial",
  );
  const replayedPayment = await applyPostgresOperation(
    tenantId,
    {
      action: "record_payment",
      invoiceId: invoice.id,
      amountPaise: 4_000,
      method: "upi",
      reference: "STAGE4-UPI-1",
    },
    actor,
    "stage4-payment-first",
  );
  assert.deepEqual(replayedPayment, firstPayment);
  assert.equal(
    replayedPayment.payments.filter(
      (payment) => payment.invoiceId === invoice.id,
    ).length,
    1,
  );

  const concurrent = await Promise.allSettled([
    applyPostgresOperation(
      tenantId,
      {
        action: "record_payment",
        invoiceId: invoice.id,
        amountPaise: 6_000,
        method: "bank",
        reference: "STAGE4-BANK-A",
      },
      actor,
      "stage4-payment-concurrent-a",
    ),
    applyPostgresOperation(
      tenantId,
      {
        action: "record_payment",
        invoiceId: invoice.id,
        amountPaise: 6_000,
        method: "bank",
        reference: "STAGE4-BANK-B",
      },
      actor,
      "stage4-payment-concurrent-b",
    ),
  ]);
  assert.equal(
    concurrent.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    concurrent.filter((result) => result.status === "rejected").length,
    1,
  );
  const paid = await getPostgresOperations(tenantId);
  assert.equal(
    paid.invoices.find((entry) => entry.id === invoice.id)?.paidPaise,
    10_000,
  );
  assert.equal(
    paid.invoices.find((entry) => entry.id === invoice.id)?.status,
    "paid",
  );
  assert.equal(
    paid.payments.filter((payment) => payment.invoiceId === invoice.id).length,
    2,
  );

  const writeCountsBeforeFailure = await operationWriteCounts(tenantId, invoice.id);
  await assert.rejects(
    () => applyPostgresOperation(
      tenantId,
      {
        action: "record_payment",
        invoiceId: invoice.id,
        amountPaise: 100,
        method: "cash",
        reference: "STAGE4-OVERPAY",
      },
      actor,
      "stage4-payment-rollback",
    ),
    /Payment exceeds the outstanding balance/,
  );
  assert.deepEqual(
    await operationWriteCounts(tenantId, invoice.id),
    writeCountsBeforeFailure,
  );

  const attendanceIsolation = await withTenantDatabase(
    tenantId,
    async (_database, client) => {
      const read = await client.query(
        `SELECT id
         FROM student_attendance
         WHERE tenant_id = $1::uuid`,
        [otherTenantId],
      );
      const write = await client.query(
        `UPDATE student_attendance
         SET note = 'Cross-tenant attendance write must fail'
         WHERE tenant_id = $1::uuid`,
        [otherTenantId],
      );
      return { readCount: read.rowCount, writeCount: write.rowCount };
    },
  );
  assert.deepEqual(attendanceIsolation, { readCount: 0, writeCount: 0 });

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

  const platformSchoolInput = {
    name: "Stage 4 Greenfield School",
    city: "Pune",
    plan: "Starter" as const,
    adminEmail: "stage4.admin@higschool.test",
  };
  const platformSchool = await createPostgresSchool(
    platformSchoolInput,
    actor,
    "stage4-school-create",
  );
  const replayedPlatformSchool = await createPostgresSchool(
    platformSchoolInput,
    actor,
    "stage4-school-create",
  );
  assert.deepEqual(replayedPlatformSchool, platformSchool);
  assert.deepEqual(
    await findPostgresSchoolCreationReplay(
      "stage4-school-create",
      actor.email,
    ),
    platformSchool,
  );
  const onboardingCounts = await withTenantDatabase(
    platformSchool.tenantId,
    async (_database, client) => {
      const result = await client.query<{
        campuses: string;
        subscriptions: string;
        memberships: string;
        modules: string;
        enabledModules: string;
        invitations: string;
        audits: string;
        replays: string;
      }>(
        `SELECT
           (SELECT count(*)::text FROM campuses WHERE tenant_id = $1::uuid) AS campuses,
           (SELECT count(*)::text FROM subscriptions WHERE tenant_id = $1::uuid) AS subscriptions,
           (SELECT count(*)::text FROM memberships WHERE tenant_id = $1::uuid) AS memberships,
           (SELECT count(*)::text FROM module_policies WHERE tenant_id = $1::uuid) AS modules,
           (SELECT count(*)::text FROM module_policies WHERE tenant_id = $1::uuid AND enabled = true) AS "enabledModules",
           (SELECT count(*)::text FROM school_invitations WHERE tenant_id = $1::uuid) AS invitations,
           (SELECT count(*)::text FROM audit_events WHERE tenant_id = $1::uuid AND action = 'school.create') AS audits,
           (SELECT count(*)::text FROM idempotency_records WHERE tenant_id = $1::uuid AND operation = 'school.create') AS replays`,
        [platformSchool.tenantId],
      );
      return result.rows[0];
    },
  );
  assert.deepEqual(onboardingCounts, {
    campuses: "1",
    subscriptions: "1",
    memberships: "1",
    modules: String(schoolModuleKeys.length),
    enabledModules: String(defaultEnabledSchoolModuleKeys.size),
    invitations: "1",
    audits: "1",
    replays: "1",
  });

  await assert.rejects(
    () => createPostgresSchool(
      {
        name: "Stage 4 Rollback School",
        city: "Mumbai",
        plan: "Growth",
        adminEmail: "stage4.rollback@higschool.test",
      },
      actor,
      "stage4-school-rollback",
    ),
    /intentional school onboarding rollback/,
  );
  const rollbackGlobalWrites = await withPlatformReadDatabase(
    async (_database, client) => client.query<{
      tenants: string;
      admins: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM tenants WHERE name = $1::text) AS tenants,
         (SELECT count(*)::text FROM users WHERE lower(email) = lower($2::text)) AS admins`,
      ["Stage 4 Rollback School", "stage4.rollback@higschool.test"],
    ),
  );
  assert.deepEqual(rollbackGlobalWrites.rows[0], {
    tenants: "0",
    admins: "0",
  });

  console.log(
    "PostgreSQL school detail, configuration, foundation, roles, students, workspace, rollback, replay, and tenant-isolation checks passed.",
  );
  console.log(
    "PostgreSQL attendance, fee invoices, fee payments, row locking, replay, rollback, platform school creation, onboarding rollback, and tenant-isolation checks passed.",
  );
} finally {
  await getPostgresPool().end();
}

function operationWriteCounts(tenant: string, invoiceId: string) {
  return withTenantDatabase(tenant, async (_database, client) => {
    const result = await client.query<{
      payments: string;
      audits: string;
      outbox: string;
      replays: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM fee_payments WHERE tenant_id = $1::uuid AND invoice_id = $2::uuid) AS payments,
         (SELECT count(*)::text FROM audit_events WHERE tenant_id = $1::uuid AND resource_type = 'fee_payment') AS audits,
         (SELECT count(*)::text FROM outbox_events WHERE tenant_id = $1::uuid AND aggregate_type = 'fee_payment') AS outbox,
         (SELECT count(*)::text FROM idempotency_records WHERE tenant_id = $1::uuid AND operation = 'fee.payment.collect') AS replays`,
      [tenant, invoiceId],
    );
    return result.rows[0];
  });
}
