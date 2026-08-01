import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  status: text("status", { enum: ["trial", "active", "suspended", "archived"] }).notNull(),
  countryCode: text("country_code").notNull().default("IN"),
  customDomain: text("custom_domain"),
  ...timestamps,
}, (table) => [uniqueIndex("tenants_slug_uq").on(table.slug), uniqueIndex("tenants_domain_uq").on(table.customDomain)]);

export const campuses = sqliteTable("campuses", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => tenants.id), name: text("name").notNull(), code: text("code").notNull(), city: text("city"), ...timestamps,
}, (table) => [uniqueIndex("campuses_tenant_code_uq").on(table.tenantId, table.code), index("campuses_tenant_idx").on(table.tenantId)]);

export const academicSessions = sqliteTable("academic_sessions", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  startsOn: text("starts_on").notNull(),
  endsOn: text("ends_on").notNull(),
  status: text("status", { enum: ["planned", "active", "closed"] }).notNull().default("planned"),
  ...timestamps,
}, (table) => [uniqueIndex("academic_sessions_tenant_name_uq").on(table.tenantId, table.name), index("academic_sessions_tenant_status_idx").on(table.tenantId, table.status)]);

export const schoolClasses = sqliteTable("school_classes", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => tenants.id), name: text("name").notNull(), code: text("code").notNull(), displayOrder: integer("display_order").notNull().default(0), active: integer("active", { mode: "boolean" }).notNull().default(true), ...timestamps,
}, (table) => [uniqueIndex("school_classes_tenant_code_uq").on(table.tenantId, table.code), index("school_classes_tenant_order_idx").on(table.tenantId, table.displayOrder)]);

export const classSections = sqliteTable("class_sections", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => tenants.id), classId: text("class_id").notNull().references(() => schoolClasses.id), name: text("name").notNull(), capacity: integer("capacity").notNull().default(40), ...timestamps,
}, (table) => [uniqueIndex("class_sections_class_name_uq").on(table.classId, table.name), index("class_sections_tenant_idx").on(table.tenantId)]);

export const subjects = sqliteTable("subjects", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => tenants.id), name: text("name").notNull(), code: text("code").notNull(), type: text("type", { enum: ["core", "elective", "cocurricular"] }).notNull().default("core"), active: integer("active", { mode: "boolean" }).notNull().default(true), ...timestamps,
}, (table) => [uniqueIndex("subjects_tenant_code_uq").on(table.tenantId, table.code), index("subjects_tenant_idx").on(table.tenantId)]);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), email: text("email").notNull(), fullName: text("full_name").notNull(), status: text("status", { enum: ["invited", "active", "locked", "disabled"] }).notNull(), mfaEnabled: integer("mfa_enabled", { mode: "boolean" }).notNull().default(false), ...timestamps,
}, (table) => [uniqueIndex("users_email_uq").on(sql`lower(${table.email})`)]);

export const schoolSettings = sqliteTable("school_settings", {
  tenantId: text("tenant_id").primaryKey().references(() => tenants.id),
  shortName: text("short_name").notNull().default(""), email: text("email").notNull().default(""), phone: text("phone").notNull().default(""), principalName: text("principal_name").notNull().default(""), address: text("address").notNull().default(""), currencyCode: text("currency_code").notNull().default("INR"), admissionPrefix: text("admission_prefix").notNull().default("HIG"), receiptPrefix: text("receipt_prefix").notNull().default("RCPT"), updatedBy: text("updated_by").notNull().references(() => users.id), updatedAt: text("updated_at").notNull(),
});

export const schoolConfigurations = sqliteTable("school_configurations", {
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  configKey: text("config_key").notNull(),
  payloadJson: text("payload_json").notNull().default("{}"),
  updatedBy: text("updated_by").notNull().references(() => users.id),
  updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.tenantId, table.configKey] })]);

export const memberships = sqliteTable("memberships", {
  tenantId: text("tenant_id").notNull().references(() => tenants.id), userId: text("user_id").notNull().references(() => users.id), roleKey: text("role_key").notNull(), campusId: text("campus_id").references(() => campuses.id), status: text("status", { enum: ["invited", "active", "suspended", "revoked"] }).notNull().default("active"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull().default("1970-01-01T00:00:00.000Z"),
}, (table) => [primaryKey({ columns: [table.tenantId, table.userId, table.roleKey] }), index("memberships_user_idx").on(table.userId)]);

export const authCredentials = sqliteTable("auth_credentials", {
  userId: text("user_id").primaryKey().references(() => users.id), passwordHash: text("password_hash").notNull(), credentialVersion: integer("credential_version").notNull().default(1), mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false), passwordChangedAt: text("password_changed_at").notNull(), disabledAt: text("disabled_at"), ...timestamps,
});

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(), tokenHash: text("token_hash").notNull(), userId: text("user_id").notNull().references(() => users.id), activeTenantId: text("active_tenant_id").references(() => tenants.id), credentialVersion: integer("credential_version").notNull(), csrfHash: text("csrf_hash").notNull(), issuedAt: text("issued_at").notNull(), lastSeenAt: text("last_seen_at").notNull(), idleExpiresAt: text("idle_expires_at").notNull(), absoluteExpiresAt: text("absolute_expires_at").notNull(), revokedAt: text("revoked_at"), revokeReason: text("revoke_reason"), ipHash: text("ip_hash"), userAgentHash: text("user_agent_hash"),
}, (table) => [uniqueIndex("auth_sessions_token_hash_uq").on(table.tokenHash), index("auth_sessions_user_idx").on(table.userId), index("auth_sessions_expiry_idx").on(table.idleExpiresAt, table.absoluteExpiresAt)]);

export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => users.id), tokenHash: text("token_hash").notNull(), expiresAt: text("expires_at").notNull(), consumedAt: text("consumed_at"), requestedAt: text("requested_at").notNull(), ipHash: text("ip_hash"),
}, (table) => [uniqueIndex("password_reset_token_hash_uq").on(table.tokenHash), index("password_reset_expiry_idx").on(table.expiresAt)]);

export const platformRoleAssignments = sqliteTable("platform_role_assignments", {
  userId: text("user_id").notNull().references(() => users.id), roleKey: text("role_key").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.roleKey] })]);

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(), name: text("name").notNull(), monthlyPricePaise: integer("monthly_price_paise").notNull(), annualPricePaise: integer("annual_price_paise").notNull(), active: integer("active", { mode: "boolean" }).notNull().default(true), ...timestamps,
});

export const planModulePolicies = sqliteTable("plan_module_policies", {
  planId: text("plan_id").notNull().references(() => plans.id),
  moduleKey: text("module_key").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  configuration: text("configuration").notNull().default("{}"),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull().references(() => users.id),
}, (table) => [primaryKey({ columns: [table.planId, table.moduleKey] }), index("plan_module_policies_enabled_idx").on(table.planId, table.enabled)]);

export const planAppFeaturePolicies = sqliteTable("plan_app_feature_policies", {
  planId: text("plan_id").notNull().references(() => plans.id),
  audience: text("audience", { enum: ["parent", "student", "transporter"] }).notNull(),
  featureKey: text("feature_key").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  configuration: text("configuration").notNull().default("{}"),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull().references(() => users.id),
}, (table) => [primaryKey({ columns: [table.planId, table.audience, table.featureKey] }), index("plan_app_feature_policies_enabled_idx").on(table.planId, table.audience, table.enabled)]);

export const tenantAppFeaturePolicies = sqliteTable("tenant_app_feature_policies", {
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  audience: text("audience", { enum: ["parent", "student", "transporter"] }).notNull(),
  featureKey: text("feature_key").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  source: text("source", { enum: ["plan", "override"] }).notNull(),
  configuration: text("configuration").notNull().default("{}"),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull().references(() => users.id),
}, (table) => [primaryKey({ columns: [table.tenantId, table.audience, table.featureKey] }), index("tenant_app_feature_policies_enabled_idx").on(table.tenantId, table.audience, table.enabled)]);

export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => tenants.id), planId: text("plan_id").notNull().references(() => plans.id), status: text("status", { enum: ["trial", "active", "past_due", "cancelled"] }).notNull(), periodEndsAt: text("period_ends_at").notNull(), ...timestamps,
}, (table) => [index("subscriptions_tenant_idx").on(table.tenantId), index("subscriptions_status_idx").on(table.status)]);

export const modulePolicies = sqliteTable("module_policies", {
  tenantId: text("tenant_id").notNull().references(() => tenants.id), moduleKey: text("module_key").notNull(), enabled: integer("enabled", { mode: "boolean" }).notNull(), source: text("source", { enum: ["plan", "override"] }).notNull(), updatedAt: text("updated_at").notNull(), updatedBy: text("updated_by").notNull().references(() => users.id),
}, (table) => [primaryKey({ columns: [table.tenantId, table.moduleKey] })]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").references(() => tenants.id), actorId: text("actor_id").references(() => users.id), action: text("action").notNull(), resourceType: text("resource_type").notNull(), resourceId: text("resource_id"), reason: text("reason"), ipHash: text("ip_hash"), metadataJson: text("metadata_json").notNull().default("{}"), occurredAt: text("occurred_at").notNull(),
}, (table) => [index("audit_tenant_time_idx").on(table.tenantId, table.occurredAt), index("audit_actor_time_idx").on(table.actorId, table.occurredAt)]);

export const schoolInvitations = sqliteTable("school_invitations", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  email: text("email").notNull(),
  roleKey: text("role_key").notNull(),
  tokenHash: text("token_hash").notNull(),
  status: text("status", { enum: ["pending", "accepted", "expired", "revoked"] }).notNull(),
  expiresAt: text("expires_at").notNull(),
  invitedBy: text("invited_by").notNull().references(() => users.id),
  acceptedAt: text("accepted_at"),
  ...timestamps,
}, (table) => [uniqueIndex("school_invitations_tenant_email_uq").on(table.tenantId, table.email), index("school_invitations_status_idx").on(table.status, table.expiresAt)]);

export const idempotencyRecords = sqliteTable("idempotency_records", {
  key: text("key").primaryKey(),
  actorEmail: text("actor_email").notNull(),
  operation: text("operation").notNull(),
  responseJson: text("response_json").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
}, (table) => [index("idempotency_expiry_idx").on(table.expiresAt)]);

export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  key: text("key").notNull(),
  system: integer("system", { mode: "boolean" }).notNull().default(false),
  description: text("description").notNull().default(""),
  createdBy: text("created_by").notNull().references(() => users.id),
  ...timestamps,
}, (table) => [uniqueIndex("roles_tenant_key_uq").on(table.tenantId, table.key), index("roles_tenant_idx").on(table.tenantId)]);

export const rolePermissions = sqliteTable("role_permissions", {
  roleId: text("role_id").notNull().references(() => roles.id),
  permission: text("permission").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.roleId, table.permission] }), index("role_permissions_permission_idx").on(table.permission)]);

export const students = sqliteTable("students", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  campusId: text("campus_id").notNull().references(() => campuses.id),
  academicSessionId: text("academic_session_id").references(() => academicSessions.id),
  admissionNumber: text("admission_number").notNull(),
  rollNumber: text("roll_number").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull().default(""),
  gender: text("gender", { enum: ["female", "male", "other"] }).notNull(),
  dateOfBirth: text("date_of_birth").notNull(),
  admissionDate: text("admission_date").notNull(),
  className: text("class_name").notNull(),
  sectionName: text("section_name").notNull(),
  guardianName: text("guardian_name").notNull(),
  guardianPhone: text("guardian_phone").notNull(),
  status: text("status", { enum: ["active", "inactive", "graduated"] }).notNull().default("active"),
  createdBy: text("created_by").notNull().references(() => users.id),
  ...timestamps,
}, (table) => [
  uniqueIndex("students_tenant_admission_uq").on(table.tenantId, table.admissionNumber),
  index("students_tenant_class_idx").on(table.tenantId, table.className, table.sectionName),
  index("students_campus_idx").on(table.campusId),
  index("students_session_idx").on(table.academicSessionId),
]);

export const studentAttendance = sqliteTable("student_attendance", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  academicSessionId: text("academic_session_id").notNull().references(() => academicSessions.id),
  studentId: text("student_id").notNull().references(() => students.id),
  attendanceDate: text("attendance_date").notNull(),
  status: text("status", { enum: ["present", "absent", "late", "excused"] }).notNull(),
  note: text("note").notNull().default(""),
  markedBy: text("marked_by").notNull().references(() => users.id),
  ...timestamps,
}, (table) => [uniqueIndex("attendance_student_date_uq").on(table.studentId, table.attendanceDate), index("attendance_tenant_session_date_idx").on(table.tenantId, table.academicSessionId, table.attendanceDate)]);

export const feeInvoices = sqliteTable("fee_invoices", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => tenants.id), academicSessionId: text("academic_session_id").notNull().references(() => academicSessions.id), studentId: text("student_id").notNull().references(() => students.id), feeType: text("fee_type").notNull(), amountPaise: integer("amount_paise").notNull(), paidPaise: integer("paid_paise").notNull().default(0), dueDate: text("due_date").notNull(), status: text("status", { enum: ["due", "partial", "paid", "waived"] }).notNull().default("due"), createdBy: text("created_by").notNull().references(() => users.id), ...timestamps,
}, (table) => [index("fee_invoices_tenant_session_idx").on(table.tenantId, table.academicSessionId), index("fee_invoices_student_idx").on(table.studentId), index("fee_invoices_due_idx").on(table.dueDate, table.status)]);

export const feePayments = sqliteTable("fee_payments", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => tenants.id), invoiceId: text("invoice_id").notNull().references(() => feeInvoices.id), studentId: text("student_id").notNull().references(() => students.id), amountPaise: integer("amount_paise").notNull(), method: text("method", { enum: ["cash", "card", "upi", "bank"] }).notNull(), reference: text("reference").notNull().default(""), paidOn: text("paid_on").notNull(), receivedBy: text("received_by").notNull().references(() => users.id), createdAt: text("created_at").notNull(),
}, (table) => [index("fee_payments_invoice_idx").on(table.invoiceId), index("fee_payments_tenant_date_idx").on(table.tenantId, table.paidOn)]);

export const moduleRecords = sqliteTable("module_records", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  academicSessionId: text("academic_session_id").references(() => academicSessions.id),
  moduleKey: text("module_key").notNull(),
  workflow: text("workflow").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  recordDate: text("record_date").notNull(),
  dueDate: text("due_date"),
  amountPaise: integer("amount_paise"),
  assignee: text("assignee").notNull().default(""),
  priority: text("priority", { enum: ["low", "normal", "high", "urgent"] }).notNull().default("normal"),
  status: text("status", { enum: ["draft", "open", "in_progress", "completed", "cancelled"] }).notNull().default("open"),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdBy: text("created_by").notNull().references(() => users.id),
  ...timestamps,
}, (table) => [index("module_records_tenant_module_idx").on(table.tenantId, table.moduleKey, table.status), index("module_records_session_idx").on(table.academicSessionId), index("module_records_due_idx").on(table.dueDate, table.status)]);
