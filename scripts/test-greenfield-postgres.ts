import assert from "node:assert/strict";
import {
  getPostgresPool,
  withPlatformReadDatabase,
  withTenantDatabase,
} from "../server/runtime/postgres.ts";
import {
  createPostgresSchool,
  findPostgresSchoolCreationReplay,
} from "../server/schools/postgres-repository.ts";
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
} from "../server/students/postgres-repository.ts";
import {
  applyPostgresOperation,
  getPostgresOperations,
} from "../server/operations/postgres-repository.ts";
import {
  applyPostgresWorkspaceAction,
  getPostgresWorkspace,
} from "../server/workspace/postgres-repository.ts";

const actor = {
  displayName: "Greenfield Platform Administrator",
  email: "greenfield.platform@higschool.test",
  fullName: "Greenfield Platform Administrator",
};
const schoolInput = {
  name: "HIG Greenfield Acceptance School",
  city: "Gurugram",
  plan: "Growth" as const,
  adminEmail: "greenfield.school.admin@higschool.test",
};

try {
  const before = await withPlatformReadDatabase(
    async (_database, client) => client.query<{
      users: string;
      plans: string;
      tenants: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM users) AS users,
         (SELECT count(*)::text FROM plans) AS plans,
         (SELECT count(*)::text FROM tenants) AS tenants`,
    ),
  );
  assert.deepEqual(before.rows[0], { users: "0", plans: "0", tenants: "0" });

  const school = await createPostgresSchool(
    schoolInput,
    actor,
    "greenfield-school-create",
  );
  const replay = await createPostgresSchool(
    schoolInput,
    actor,
    "greenfield-school-create",
  );
  assert.deepEqual(replay, school);
  assert.deepEqual(
    await findPostgresSchoolCreationReplay(
      "greenfield-school-create",
      actor.email,
    ),
    school,
  );

  const onboarding = await tenantCounts(school.tenantId);
  assert.deepEqual(onboarding, {
    tenants: "1",
    campuses: "1",
    subscriptions: "1",
    memberships: "1",
    modules: "8",
    invitations: "1",
    schoolAudits: "1",
    schoolReplays: "1",
  });

  if (process.env.HIG_GREENFIELD_ROLLBACK_TRIGGER_READY === "true") {
    await assert.rejects(
      () => createPostgresSchool(
        {
          name: "HIG Greenfield Rollback School",
          city: "Noida",
          plan: "Starter",
          adminEmail: "greenfield.rollback@higschool.test",
        },
        actor,
        "greenfield-school-rollback",
      ),
      /intentional greenfield onboarding rollback/,
    );
    const rolledBack = await withPlatformReadDatabase(
      async (_database, client) => client.query<{
        tenants: string;
        users: string;
        plans: string;
      }>(
        `SELECT
           (SELECT count(*)::text FROM tenants WHERE name = $1::text) AS tenants,
           (SELECT count(*)::text FROM users WHERE email = $2::text) AS users,
           (SELECT count(*)::text FROM plans WHERE name = $3::text) AS plans`,
        [
          "HIG Greenfield Rollback School",
          "greenfield.rollback@higschool.test",
          "Starter",
        ],
      ),
    );
    assert.deepEqual(rolledBack.rows[0], {
      tenants: "0",
      users: "0",
      plans: "0",
    });
  }

  const configuration = await applyPostgresConfigurationAction(
    school.tenantId,
    {
      action: "update_document",
      configKey: "notification_settings",
      payload: { attendanceAlerts: true, sender: "HIG Greenfield" },
    },
    actor,
  );
  assert.deepEqual(
    configuration.documents.notification_settings,
    { attendanceAlerts: true, sender: "HIG Greenfield" },
  );
  assert.deepEqual(await getPostgresConfiguration(school.tenantId), configuration);

  await applyPostgresFoundationAction(
    school.tenantId,
    {
      action: "create_session",
      name: "2026-27",
      startsOn: "2026-04-01",
      endsOn: "2027-03-31",
      activate: true,
    },
    actor,
  );
  await applyPostgresFoundationAction(
    school.tenantId,
    {
      action: "create_class",
      name: "Class 8",
      code: "VIII",
      sections: ["A"],
      capacity: 40,
    },
    actor,
  );
  await applyPostgresFoundationAction(
    school.tenantId,
    {
      action: "create_subject",
      name: "Science",
      code: "SCI",
      type: "core",
    },
    actor,
  );
  const foundation = await getPostgresFoundation(school.tenantId);
  const academicSession = foundation.sessions.find(
    (session) => session.name === "2026-27",
  );
  assert.equal(academicSession?.startsOn, "2026-04-01");
  assert.equal(academicSession?.endsOn, "2027-03-31");
  const schoolClass = foundation.classes.find(
    (record) => record.code === "VIII",
  );
  assert.ok(schoolClass?.sections.some((section) => section.name === "A"));
  assert.ok(foundation.subjects.some((subject) => subject.code === "SCI"));

  const onboardingRoles = await listPostgresRoles(school.tenantId, actor);
  const schoolAdminRole = onboardingRoles.find(
    (role) => role.key === "school_admin",
  );
  assert.ok(schoolAdminRole);
  assert.equal(schoolAdminRole.system, true);
  assert.equal(
    onboardingRoles.filter((role) => role.key === "school_admin").length,
    1,
  );

  const roles = await applyPostgresRoleAction(
    school.tenantId,
    {
      action: "create",
      name: "Greenfield Teacher",
      permissions: ["students.view", "attendance.manage"],
    },
    actor,
  );
  const createdTeacher = roles.find(
    (role) => role.name === "Greenfield Teacher",
  );
  assert.ok(createdTeacher);
  assert.match(createdTeacher.key, /^greenfield_teacher_[0-9a-f]{5}$/);
  assert.equal(createdTeacher.system, false);
  assert.deepEqual(
    createdTeacher.permissions,
    ["attendance.manage", "students.view"],
  );

  const persistedRoles = await listPostgresRoles(school.tenantId, actor);
  const persistedSchoolAdmin = persistedRoles.find(
    (role) => role.key === "school_admin",
  );
  const persistedTeacher = persistedRoles.find(
    (role) => role.key === createdTeacher.key,
  );
  assert.ok(persistedSchoolAdmin);
  assert.equal(persistedSchoolAdmin.system, true);
  assert.ok(persistedTeacher);
  assert.equal(persistedTeacher.system, false);
  assert.deepEqual(
    persistedTeacher.permissions,
    ["attendance.manage", "students.view"],
  );
  assert.equal(persistedRoles.length, 2);
  assert.equal(new Set(persistedRoles.map((role) => role.key)).size, 2);
  assert.equal(
    persistedRoles.filter((role) => role.key === "school_admin").length,
    1,
  );
  assert.equal(
    persistedRoles.filter((role) => role.key === createdTeacher.key).length,
    1,
  );

  const studentInput = {
    admissionNumber: "GF-001",
    rollNumber: "8A-01",
    firstName: "Anaya",
    lastName: "Sharma",
    gender: "female" as const,
    dateOfBirth: "2013-06-15",
    admissionDate: "2026-04-01",
    className: "Class 8",
    sectionName: "A",
    guardianName: "Riya Sharma",
    guardianPhone: "+91 9876543210",
  };
  const student = await createPostgresStudent(
    school.tenantId,
    studentInput,
    actor,
    "greenfield-student-create",
  );
  assert.equal(student.dateOfBirth, "2013-06-15");
  assert.equal(student.admissionDate, "2026-04-01");
  assert.ok(Number.isFinite(Date.parse(student.createdAt)));
  assert.deepEqual(
    await findPostgresStudentReplay(
      school.tenantId,
      "greenfield-student-create",
      actor.email,
    ),
    student,
  );

  const attended = await applyPostgresOperation(
    school.tenantId,
    {
      action: "mark_attendance",
      studentId: student.id,
      attendanceDate: "2026-07-30",
      status: "present",
      note: "Greenfield acceptance",
    },
    actor,
    "greenfield-attendance",
  );
  assert.equal(
    attended.attendance.find(
      (record) => record.studentId === student.id,
    )?.attendanceDate,
    "2026-07-30",
  );
  assert.deepEqual(
    await applyPostgresOperation(
      school.tenantId,
      {
        action: "mark_attendance",
        studentId: student.id,
        attendanceDate: "2026-07-30",
        status: "present",
        note: "Greenfield acceptance",
      },
      actor,
      "greenfield-attendance",
    ),
    attended,
  );

  const invoiced = await applyPostgresOperation(
    school.tenantId,
    {
      action: "create_invoice",
      studentId: student.id,
      feeType: "Greenfield Tuition",
      amountPaise: 100_001,
      dueDate: "2026-08-15",
    },
    actor,
    "greenfield-invoice",
  );
  const invoice = invoiced.invoices.find(
    (record) => record.feeType === "Greenfield Tuition",
  );
  assert.ok(invoice);
  assert.equal(invoice.amountPaise, 100_001);
  assert.equal(invoice.dueDate, "2026-08-15");
  assert.ok(Number.isFinite(Date.parse(invoice.createdAt)));

  const paid = await applyPostgresOperation(
    school.tenantId,
    {
      action: "record_payment",
      invoiceId: invoice.id,
      amountPaise: 40_001,
      method: "upi",
      reference: "GF-UPI-001",
    },
    actor,
    "greenfield-payment",
  );
  assert.equal(
    paid.invoices.find((record) => record.id === invoice.id)?.paidPaise,
    40_001,
  );
  const payment = paid.payments.find(
    (record) => record.reference === "GF-UPI-001",
  );
  assert.equal(payment?.amountPaise, 40_001);
  assert.ok(Number.isFinite(Date.parse(payment!.paidOn)));
  assert.deepEqual(
    await applyPostgresOperation(
      school.tenantId,
      {
        action: "record_payment",
        invoiceId: invoice.id,
        amountPaise: 40_001,
        method: "upi",
        reference: "GF-UPI-001",
      },
      actor,
      "greenfield-payment",
    ),
    paid,
  );
  await assert.rejects(
    () => applyPostgresOperation(
      school.tenantId,
      {
        action: "record_payment",
        invoiceId: invoice.id,
        amountPaise: 60_001,
        method: "cash",
        reference: "GF-OVERPAY",
      },
      actor,
      "greenfield-overpay",
    ),
    /exceeds the outstanding balance/,
  );

  const workspace = await applyPostgresWorkspaceAction(
    school.tenantId,
    {
      action: "create_record",
      moduleKey: "Communicate",
      workflow: "notice",
      title: "Greenfield welcome notice",
      description: "First-school acceptance",
      recordDate: "2026-07-30",
      dueDate: "2026-08-01",
      amountPaise: 12_345,
      assignee: "All",
      priority: "normal",
    },
    actor,
  );
  const welcomeRecord = workspace.records.find(
    (record) => record.title === "Greenfield welcome notice",
  );
  assert.equal(welcomeRecord?.recordDate, "2026-07-30");
  assert.equal(welcomeRecord?.dueDate, "2026-08-01");
  assert.equal(welcomeRecord?.amountPaise, 12_345);
  assert.ok(Number.isFinite(Date.parse(welcomeRecord!.createdAt)));
  assert.equal(
    (await getPostgresWorkspace(school.tenantId, "Communicate")).records.length,
    1,
  );

  const state = await getPostgresOperations(school.tenantId);
  assert.equal(state.attendance.length, 1);
  assert.equal(state.invoices.length, 1);
  assert.equal(state.payments.length, 1);

  const isolationSchool = await createPostgresSchool(
    {
      name: "HIG Greenfield Isolation School",
      city: "Jaipur",
      plan: "Starter",
      adminEmail: "greenfield.isolation@higschool.test",
    },
    actor,
    "greenfield-isolation-school-create",
  );
  const otherTenant = isolationSchool.tenantId;
  const isolation = await withTenantDatabase(
    otherTenant,
    async (_database, client) => {
      const students = await client.query(
        "SELECT id FROM students WHERE tenant_id = $1::uuid",
        [school.tenantId],
      );
      const writes = await client.query(
        `UPDATE fee_invoices
         SET paid_paise = 0
         WHERE tenant_id = $1::uuid
           AND id = $2::uuid`,
        [school.tenantId, invoice.id],
      );
      return { students: students.rowCount, writes: writes.rowCount };
    },
  );
  assert.deepEqual(isolation, { students: 0, writes: 0 });

  const final = await withTenantDatabase(
    school.tenantId,
    async (_database, client) => {
      const result = await client.query<{
        tenants: string;
        campuses: string;
        subscriptions: string;
        memberships: string;
        modules: string;
        invitations: string;
        configurations: string;
        sessions: string;
        classes: string;
        sections: string;
        subjects: string;
        roles: string;
        permissions: string;
        students: string;
        attendance: string;
        invoices: string;
        payments: string;
        workspace: string;
        audits: string;
        outbox: string;
        replays: string;
        invoicePaise: string;
        paidPaise: string;
        paymentPaise: string;
        outstandingPaise: string;
      }>(
        `SELECT
           (SELECT count(*)::text FROM tenants WHERE id = $1::uuid) AS tenants,
           (SELECT count(*)::text FROM campuses WHERE tenant_id = $1::uuid) AS campuses,
           (SELECT count(*)::text FROM subscriptions WHERE tenant_id = $1::uuid) AS subscriptions,
           (SELECT count(*)::text FROM memberships WHERE tenant_id = $1::uuid) AS memberships,
           (SELECT count(*)::text FROM module_policies WHERE tenant_id = $1::uuid) AS modules,
           (SELECT count(*)::text FROM school_invitations WHERE tenant_id = $1::uuid) AS invitations,
           (SELECT count(*)::text FROM school_configurations WHERE tenant_id = $1::uuid) AS configurations,
           (SELECT count(*)::text FROM academic_sessions WHERE tenant_id = $1::uuid) AS sessions,
           (SELECT count(*)::text FROM school_classes WHERE tenant_id = $1::uuid) AS classes,
           (SELECT count(*)::text FROM class_sections WHERE tenant_id = $1::uuid) AS sections,
           (SELECT count(*)::text FROM subjects WHERE tenant_id = $1::uuid) AS subjects,
           (SELECT count(*)::text FROM roles WHERE tenant_id = $1::uuid) AS roles,
           (SELECT count(*)::text FROM role_permissions WHERE tenant_id = $1::uuid) AS permissions,
           (SELECT count(*)::text FROM students WHERE tenant_id = $1::uuid) AS students,
           (SELECT count(*)::text FROM student_attendance WHERE tenant_id = $1::uuid) AS attendance,
           (SELECT count(*)::text FROM fee_invoices WHERE tenant_id = $1::uuid) AS invoices,
           (SELECT count(*)::text FROM fee_payments WHERE tenant_id = $1::uuid) AS payments,
           (SELECT count(*)::text FROM module_records WHERE tenant_id = $1::uuid) AS workspace,
           (SELECT count(*)::text FROM audit_events WHERE tenant_id = $1::uuid) AS audits,
           (SELECT count(*)::text FROM outbox_events WHERE tenant_id = $1::uuid) AS outbox,
           (SELECT count(*)::text FROM idempotency_records WHERE tenant_id = $1::uuid) AS replays,
           (SELECT coalesce(sum(amount_paise), 0)::text FROM fee_invoices WHERE tenant_id = $1::uuid) AS "invoicePaise",
           (SELECT coalesce(sum(paid_paise), 0)::text FROM fee_invoices WHERE tenant_id = $1::uuid) AS "paidPaise",
           (SELECT coalesce(sum(amount_paise), 0)::text FROM fee_payments WHERE tenant_id = $1::uuid) AS "paymentPaise",
           (SELECT coalesce(sum(amount_paise - paid_paise), 0)::text FROM fee_invoices WHERE tenant_id = $1::uuid) AS "outstandingPaise"`,
        [school.tenantId],
      );
      return result.rows[0];
    },
  );
  assert.deepEqual(final, {
    tenants: "1",
    campuses: "1",
    subscriptions: "1",
    memberships: "1",
    modules: "8",
    invitations: "1",
    configurations: "1",
    sessions: "1",
    classes: "1",
    sections: "1",
    subjects: "1",
    roles: "2",
    permissions: "22",
    students: "1",
    attendance: "1",
    invoices: "1",
    payments: "1",
    workspace: "1",
    audits: "11",
    outbox: "3",
    replays: "5",
    invoicePaise: "100001",
    paidPaise: "40001",
    paymentPaise: "40001",
    outstandingPaise: "60000",
  });

  console.log(
    `Greenfield PostgreSQL first-school creation, full business flow, reconciliation, rollback, replay, RLS, and tenant-isolation checks passed. Tenant: ${school.tenantId}`,
  );
} finally {
  await getPostgresPool().end();
}

async function tenantCounts(tenantId: string) {
  return withTenantDatabase(tenantId, async (_database, client) => {
    const result = await client.query<{
      tenants: string;
      campuses: string;
      subscriptions: string;
      memberships: string;
      modules: string;
      invitations: string;
      schoolAudits: string;
      schoolReplays: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM tenants WHERE id = $1::uuid) AS tenants,
         (SELECT count(*)::text FROM campuses WHERE tenant_id = $1::uuid) AS campuses,
         (SELECT count(*)::text FROM subscriptions WHERE tenant_id = $1::uuid) AS subscriptions,
         (SELECT count(*)::text FROM memberships WHERE tenant_id = $1::uuid) AS memberships,
         (SELECT count(*)::text FROM module_policies WHERE tenant_id = $1::uuid) AS modules,
         (SELECT count(*)::text FROM school_invitations WHERE tenant_id = $1::uuid) AS invitations,
         (SELECT count(*)::text FROM audit_events WHERE tenant_id = $1::uuid AND action = 'school.create') AS "schoolAudits",
         (SELECT count(*)::text FROM idempotency_records WHERE tenant_id = $1::uuid AND operation = 'school.create') AS "schoolReplays"`,
      [tenantId],
    );
    return result.rows[0];
  });
}
