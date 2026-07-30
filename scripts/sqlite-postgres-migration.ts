import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";

const { Client } = pg;
type Row = Record<string, unknown>;
type Issue = { table: string; kind: string; detail: string };
export type LegacyIdentifierIssue = {
  table: string;
  column: string;
  identifier: string;
  recordIdentifier: string;
  tenant: string;
  dependentRecords: Array<{ table: string; column: string; count: number }>;
  recommendedRemediation: string;
  blocksMigration: true;
};
type NormalizedTable = { table: string; columns: string[]; rows: Row[] };
export type MigrationSnapshot = {
  tables: NormalizedTable[];
  counts: Record<string, number>;
  issues: Issue[];
  legacyIdentifiers: LegacyIdentifierIssue[];
  totals: Record<string, string | number>;
  tenantTotals: Record<string, Record<string, string | number>>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const booleanColumns = new Set([
  "users.mfa_enabled",
  "plans.active",
  "module_policies.enabled",
  "roles.system",
  "school_classes.active",
  "subjects.active",
]);
const jsonColumns = new Map([
  ["school_configurations", ["payload_json", "payload"]],
  ["audit_events", ["metadata_json", "metadata"]],
  ["module_records", ["metadata_json", "metadata"]],
  ["outbox_events", ["payload", "payload"]],
]);
const calendarColumns = new Set([
  "academic_sessions.starts_on",
  "academic_sessions.ends_on",
  "students.date_of_birth",
  "students.admission_date",
  "student_attendance.attendance_date",
  "fee_invoices.due_date",
  "module_records.record_date",
  "module_records.due_date",
]);
const timestampColumns = new Set([
  "users.created_at", "users.updated_at",
  "plans.created_at", "plans.updated_at",
  "tenants.created_at", "tenants.updated_at",
  "campuses.created_at", "campuses.updated_at",
  "academic_sessions.created_at", "academic_sessions.updated_at",
  "school_classes.created_at", "school_classes.updated_at",
  "class_sections.created_at", "class_sections.updated_at",
  "subjects.created_at", "subjects.updated_at",
  "school_settings.updated_at", "school_configurations.updated_at",
  "subscriptions.period_ends_at", "subscriptions.created_at", "subscriptions.updated_at",
  "memberships.created_at", "module_policies.updated_at",
  "roles.created_at", "roles.updated_at", "role_permissions.created_at",
  "students.created_at", "students.updated_at",
  "student_attendance.created_at", "student_attendance.updated_at",
  "fee_invoices.created_at", "fee_invoices.updated_at",
  "fee_payments.paid_on", "fee_payments.created_at",
  "module_records.created_at", "module_records.updated_at",
  "school_invitations.expires_at", "school_invitations.accepted_at",
  "school_invitations.created_at", "school_invitations.updated_at",
  "audit_events.occurred_at",
  "idempotency_records.created_at", "idempotency_records.expires_at",
  "outbox_events.available_at", "outbox_events.published_at",
  "outbox_events.created_at", "outbox_events.updated_at",
]);
const statusColumns = new Map<string, Set<string>>([
  ["users.status", new Set(["invited", "active", "locked", "disabled"])],
  ["tenants.status", new Set(["trial", "active", "suspended", "archived"])],
  ["academic_sessions.status", new Set(["planned", "active", "closed"])],
  ["subscriptions.status", new Set(["trial", "active", "past_due", "cancelled"])],
  ["module_policies.source", new Set(["plan", "override"])],
  ["subjects.type", new Set(["core", "elective", "cocurricular"])],
  ["students.gender", new Set(["female", "male", "other"])],
  ["students.status", new Set(["active", "inactive", "graduated"])],
  ["student_attendance.status", new Set(["present", "absent", "late", "excused"])],
  ["fee_invoices.status", new Set(["due", "partial", "paid", "waived"])],
  ["fee_payments.method", new Set(["cash", "card", "upi", "bank"])],
  ["module_records.priority", new Set(["low", "normal", "high", "urgent"])],
  ["module_records.status", new Set(["draft", "open", "in_progress", "completed", "cancelled"])],
  ["school_invitations.status", new Set(["pending", "accepted", "expired", "revoked"])],
  ["outbox_events.status", new Set(["pending", "processing", "published", "failed"])],
]);
const moneyColumns = new Set([
  "plans.monthly_price_paise",
  "plans.annual_price_paise",
  "fee_invoices.amount_paise",
  "fee_invoices.paid_paise",
  "fee_payments.amount_paise",
  "module_records.amount_paise",
]);

const specs: Array<{ table: string; columns: string[] }> = [
  { table: "users", columns: ["id", "email", "full_name", "status", "mfa_enabled", "created_at", "updated_at"] },
  { table: "plans", columns: ["id", "name", "monthly_price_paise", "annual_price_paise", "active", "created_at", "updated_at"] },
  { table: "tenants", columns: ["id", "name", "slug", "status", "country_code", "custom_domain", "created_at", "updated_at"] },
  { table: "campuses", columns: ["id", "tenant_id", "name", "code", "city", "created_at", "updated_at"] },
  { table: "academic_sessions", columns: ["id", "tenant_id", "name", "starts_on", "ends_on", "status", "created_at", "updated_at"] },
  { table: "school_classes", columns: ["id", "tenant_id", "name", "code", "display_order", "active", "created_at", "updated_at"] },
  { table: "class_sections", columns: ["id", "tenant_id", "class_id", "name", "capacity", "created_at", "updated_at"] },
  { table: "subjects", columns: ["id", "tenant_id", "name", "code", "type", "active", "created_at", "updated_at"] },
  { table: "school_settings", columns: ["tenant_id", "short_name", "email", "phone", "principal_name", "address", "currency_code", "admission_prefix", "receipt_prefix", "updated_by", "updated_at"] },
  { table: "school_configurations", columns: ["tenant_id", "config_key", "payload", "updated_by", "updated_at"] },
  { table: "subscriptions", columns: ["id", "tenant_id", "plan_id", "status", "period_ends_at", "created_at", "updated_at"] },
  { table: "memberships", columns: ["tenant_id", "user_id", "role_key", "campus_id", "created_at"] },
  { table: "module_policies", columns: ["tenant_id", "module_key", "enabled", "source", "configuration", "updated_at", "updated_by"] },
  { table: "roles", columns: ["id", "tenant_id", "name", "key", "system", "description", "created_by", "created_at", "updated_at"] },
  { table: "role_permissions", columns: ["tenant_id", "role_id", "permission", "created_at"] },
  { table: "students", columns: ["id", "tenant_id", "campus_id", "academic_session_id", "admission_number", "roll_number", "first_name", "last_name", "gender", "date_of_birth", "admission_date", "class_name", "section_name", "guardian_name", "guardian_phone", "status", "created_by", "created_at", "updated_at"] },
  { table: "student_attendance", columns: ["id", "tenant_id", "academic_session_id", "student_id", "attendance_date", "status", "note", "marked_by", "created_at", "updated_at"] },
  { table: "fee_invoices", columns: ["id", "tenant_id", "academic_session_id", "student_id", "fee_type", "amount_paise", "paid_paise", "due_date", "status", "created_by", "created_at", "updated_at"] },
  { table: "fee_payments", columns: ["id", "tenant_id", "invoice_id", "student_id", "amount_paise", "method", "reference", "paid_on", "received_by", "created_at"] },
  { table: "module_records", columns: ["id", "tenant_id", "academic_session_id", "module_key", "workflow", "title", "description", "record_date", "due_date", "amount_paise", "assignee", "priority", "status", "metadata", "created_by", "created_at", "updated_at"] },
  { table: "school_invitations", columns: ["id", "tenant_id", "email", "role_key", "token_hash", "status", "expires_at", "invited_by", "accepted_at", "created_at", "updated_at"] },
  { table: "audit_events", columns: ["id", "tenant_id", "actor_id", "action", "resource_type", "resource_id", "reason", "ip_hash", "metadata", "occurred_at"] },
  { table: "idempotency_records", columns: ["tenant_id", "key", "actor_email", "operation", "request_hash", "response", "created_at", "expires_at"] },
  { table: "outbox_events", columns: ["id", "tenant_id", "topic", "aggregate_type", "aggregate_id", "payload", "status", "attempts", "available_at", "published_at", "last_error", "created_at", "updated_at"] },
];
const requiredSourceTables = new Set(
  specs.map((spec) => spec.table).filter((table) => table !== "outbox_events"),
);

const uuidColumns: Record<string, string[]> = {
  users: ["id"],
  plans: ["id"],
  tenants: ["id"],
  campuses: ["id", "tenant_id"],
  academic_sessions: ["id", "tenant_id"],
  school_classes: ["id", "tenant_id"],
  class_sections: ["id", "tenant_id", "class_id"],
  subjects: ["id", "tenant_id"],
  school_settings: ["tenant_id", "updated_by"],
  school_configurations: ["tenant_id", "updated_by"],
  subscriptions: ["id", "tenant_id", "plan_id"],
  memberships: ["tenant_id", "user_id", "campus_id"],
  module_policies: ["tenant_id", "updated_by"],
  roles: ["id", "tenant_id", "created_by"],
  role_permissions: ["tenant_id", "role_id"],
  students: ["id", "tenant_id", "campus_id", "academic_session_id", "created_by"],
  student_attendance: ["id", "tenant_id", "academic_session_id", "student_id", "marked_by"],
  fee_invoices: ["id", "tenant_id", "academic_session_id", "student_id", "created_by"],
  fee_payments: ["id", "tenant_id", "invoice_id", "student_id", "received_by"],
  module_records: ["id", "tenant_id", "academic_session_id", "created_by"],
  school_invitations: ["id", "tenant_id", "invited_by"],
  audit_events: ["id", "tenant_id", "actor_id"],
  idempotency_records: ["tenant_id"],
  outbox_events: ["id", "tenant_id"],
};
const tenantOwnedTables = new Set([
  "tenants", "campuses", "academic_sessions", "school_classes", "class_sections",
  "subjects", "school_settings", "school_configurations", "subscriptions",
  "memberships", "module_policies", "roles", "role_permissions", "students",
  "student_attendance", "fee_invoices", "fee_payments", "module_records",
  "school_invitations", "audit_events", "idempotency_records", "outbox_events",
]);

export function readSqliteMigrationSnapshot(path: string): MigrationSnapshot {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    const available = new Set(
      (database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>)
        .map((row) => row.name),
    );
    const raw = new Map<string, Row[]>();
    for (const spec of specs) {
      raw.set(
        spec.table,
        available.has(spec.table)
          ? database.prepare(`SELECT * FROM "${spec.table}"`).all() as Row[]
          : [],
      );
    }
    const issues: Issue[] = [];
    for (const table of requiredSourceTables) {
      if (!available.has(table)) {
        issues.push({
          table,
          kind: "missing_source_table",
          detail: "required production table is absent",
        });
      }
    }
    const foreignKeys = database.prepare("PRAGMA foreign_key_check").all() as Array<{
      table: string; rowid: number; parent: string;
    }>;
    for (const item of foreignKeys) {
      issues.push({
        table: item.table,
        kind: "invalid_foreign_key",
        detail: `rowid ${item.rowid} references missing ${item.parent}`,
      });
    }
    detectDuplicates(database, available, issues);

    const roleTenants = new Map(raw.get("roles")!.map((row) => [String(row.id), String(row.tenant_id)]));
    const studentTenants = new Map(raw.get("students")!.map((row) => [String(row.id), String(row.tenant_id)]));
    const legacyIdentifiers: LegacyIdentifierIssue[] = [];
    const tables = specs.map((spec) => {
      const rows = raw.get(spec.table)!.map((source) =>
        normalizeRow(spec.table, source, roleTenants, studentTenants, issues)
      );
      validateRows(spec.table, rows, issues, legacyIdentifiers);
      return { table: spec.table, columns: spec.columns, rows };
    });
    populateIdentifierDependencies(legacyIdentifiers, tables);
    const counts = Object.fromEntries(tables.map((table) => [table.table, table.rows.length]));
    return {
      tables,
      counts,
      issues,
      legacyIdentifiers,
      ...calculateSqliteTotals(database, available),
    };
  } finally {
    database.close();
  }
}

export async function executeMigration(
  snapshot: MigrationSnapshot,
  environment: Record<string, string | undefined> = process.env,
): Promise<void> {
  if (snapshot.issues.length) throw new Error("Migration execution refused because dry-run blockers exist");
  const client = postgresClient(environment);
  await client.connect();
  try {
    const migrationState = await client.query(
      "SELECT count(*)::int AS count FROM hig_schema_migrations",
    );
    if (!migrationState.rows[0]?.count) throw new Error("PostgreSQL migrations are not applied");
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.platform_read', 'true', true)");
    const occupied = await client.query(
      `SELECT sum(count)::int AS count FROM (
         SELECT count(*) FROM tenants
         UNION ALL SELECT count(*) FROM users
         UNION ALL SELECT count(*) FROM plans
       ) occupied`,
    );
    if (occupied.rows[0]?.count !== 0) {
      throw new Error("Target PostgreSQL business tables must be empty");
    }
    await client.query("SELECT set_config('app.platform_create', 'true', true)");
    for (const table of snapshot.tables) {
      for (const row of table.rows) {
        if (tenantOwnedTables.has(table.table)) {
          const tenantId = table.table === "tenants" ? row.id : row.tenant_id;
          await client.query(
            "SELECT set_config('app.tenant_id', $1::text, true)",
            [tenantId],
          );
        }
        const identifiers = table.columns.map((column) => `"${column}"`).join(", ");
        const placeholders = table.columns.map((_, index) => `$${index + 1}`).join(", ");
        await client.query(
          `INSERT INTO "${table.table}" (${identifiers}) VALUES (${placeholders})`,
          table.columns.map((column) => row[column] ?? null),
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

export async function readPostgresSnapshot(
  environment: Record<string, string | undefined> = process.env,
): Promise<Pick<MigrationSnapshot, "counts" | "totals" | "tenantTotals">> {
  const client = postgresClient(environment);
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.platform_read', 'true', true)");
    const tenantResult = await client.query<{ tenant_id: string }>(
      "SELECT id::text AS tenant_id FROM tenants ORDER BY id",
    );
    await client.query("COMMIT");

    const counts = Object.fromEntries(specs.map((spec) => [spec.table, 0]));
    for (const table of ["users", "plans"]) {
      const result = await client.query(`SELECT count(*)::int AS count FROM "${table}"`);
      counts[table] = result.rows[0]?.count ?? 0;
    }
    const tenantTotals: Record<string, Record<string, string | number>> = {};
    for (const { tenant_id: tenantId } of tenantResult.rows) {
      await client.query("BEGIN");
      try {
        await client.query(
          "SELECT set_config('app.tenant_id', $1::text, true)",
          [tenantId],
        );
        for (const spec of specs) {
          if (spec.table === "users" || spec.table === "plans") continue;
          const predicate = spec.table === "tenants"
            ? "id = $1::uuid"
            : "tenant_id = $1::uuid";
          const result = await client.query(
            `SELECT count(*)::int AS count FROM "${spec.table}" WHERE ${predicate}`,
            [tenantId],
          );
          counts[spec.table] += result.rows[0]?.count ?? 0;
        }
        const totalResult = await client.query(`
          SELECT
            (SELECT count(*)::int FROM students WHERE tenant_id = $1::uuid) AS students,
            (SELECT count(*)::int FROM student_attendance WHERE tenant_id = $1::uuid) AS attendance,
            (SELECT COALESCE(sum(amount_paise), 0)::text FROM fee_invoices WHERE tenant_id = $1::uuid) AS invoice_amount_paise,
            (SELECT COALESCE(sum(paid_paise), 0)::text FROM fee_invoices WHERE tenant_id = $1::uuid) AS invoice_paid_paise,
            (SELECT COALESCE(sum(amount_paise - paid_paise), 0)::text FROM fee_invoices WHERE tenant_id = $1::uuid) AS outstanding_paise,
            (SELECT COALESCE(sum(amount_paise), 0)::text FROM fee_payments WHERE tenant_id = $1::uuid) AS payment_amount_paise,
            (SELECT count(*)::int FROM subscriptions WHERE tenant_id = $1::uuid AND status = 'active') AS active_subscriptions,
            (SELECT count(*)::int FROM roles WHERE tenant_id = $1::uuid) AS roles,
            (SELECT count(*)::int FROM memberships WHERE tenant_id = $1::uuid) AS memberships
        `, [tenantId]);
        tenantTotals[tenantId] = normalizedTotals(totalResult.rows[0] ?? {});
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    return {
      counts,
      totals: aggregateTenantTotals(tenantTotals),
      tenantTotals,
    };
  } finally {
    await client.end();
  }
}

export function writeReport(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function normalizeRow(
  table: string,
  source: Row,
  roleTenants: Map<string, string>,
  studentTenants: Map<string, string>,
  issues: Issue[],
): Row {
  const row = { ...source };
  const jsonMapping = jsonColumns.get(table);
  if (jsonMapping) {
    const [sourceName, targetName] = jsonMapping;
    row[targetName] = parseJson(table, sourceName, row[sourceName], issues);
    if (targetName !== sourceName) delete row[sourceName];
  }
  if (table === "module_policies") row.configuration = {};
  if (table === "role_permissions") {
    row.tenant_id = roleTenants.get(String(row.role_id)) ?? null;
    if (!row.tenant_id) issues.push({ table, kind: "unresolved_tenant", detail: `role ${String(row.role_id)}` });
  }
  if (table === "idempotency_records") {
    const response = parseJson(table, "response_json", row.response_json, issues);
    row.response = response;
    row.tenant_id = resolveIdempotencyTenant(response, studentTenants);
    row.request_hash = createHash("sha256").update(String(row.response_json ?? "")).digest("hex");
    delete row.response_json;
    if (!row.tenant_id) issues.push({ table, kind: "unresolved_tenant", detail: `key ${String(row.key)}` });
  }
  for (const [key, value] of Object.entries(row)) {
    if (booleanColumns.has(`${table}.${key}`)) row[key] = Boolean(value);
  }
  return row;
}

function validateRows(
  table: string,
  rows: Row[],
  issues: Issue[],
  legacyIdentifiers: LegacyIdentifierIssue[],
): void {
  for (const [index, row] of rows.entries()) {
    if (tenantOwnedTables.has(table)) {
      const tenantId = table === "tenants" ? row.id : row.tenant_id;
      if (tenantId === null || tenantId === undefined || tenantId === "") {
        issues.push({ table, kind: "unscoped_tenant_row", detail: `row ${index + 1}` });
      }
    }
    for (const column of uuidColumns[table] ?? []) {
      const value = row[column];
      if (value !== null && value !== undefined && !uuidPattern.test(String(value))) {
        const identifier = String(value);
        issues.push({
          table,
          kind: "incompatible_identifier",
          detail: `record ${recordIdentifier(row, index)} column ${column} is not a UUID`,
        });
        legacyIdentifiers.push({
          table,
          column,
          identifier,
          recordIdentifier: recordIdentifier(row, index),
          tenant: String(table === "tenants" ? row.id : row.tenant_id ?? "global"),
          dependentRecords: [],
          recommendedRemediation:
            "Approve an explicit deterministic UUID mapping for this identifier and every listed dependent record, apply it to a protected copy, then rerun preflight.",
          blocksMigration: true,
        });
      }
    }
    for (const [column, value] of Object.entries(row)) {
      if (value !== null && calendarColumns.has(`${table}.${column}`)
        && !datePattern.test(String(value))) {
        issues.push({ table, kind: "invalid_calendar_date", detail: `row ${index + 1} column ${column}` });
      }
      if (value !== null && timestampColumns.has(`${table}.${column}`)
        && Number.isNaN(Date.parse(String(value)))) {
        issues.push({ table, kind: "invalid_timestamp", detail: `row ${index + 1} column ${column}` });
      }
      if (value !== null && moneyColumns.has(`${table}.${column}`)
        && (!Number.isSafeInteger(Number(value)) || Number(value) < 0)) {
        issues.push({ table, kind: "invalid_money", detail: `row ${index + 1} column ${column}` });
      }
      const statuses = statusColumns.get(`${table}.${column}`);
      if (value !== null && statuses && !statuses.has(String(value))) {
        issues.push({ table, kind: "invalid_status", detail: `row ${index + 1} column ${column}` });
      }
    }
  }
}

function recordIdentifier(row: Row, index: number): string {
  return String(row.id ?? row.key ?? row.email ?? `row-${index + 1}`);
}

function populateIdentifierDependencies(
  identifiers: LegacyIdentifierIssue[],
  tables: NormalizedTable[],
): void {
  for (const issue of identifiers) {
    const references = new Map<string, { table: string; column: string; count: number }>();
    for (const table of tables) {
      for (const row of table.rows) {
        for (const [column, value] of Object.entries(row)) {
          if (String(value ?? "") !== issue.identifier) continue;
          if (
            table.table === issue.table
            && column === issue.column
            && recordIdentifier(row, 0) === issue.recordIdentifier
          ) continue;
          const key = `${table.table}.${column}`;
          const reference = references.get(key) ?? { table: table.table, column, count: 0 };
          reference.count += 1;
          references.set(key, reference);
        }
      }
    }
    issue.dependentRecords = [...references.values()];
  }
}

function parseJson(
  table: string,
  column: string,
  value: unknown,
  issues: Issue[],
): unknown {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value ?? "{}"));
  } catch {
    issues.push({ table, kind: "invalid_json", detail: `column ${column}` });
    return {};
  }
}

function resolveIdempotencyTenant(
  response: unknown,
  studentTenants: Map<string, string>,
): string | null {
  if (!response || typeof response !== "object") return null;
  const record = response as Record<string, unknown>;
  if (typeof record.tenantId === "string") return record.tenantId;
  if (typeof record.id === "string") return studentTenants.get(record.id) ?? null;
  return null;
}

function detectDuplicates(
  database: DatabaseSync,
  available: Set<string>,
  issues: Issue[],
): void {
  const checks = [
    ["tenants", "slug", "slug"],
    ["users", "lower(email)", "email"],
    ["students", "tenant_id || ':' || admission_number", "tenant admission"],
    ["school_invitations", "tenant_id || ':' || lower(email)", "tenant invitation email"],
  ];
  for (const [table, expression, label] of checks) {
    if (!available.has(table)) continue;
    const rows = database.prepare(
      `SELECT ${expression} AS value, count(*) AS count
       FROM "${table}" GROUP BY ${expression} HAVING count(*) > 1`,
    ).all() as Array<{ value: string; count: number }>;
    for (const row of rows) {
      issues.push({ table, kind: "duplicate", detail: `${label} has ${row.count} rows` });
    }
  }
}

function calculateSqliteTotals(
  database: DatabaseSync,
  available: Set<string>,
): Pick<MigrationSnapshot, "totals" | "tenantTotals"> {
  const scalar = (sql: string): string | number => {
    const value = (database.prepare(sql).get() as { value: string | number | null } | undefined)?.value;
    return value ?? 0;
  };
  const count = (table: string, where = "") =>
    available.has(table) ? scalar(`SELECT count(*) AS value FROM "${table}" ${where}`) : 0;
  const sum = (table: string, expression: string, where = "") =>
    available.has(table)
      ? scalar(`SELECT COALESCE(sum(${expression}), 0) AS value FROM "${table}" ${where}`)
      : 0;
  const totals = {
    students: count("students"),
    attendance: count("student_attendance"),
    invoice_amount_paise: String(sum("fee_invoices", "amount_paise")),
    invoice_paid_paise: String(sum("fee_invoices", "paid_paise")),
    outstanding_paise: String(sum("fee_invoices", "amount_paise - paid_paise")),
    payment_amount_paise: String(sum("fee_payments", "amount_paise")),
    active_subscriptions: count("subscriptions", "WHERE status = 'active'"),
    roles: count("roles"),
    memberships: count("memberships"),
  };
  const tenants = available.has("tenants")
    ? database.prepare("SELECT id FROM tenants ORDER BY id").all() as Array<{ id: string }>
    : [];
  const tenantTotals = Object.fromEntries(tenants.map(({ id }) => {
    const quoted = id.replaceAll("'", "''");
    const where = `WHERE tenant_id = '${quoted}'`;
    return [id, {
      students: count("students", where),
      attendance: count("student_attendance", where),
      invoice_amount_paise: String(sum("fee_invoices", "amount_paise", where)),
      invoice_paid_paise: String(sum("fee_invoices", "paid_paise", where)),
      outstanding_paise: String(sum("fee_invoices", "amount_paise - paid_paise", where)),
      payment_amount_paise: String(sum("fee_payments", "amount_paise", where)),
      active_subscriptions: count("subscriptions", `${where} AND status = 'active'`),
      roles: count("roles", where),
      memberships: count("memberships", where),
    }];
  }));
  return { totals, tenantTotals };
}

function normalizedTotals(row: Row): Record<string, string | number> {
  const copy = { ...row };
  delete copy.tenant_id;
  return copy as Record<string, string | number>;
}

function aggregateTenantTotals(
  tenantTotals: Record<string, Record<string, string | number>>,
): Record<string, string | number> {
  const moneyKeys = new Set([
    "invoice_amount_paise",
    "invoice_paid_paise",
    "outstanding_paise",
    "payment_amount_paise",
  ]);
  const totals: Record<string, string | number> = {
    students: 0,
    attendance: 0,
    invoice_amount_paise: "0",
    invoice_paid_paise: "0",
    outstanding_paise: "0",
    payment_amount_paise: "0",
    active_subscriptions: 0,
    roles: 0,
    memberships: 0,
  };
  for (const tenant of Object.values(tenantTotals)) {
    for (const [key, value] of Object.entries(tenant)) {
      totals[key] = moneyKeys.has(key)
        ? String(BigInt(String(totals[key] ?? 0)) + BigInt(String(value)))
        : Number(totals[key] ?? 0) + Number(value);
    }
  }
  return totals;
}

function postgresClient(environment: Record<string, string | undefined>) {
  if (!environment.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return new Client({
    connectionString: environment.DATABASE_URL,
    ssl: environment.PG_SSL === "disable" ? false : { rejectUnauthorized: true },
  });
}
