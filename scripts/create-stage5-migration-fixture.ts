import { readdirSync, readFileSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const outputPath = process.argv[2] ?? "/tmp/hig-stage5-source.sqlite";
const empty = process.argv.includes("--empty");
rmSync(outputPath, { force: true });

const database = new DatabaseSync(outputPath);
const now = "2026-07-30T12:00:00.000Z";
const ids = {
  user: "10000000-0000-4000-8000-000000000001",
  plan: "20000000-0000-4000-8000-000000000001",
  tenant: "30000000-0000-4000-8000-000000000001",
  campus: "40000000-0000-4000-8000-000000000001",
  session: "50000000-0000-4000-8000-000000000001",
  schoolClass: "60000000-0000-4000-8000-000000000001",
  section: "70000000-0000-4000-8000-000000000001",
  subject: "80000000-0000-4000-8000-000000000001",
  subscription: "90000000-0000-4000-8000-000000000001",
  role: "a0000000-0000-4000-8000-000000000001",
  student: "b0000000-0000-4000-8000-000000000001",
  attendance: "c0000000-0000-4000-8000-000000000001",
  invoice: "d0000000-0000-4000-8000-000000000001",
  payment: "e0000000-0000-4000-8000-000000000001",
  record: "f0000000-0000-4000-8000-000000000001",
  invitation: "11000000-0000-4000-8000-000000000001",
  audit: "12000000-0000-4000-8000-000000000001",
};

try {
  database.exec("PRAGMA foreign_keys = ON");
  for (const migration of readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort()) {
    const source = readFileSync(`drizzle/${migration}`, "utf8");
    for (const statement of source.split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  }

  const insert = (table: string, row: Record<string, unknown>) => {
    const columns = Object.keys(row);
    database.prepare(
      `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(", ")})
       VALUES (${columns.map(() => "?").join(", ")})`,
    ).run(...Object.values(row) as Array<string | number | null>);
  };

  if (empty) {
    database.close();
    console.log(`Empty Stage 5 SQLite production-repository schema created: ${outputPath}`);
    process.exit(0);
  }

  database.exec("BEGIN IMMEDIATE");
  insert("users", {
    id: ids.user, email: "stage5.admin@higschool.test", full_name: "Stage 5 Admin",
    status: "active", mfa_enabled: 1, created_at: now, updated_at: now,
  });
  insert("plans", {
    id: ids.plan, name: "Stage 5", monthly_price_paise: 500000,
    annual_price_paise: 5000000, active: 1, created_at: now, updated_at: now,
  });
  insert("tenants", {
    id: ids.tenant, name: "HIG Stage 5 School", slug: "hig-stage-5-school",
    status: "active", country_code: "IN", custom_domain: null,
    created_at: now, updated_at: now,
  });
  insert("campuses", {
    id: ids.campus, tenant_id: ids.tenant, name: "Main Campus", code: "MAIN",
    city: "Gurugram", created_at: now, updated_at: now,
  });
  insert("academic_sessions", {
    id: ids.session, tenant_id: ids.tenant, name: "2026-27",
    starts_on: "2026-04-01", ends_on: "2027-03-31", status: "active",
    created_at: now, updated_at: now,
  });
  insert("school_classes", {
    id: ids.schoolClass, tenant_id: ids.tenant, name: "Class 9", code: "IX",
    display_order: 9, active: 1, created_at: now, updated_at: now,
  });
  insert("class_sections", {
    id: ids.section, tenant_id: ids.tenant, class_id: ids.schoolClass,
    name: "A", capacity: 40, created_at: now, updated_at: now,
  });
  insert("subjects", {
    id: ids.subject, tenant_id: ids.tenant, name: "Mathematics", code: "MATH",
    type: "core", active: 1, created_at: now, updated_at: now,
  });
  insert("school_settings", {
    tenant_id: ids.tenant, short_name: "HIG S5", email: "school@higschool.test",
    phone: "+91 9876543210", principal_name: "Demo Principal", address: "Gurugram",
    currency_code: "INR", admission_prefix: "HIG", receipt_prefix: "RCT",
    updated_by: ids.user, updated_at: now,
  });
  insert("school_configurations", {
    tenant_id: ids.tenant, config_key: "notification_settings",
    payload_json: JSON.stringify({ attendanceAlerts: true }),
    updated_by: ids.user, updated_at: now,
  });
  insert("subscriptions", {
    id: ids.subscription, tenant_id: ids.tenant, plan_id: ids.plan,
    status: "active", period_ends_at: "2027-07-30T12:00:00.000Z",
    created_at: now, updated_at: now,
  });
  insert("memberships", {
    tenant_id: ids.tenant, user_id: ids.user, role_key: "school_admin",
    campus_id: ids.campus, created_at: now,
  });
  insert("module_policies", {
    tenant_id: ids.tenant, module_key: "student_information", enabled: 1,
    source: "plan", updated_at: now, updated_by: ids.user,
  });
  insert("roles", {
    id: ids.role, tenant_id: ids.tenant, name: "School Admin", key: "school_admin",
    system: 1, description: "Stage 5 fixture", created_by: ids.user,
    created_at: now, updated_at: now,
  });
  insert("role_permissions", {
    role_id: ids.role, permission: "students.view", created_at: now,
  });
  insert("students", {
    id: ids.student, tenant_id: ids.tenant, campus_id: ids.campus,
    academic_session_id: ids.session, admission_number: "HIG-001", roll_number: "9A-01",
    first_name: "Aarav", last_name: "Mehta", gender: "male",
    date_of_birth: "2012-05-12", admission_date: "2026-04-01",
    class_name: "Class 9", section_name: "A", guardian_name: "Rohan Mehta",
    guardian_phone: "+91 9876543210", status: "active", created_by: ids.user,
    created_at: now, updated_at: now,
  });
  insert("student_attendance", {
    id: ids.attendance, tenant_id: ids.tenant, academic_session_id: ids.session,
    student_id: ids.student, attendance_date: "2026-07-30", status: "present",
    note: "Stage 5 fixture", marked_by: ids.user, created_at: now, updated_at: now,
  });
  insert("fee_invoices", {
    id: ids.invoice, tenant_id: ids.tenant, academic_session_id: ids.session,
    student_id: ids.student, fee_type: "Tuition", amount_paise: 100000,
    paid_paise: 40000, due_date: "2026-08-15", status: "partial",
    created_by: ids.user, created_at: now, updated_at: now,
  });
  insert("fee_payments", {
    id: ids.payment, tenant_id: ids.tenant, invoice_id: ids.invoice,
    student_id: ids.student, amount_paise: 40000, method: "upi",
    reference: "STAGE5-UPI-001", paid_on: now, received_by: ids.user, created_at: now,
  });
  insert("module_records", {
    id: ids.record, tenant_id: ids.tenant, academic_session_id: ids.session,
    module_key: "communication", workflow: "notice", title: "Stage 5 notice",
    description: "Fixture", record_date: "2026-07-30", due_date: null,
    amount_paise: 0, assignee: "All", priority: "normal", status: "open",
    metadata_json: JSON.stringify({ audience: "all" }), created_by: ids.user,
    created_at: now, updated_at: now,
  });
  insert("school_invitations", {
    id: ids.invitation, tenant_id: ids.tenant, email: "invite@higschool.test",
    role_key: "teacher", token_hash: "stage5-token-hash", status: "pending",
    expires_at: "2026-08-06T12:00:00.000Z", invited_by: ids.user,
    accepted_at: null, created_at: now, updated_at: now,
  });
  insert("audit_events", {
    id: ids.audit, tenant_id: ids.tenant, actor_id: ids.user, action: "stage5.fixture",
    resource_type: "tenant", resource_id: ids.tenant, reason: "Integration fixture",
    ip_hash: null, metadata_json: JSON.stringify({ stage: 5 }), occurred_at: now,
  });
  insert("idempotency_records", {
    key: "stage5-fixture", actor_email: "stage5.admin@higschool.test",
    operation: "school.create", response_json: JSON.stringify({ tenantId: ids.tenant }),
    created_at: now, expires_at: "2027-07-30T12:00:00.000Z",
  });
  database.exec("COMMIT");
  console.log(`Stage 5 SQLite migration fixture created: ${outputPath}`);
} catch (error) {
  try {
    database.exec("ROLLBACK");
  } catch {
    // The transaction may not have started if schema creation failed.
  }
  throw error;
} finally {
  database.close();
}
