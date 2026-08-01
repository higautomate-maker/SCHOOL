import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const tenantStatus = pgEnum("tenant_status", ["trial", "active", "suspended", "archived"]);
export const sessionStatus = pgEnum("academic_session_status", ["planned", "active", "closed"]);
export const userStatus = pgEnum("user_status", ["invited", "active", "locked", "disabled"]);
export const subscriptionStatus = pgEnum("subscription_status", ["trial", "active", "past_due", "cancelled"]);
export const policySource = pgEnum("policy_source", ["plan", "override"]);
export const invitationStatus = pgEnum("invitation_status", ["pending", "accepted", "expired", "revoked"]);
export const studentGender = pgEnum("student_gender", ["female", "male", "other"]);
export const studentStatus = pgEnum("student_status", ["active", "inactive", "graduated"]);
export const attendanceStatus = pgEnum("attendance_status", ["present", "absent", "late", "excused"]);
export const invoiceStatus = pgEnum("invoice_status", ["due", "partial", "paid", "waived"]);
export const paymentMethod = pgEnum("payment_method", ["cash", "card", "upi", "bank"]);
export const recordPriority = pgEnum("record_priority", ["low", "normal", "high", "urgent"]);
export const recordStatus = pgEnum("record_status", ["draft", "open", "in_progress", "completed", "cancelled"]);
export const subjectType = pgEnum("subject_type", ["core", "elective", "cocurricular"]);
export const outboxStatus = pgEnum("outbox_status", ["pending", "processing", "published", "failed"]);
export const membershipStatus = pgEnum("membership_status", ["invited", "active", "suspended", "revoked"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  status: tenantStatus("status").notNull(),
  countryCode: text("country_code").notNull().default("IN"),
  customDomain: text("custom_domain"),
  ...timestamps,
}, (table) => [
  uniqueIndex("tenants_slug_uq").on(table.slug),
  uniqueIndex("tenants_domain_uq").on(table.customDomain),
]);

export const campuses = pgTable("campuses", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  city: text("city"),
  ...timestamps,
}, (table) => [
  uniqueIndex("campuses_tenant_code_uq").on(table.tenantId, table.code),
  unique("campuses_tenant_id_uq").on(table.tenantId, table.id),
  index("campuses_tenant_idx").on(table.tenantId),
]);

export const academicSessions = pgTable("academic_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  startsOn: date("starts_on", { mode: "string" }).notNull(),
  endsOn: date("ends_on", { mode: "string" }).notNull(),
  status: sessionStatus("status").notNull().default("planned"),
  ...timestamps,
}, (table) => [
  uniqueIndex("academic_sessions_tenant_name_uq").on(table.tenantId, table.name),
  unique("academic_sessions_tenant_id_uq").on(table.tenantId, table.id),
  index("academic_sessions_tenant_status_idx").on(table.tenantId, table.status),
  check("academic_sessions_date_order_ck", sql`${table.endsOn} >= ${table.startsOn}`),
]);

export const schoolClasses = pgTable("school_classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  displayOrder: bigint("display_order", { mode: "number" }).notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...timestamps,
}, (table) => [
  uniqueIndex("school_classes_tenant_code_uq").on(table.tenantId, table.code),
  unique("school_classes_tenant_id_uq").on(table.tenantId, table.id),
  index("school_classes_tenant_order_idx").on(table.tenantId, table.displayOrder),
]);

export const classSections = pgTable("class_sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  classId: uuid("class_id").notNull(),
  name: text("name").notNull(),
  capacity: bigint("capacity", { mode: "number" }).notNull().default(40),
  ...timestamps,
}, (table) => [
  uniqueIndex("class_sections_class_name_uq").on(table.classId, table.name),
  unique("class_sections_tenant_id_uq").on(table.tenantId, table.id),
  index("class_sections_tenant_idx").on(table.tenantId),
  foreignKey({
    name: "class_sections_tenant_class_fk",
    columns: [table.tenantId, table.classId],
    foreignColumns: [schoolClasses.tenantId, schoolClasses.id],
  }),
  check("class_sections_capacity_ck", sql`${table.capacity} > 0`),
]);

export const subjects = pgTable("subjects", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  type: subjectType("type").notNull().default("core"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
}, (table) => [
  uniqueIndex("subjects_tenant_code_uq").on(table.tenantId, table.code),
  index("subjects_tenant_idx").on(table.tenantId),
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  fullName: text("full_name").notNull(),
  status: userStatus("status").notNull(),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  ...timestamps,
}, (table) => [uniqueIndex("users_email_uq").on(sql`lower(${table.email})`)]);

export const schoolSettings = pgTable("school_settings", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id),
  shortName: text("short_name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  principalName: text("principal_name").notNull().default(""),
  address: text("address").notNull().default(""),
  currencyCode: text("currency_code").notNull().default("INR"),
  admissionPrefix: text("admission_prefix").notNull().default("HIG"),
  receiptPrefix: text("receipt_prefix").notNull().default("RCPT"),
  updatedBy: uuid("updated_by").notNull().references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const schoolConfigurations = pgTable("school_configurations", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  configKey: text("config_key").notNull(),
  payload: jsonb("payload").notNull().default({}),
  updatedBy: uuid("updated_by").notNull().references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.tenantId, table.configKey] })]);

export const memberships = pgTable("memberships", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  roleKey: text("role_key").notNull(),
  campusId: uuid("campus_id"),
  status: membershipStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.tenantId, table.userId, table.roleKey] }),
  index("memberships_user_idx").on(table.userId),
  foreignKey({
    name: "memberships_tenant_campus_fk",
    columns: [table.tenantId, table.campusId],
    foreignColumns: [campuses.tenantId, campuses.id],
  }),
]);

export const authCredentials = pgTable("auth_credentials", {
  userId: uuid("user_id").primaryKey().references(() => users.id), passwordHash: text("password_hash").notNull(), credentialVersion: bigint("credential_version", { mode: "number" }).notNull().default(1), mustChangePassword: boolean("must_change_password").notNull().default(false), passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(), disabledAt: timestamp("disabled_at", { withTimezone: true }), ...timestamps,
});

export const authSessions = pgTable("auth_sessions", {
  id: uuid("id").primaryKey().defaultRandom(), tokenHash: text("token_hash").notNull(), userId: uuid("user_id").notNull().references(() => users.id), activeTenantId: uuid("active_tenant_id").references(() => tenants.id), credentialVersion: bigint("credential_version", { mode: "number" }).notNull(), csrfHash: text("csrf_hash").notNull(), issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(), lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(), idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(), absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(), revokedAt: timestamp("revoked_at", { withTimezone: true }), revokeReason: text("revoke_reason"), ipHash: text("ip_hash"), userAgentHash: text("user_agent_hash"),
}, (table) => [uniqueIndex("auth_sessions_token_hash_uq").on(table.tokenHash), index("auth_sessions_user_idx").on(table.userId), index("auth_sessions_expiry_idx").on(table.idleExpiresAt, table.absoluteExpiresAt)]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").notNull().references(() => users.id), tokenHash: text("token_hash").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), consumedAt: timestamp("consumed_at", { withTimezone: true }), requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(), ipHash: text("ip_hash"),
}, (table) => [uniqueIndex("password_reset_token_hash_uq").on(table.tokenHash), index("password_reset_expiry_idx").on(table.expiresAt)]);

export const platformRoleAssignments = pgTable("platform_role_assignments", {
  userId: uuid("user_id").notNull().references(() => users.id), roleKey: text("role_key").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.userId, table.roleKey] })]);

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  monthlyPricePaise: bigint("monthly_price_paise", { mode: "bigint" }).notNull(),
  annualPricePaise: bigint("annual_price_paise", { mode: "bigint" }).notNull(),
  active: boolean("active").notNull().default(true),
  ...timestamps,
}, (table) => [
  check("plans_monthly_price_ck", sql`${table.monthlyPricePaise} >= 0`),
  check("plans_annual_price_ck", sql`${table.annualPricePaise} >= 0`),
]);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  planId: uuid("plan_id").notNull().references(() => plans.id),
  status: subscriptionStatus("status").notNull(),
  periodEndsAt: timestamp("period_ends_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [
  index("subscriptions_tenant_idx").on(table.tenantId),
  index("subscriptions_status_idx").on(table.status),
]);

// Company-controlled entitlement layer. School role permissions remain in roles/role_permissions.
export const modulePolicies = pgTable("module_policies", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  moduleKey: text("module_key").notNull(),
  enabled: boolean("enabled").notNull(),
  source: policySource("source").notNull(),
  configuration: jsonb("configuration").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").notNull().references(() => users.id),
}, (table) => [
  primaryKey({ columns: [table.tenantId, table.moduleKey] }),
  index("module_policies_enabled_idx").on(table.tenantId, table.enabled),
]);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  actorId: uuid("actor_id").references(() => users.id),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  reason: text("reason"),
  ipHash: text("ip_hash"),
  metadata: jsonb("metadata").notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("audit_tenant_time_idx").on(table.tenantId, table.occurredAt),
  index("audit_actor_time_idx").on(table.actorId, table.occurredAt),
]);

export const schoolInvitations = pgTable("school_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  email: text("email").notNull(),
  roleKey: text("role_key").notNull(),
  tokenHash: text("token_hash").notNull(),
  status: invitationStatus("status").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  invitedBy: uuid("invited_by").notNull().references(() => users.id),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("school_invitations_tenant_email_uq").on(table.tenantId, sql`lower(${table.email})`),
  index("school_invitations_status_idx").on(table.status, table.expiresAt),
]);

export const idempotencyRecords = pgTable("idempotency_records", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  key: text("key").notNull(),
  actorEmail: text("actor_email").notNull(),
  operation: text("operation").notNull(),
  requestHash: text("request_hash").notNull(),
  response: jsonb("response").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.tenantId, table.key] }),
  uniqueIndex("idempotency_key_uq").on(table.key),
  index("idempotency_expiry_idx").on(table.expiresAt),
]);

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  key: text("key").notNull(),
  system: boolean("system").notNull().default(false),
  description: text("description").notNull().default(""),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  ...timestamps,
}, (table) => [
  uniqueIndex("roles_tenant_key_uq").on(table.tenantId, table.key),
  unique("roles_tenant_id_uq").on(table.tenantId, table.id),
  index("roles_tenant_idx").on(table.tenantId),
]);

export const rolePermissions = pgTable("role_permissions", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  roleId: uuid("role_id").notNull(),
  permission: text("permission").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.tenantId, table.roleId, table.permission] }),
  index("role_permissions_permission_idx").on(table.tenantId, table.permission),
  foreignKey({
    name: "role_permissions_tenant_role_fk",
    columns: [table.tenantId, table.roleId],
    foreignColumns: [roles.tenantId, roles.id],
  }),
]);

export const students = pgTable("students", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  campusId: uuid("campus_id").notNull(),
  academicSessionId: uuid("academic_session_id"),
  admissionNumber: text("admission_number").notNull(),
  rollNumber: text("roll_number").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull().default(""),
  gender: studentGender("gender").notNull(),
  dateOfBirth: date("date_of_birth", { mode: "string" }).notNull(),
  admissionDate: date("admission_date", { mode: "string" }).notNull(),
  className: text("class_name").notNull(),
  sectionName: text("section_name").notNull(),
  guardianName: text("guardian_name").notNull(),
  guardianPhone: text("guardian_phone").notNull(),
  status: studentStatus("status").notNull().default("active"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  ...timestamps,
}, (table) => [
  uniqueIndex("students_tenant_admission_uq").on(table.tenantId, table.admissionNumber),
  unique("students_tenant_id_uq").on(table.tenantId, table.id),
  index("students_tenant_class_idx").on(table.tenantId, table.className, table.sectionName),
  foreignKey({
    name: "students_tenant_campus_fk",
    columns: [table.tenantId, table.campusId],
    foreignColumns: [campuses.tenantId, campuses.id],
  }),
  foreignKey({
    name: "students_tenant_session_fk",
    columns: [table.tenantId, table.academicSessionId],
    foreignColumns: [academicSessions.tenantId, academicSessions.id],
  }),
]);

export const studentAttendance = pgTable("student_attendance", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  academicSessionId: uuid("academic_session_id").notNull(),
  studentId: uuid("student_id").notNull(),
  attendanceDate: date("attendance_date", { mode: "string" }).notNull(),
  status: attendanceStatus("status").notNull(),
  note: text("note").notNull().default(""),
  markedBy: uuid("marked_by").notNull().references(() => users.id),
  ...timestamps,
}, (table) => [
  uniqueIndex("attendance_student_date_uq").on(table.tenantId, table.studentId, table.attendanceDate),
  index("attendance_tenant_session_date_idx").on(table.tenantId, table.academicSessionId, table.attendanceDate),
  foreignKey({
    name: "attendance_tenant_session_fk",
    columns: [table.tenantId, table.academicSessionId],
    foreignColumns: [academicSessions.tenantId, academicSessions.id],
  }),
  foreignKey({
    name: "attendance_tenant_student_fk",
    columns: [table.tenantId, table.studentId],
    foreignColumns: [students.tenantId, students.id],
  }),
]);

export const feeInvoices = pgTable("fee_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  academicSessionId: uuid("academic_session_id").notNull(),
  studentId: uuid("student_id").notNull(),
  feeType: text("fee_type").notNull(),
  amountPaise: bigint("amount_paise", { mode: "bigint" }).notNull(),
  paidPaise: bigint("paid_paise", { mode: "bigint" }).notNull().default(sql`0`),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  status: invoiceStatus("status").notNull().default("due"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  ...timestamps,
}, (table) => [
  unique("fee_invoices_tenant_id_uq").on(table.tenantId, table.id),
  index("fee_invoices_tenant_session_idx").on(table.tenantId, table.academicSessionId),
  index("fee_invoices_student_idx").on(table.tenantId, table.studentId),
  index("fee_invoices_due_idx").on(table.tenantId, table.dueDate, table.status),
  foreignKey({
    name: "fee_invoices_tenant_session_fk",
    columns: [table.tenantId, table.academicSessionId],
    foreignColumns: [academicSessions.tenantId, academicSessions.id],
  }),
  foreignKey({
    name: "fee_invoices_tenant_student_fk",
    columns: [table.tenantId, table.studentId],
    foreignColumns: [students.tenantId, students.id],
  }),
  check("fee_invoices_amount_ck", sql`${table.amountPaise} >= 0 AND ${table.paidPaise} >= 0 AND ${table.paidPaise} <= ${table.amountPaise}`),
]);

export const feePayments = pgTable("fee_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  invoiceId: uuid("invoice_id").notNull(),
  studentId: uuid("student_id").notNull(),
  amountPaise: bigint("amount_paise", { mode: "bigint" }).notNull(),
  method: paymentMethod("method").notNull(),
  reference: text("reference").notNull().default(""),
  paidOn: timestamp("paid_on", { withTimezone: true }).notNull(),
  receivedBy: uuid("received_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("fee_payments_invoice_idx").on(table.tenantId, table.invoiceId),
  index("fee_payments_tenant_date_idx").on(table.tenantId, table.paidOn),
  foreignKey({
    name: "fee_payments_tenant_invoice_fk",
    columns: [table.tenantId, table.invoiceId],
    foreignColumns: [feeInvoices.tenantId, feeInvoices.id],
  }),
  foreignKey({
    name: "fee_payments_tenant_student_fk",
    columns: [table.tenantId, table.studentId],
    foreignColumns: [students.tenantId, students.id],
  }),
  check("fee_payments_amount_ck", sql`${table.amountPaise} > 0`),
]);

export const moduleRecords = pgTable("module_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  academicSessionId: uuid("academic_session_id"),
  moduleKey: text("module_key").notNull(),
  workflow: text("workflow").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  recordDate: date("record_date", { mode: "string" }).notNull(),
  dueDate: date("due_date", { mode: "string" }),
  amountPaise: bigint("amount_paise", { mode: "bigint" }),
  assignee: text("assignee").notNull().default(""),
  priority: recordPriority("priority").notNull().default("normal"),
  status: recordStatus("status").notNull().default("open"),
  metadata: jsonb("metadata").notNull().default({}),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  ...timestamps,
}, (table) => [
  index("module_records_tenant_module_idx").on(table.tenantId, table.moduleKey, table.status),
  index("module_records_session_idx").on(table.tenantId, table.academicSessionId),
  index("module_records_due_idx").on(table.tenantId, table.dueDate, table.status),
  foreignKey({
    name: "module_records_tenant_session_fk",
    columns: [table.tenantId, table.academicSessionId],
    foreignColumns: [academicSessions.tenantId, academicSessions.id],
  }),
  check("module_records_amount_ck", sql`${table.amountPaise} IS NULL OR ${table.amountPaise} >= 0`),
]);

// Transactional outbox supports attendance/fee/notices propagation to mobile apps.
export const outboxEvents = pgTable("outbox_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  topic: text("topic").notNull(),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: text("aggregate_id").notNull(),
  payload: jsonb("payload").notNull(),
  status: outboxStatus("status").notNull().default("pending"),
  attempts: bigint("attempts", { mode: "number" }).notNull().default(0),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  lastError: text("last_error"),
  ...timestamps,
}, (table) => [
  index("outbox_dispatch_idx").on(table.status, table.availableAt),
  index("outbox_tenant_aggregate_idx").on(table.tenantId, table.aggregateType, table.aggregateId),
  check("outbox_attempts_ck", sql`${table.attempts} >= 0`),
]);
