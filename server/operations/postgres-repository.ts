import type { PoolClient } from "pg";
import type { ChatGPTUser } from "../../app/chatgpt-auth";
import type { OperationsState } from "./repository.ts";
import type { OperationAction } from "./validation.ts";
import {
  ensurePostgresActor,
  isPostgresUniqueViolation,
  requirePostgresSchool,
  sha256Hex,
  timestampString,
} from "../runtime/postgres-repository.ts";
import { withTenantDatabase } from "../runtime/postgres.ts";
import { wakeNotificationWorker } from "../notifications/redis-wake.ts";

type AttendanceRow = {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  sectionName: string;
  attendanceDate: string;
  status: "present" | "absent" | "late" | "excused";
  note: string;
};

type InvoiceRow = {
  id: string;
  studentId: string;
  studentName: string;
  admissionNumber: string;
  feeType: string;
  amountPaise: string;
  paidPaise: string;
  dueDate: string;
  status: "due" | "partial" | "paid" | "waived";
  createdAt: Date | string;
};

type PaymentRow = {
  id: string;
  invoiceId: string;
  studentName: string;
  amountPaise: string;
  method: string;
  reference: string;
  paidOn: string;
};

type ReplayRow = { response: unknown };
type InvoiceBalanceRow = {
  id: string;
  studentId: string;
  amountPaise: string;
  paidPaise: string;
};

export function getPostgresOperations(
  tenantId: string,
  sessionId?: string | null,
): Promise<OperationsState> {
  return withTenantDatabase(tenantId, async (_database, client) => {
    await requirePostgresSchool(client, tenantId);
    const session = sessionId ?? await activeSessionId(client, tenantId);
    return session ? readOperations(client, tenantId, session) : emptyState();
  });
}

export async function findPostgresOperationReplay(
  tenantId: string,
  key: string,
  actorEmail: string,
  action: OperationAction["action"],
): Promise<OperationsState | null> {
  return withTenantDatabase(
    tenantId,
    async (_database, client) =>
      readReplay(client, tenantId, key, actorEmail, operationName(action)),
  );
}

export async function applyPostgresOperation(
  tenantId: string,
  action: OperationAction,
  actor: ChatGPTUser,
  idempotencyKey: string,
): Promise<OperationsState> {
  try {
    const committed = await withTenantDatabase(tenantId, async (_database, client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
        [`${tenantId}:${idempotencyKey}`],
      );
      const operation = operationName(action.action);
      const replay = await readReplay(
        client,
        tenantId,
        idempotencyKey,
        actor.email,
        operation,
      );
      if (replay) return { state: replay, outboxEventId: null };

      await requirePostgresSchool(client, tenantId);
      const sessionId = await activeSessionId(client, tenantId);
      if (!sessionId) throw new Error("Create and activate an academic session first");
      const actorId = await ensurePostgresActor(client, actor);

      let resourceType: "attendance" | "fee_invoice" | "fee_payment";
      let resourceId: string;
      let notificationPayload: Record<string, unknown>;
      if (action.action === "mark_attendance") {
        await requireStudent(client, tenantId, action.studentId);
        const result = await client.query<{ id: string }>(
          `INSERT INTO student_attendance (
             id, tenant_id, academic_session_id, student_id, attendance_date,
             status, note, marked_by, created_at, updated_at
           ) VALUES (
             gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::date,
             $5::attendance_status, $6::text, $7::uuid, now(), now()
           )
           ON CONFLICT (tenant_id, student_id, attendance_date) DO UPDATE
             SET academic_session_id = EXCLUDED.academic_session_id,
                 status = EXCLUDED.status,
                 note = EXCLUDED.note,
                 marked_by = EXCLUDED.marked_by,
                 updated_at = now()
           RETURNING id`,
          [
            tenantId,
            sessionId,
            action.studentId,
            action.attendanceDate,
            action.status,
            action.note,
            actorId,
          ],
        );
        resourceType = "attendance";
        resourceId = requireReturnedId(result.rows[0], "Attendance");
        notificationPayload = { ...action, studentId: action.studentId };
      } else if (action.action === "create_invoice") {
        await requireStudent(client, tenantId, action.studentId);
        const result = await client.query<{ id: string }>(
          `INSERT INTO fee_invoices (
             id, tenant_id, academic_session_id, student_id, fee_type,
             amount_paise, paid_paise, due_date, status, created_by,
             created_at, updated_at
           ) VALUES (
             gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::text,
             $5::bigint, 0, $6::date, 'due', $7::uuid, now(), now()
           )
           RETURNING id`,
          [
            tenantId,
            sessionId,
            action.studentId,
            action.feeType,
            action.amountPaise,
            action.dueDate,
            actorId,
          ],
        );
        resourceType = "fee_invoice";
        resourceId = requireReturnedId(result.rows[0], "Fee invoice");
        notificationPayload = { ...action, studentId: action.studentId };
      } else {
        const invoiceResult = await client.query<InvoiceBalanceRow>(
          `SELECT
             id,
             student_id AS "studentId",
             amount_paise::text AS "amountPaise",
             paid_paise::text AS "paidPaise"
           FROM fee_invoices
           WHERE tenant_id = $1::uuid
             AND id = $2::uuid
           FOR UPDATE`,
          [tenantId, action.invoiceId],
        );
        const invoice = invoiceResult.rows[0];
        if (!invoice) throw new Error("Fee invoice not found");
        const amountPaise = moneyNumber(invoice.amountPaise);
        const paidPaise = moneyNumber(invoice.paidPaise);
        if (action.amountPaise > amountPaise - paidPaise) {
          throw new Error("Payment exceeds the outstanding balance");
        }

        const paymentResult = await client.query<{ id: string }>(
          `INSERT INTO fee_payments (
             id, tenant_id, invoice_id, student_id, amount_paise,
             method, reference, paid_on, received_by, created_at
           ) VALUES (
             gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::bigint,
             $5::payment_method, $6::text, now(), $7::uuid, now()
           )
           RETURNING id`,
          [
            tenantId,
            invoice.id,
            invoice.studentId,
            action.amountPaise,
            action.method,
            action.reference,
            actorId,
          ],
        );
        resourceType = "fee_payment";
        resourceId = requireReturnedId(paymentResult.rows[0], "Fee payment");
        const nextPaidPaise = paidPaise + action.amountPaise;
        notificationPayload = {
          ...action,
          studentId: invoice.studentId,
          balancePaise: amountPaise - nextPaidPaise,
        };
        await client.query(
          `UPDATE fee_invoices
           SET paid_paise = $1::bigint,
               status = $2::invoice_status,
               updated_at = now()
           WHERE tenant_id = $3::uuid
             AND id = $4::uuid`,
          [
            nextPaidPaise,
            nextPaidPaise === amountPaise ? "paid" : "partial",
            tenantId,
            invoice.id,
          ],
        );
      }

      await insertAudit(
        client,
        tenantId,
        actorId,
        operation,
        resourceType,
        resourceId,
        action,
      );
      const outboxEventId = await insertOutbox(
        client,
        tenantId,
        operation,
        resourceType,
        resourceId,
        notificationPayload,
      );
      const state = await readOperations(client, tenantId, sessionId);
      await client.query(
        `INSERT INTO idempotency_records (
           tenant_id, key, actor_email, operation, request_hash,
           response, created_at, expires_at
         ) VALUES (
           $1::uuid, $2::text, $3::text, $4::text, $5::text,
           $6::jsonb, now(), now() + interval '24 hours'
         )`,
        [
          tenantId,
          idempotencyKey,
          actor.email.toLowerCase(),
          operation,
          await sha256Hex(JSON.stringify(action)),
          JSON.stringify(state),
        ],
      );
      return { state, outboxEventId };
    });
    if (committed.outboxEventId) {
      void wakeNotificationWorker().catch(() => undefined);
    }
    return committed.state;
  } catch (error) {
    if (isPostgresUniqueViolation(error)) {
      const replay = await findPostgresOperationReplay(
        tenantId,
        idempotencyKey,
        actor.email,
        action.action,
      );
      if (replay) return replay;
    }
    throw error;
  }
}

async function readOperations(
  client: PoolClient,
  tenantId: string,
  sessionId: string,
): Promise<OperationsState> {
  const [attendanceResult, invoiceResult, paymentResult] = await Promise.all([
    client.query<AttendanceRow>(
      `SELECT
         a.id,
         a.student_id AS "studentId",
         trim(s.first_name || ' ' || s.last_name) AS "studentName",
         s.class_name AS "className",
         s.section_name AS "sectionName",
         a.attendance_date::text AS "attendanceDate",
         a.status,
         a.note
       FROM student_attendance a
       JOIN students s
         ON s.tenant_id = a.tenant_id
        AND s.id = a.student_id
       WHERE a.tenant_id = $1::uuid
         AND a.academic_session_id = $2::uuid
       ORDER BY a.attendance_date DESC, "studentName"`,
      [tenantId, sessionId],
    ),
    client.query<InvoiceRow>(
      `SELECT
         i.id,
         i.student_id AS "studentId",
         trim(s.first_name || ' ' || s.last_name) AS "studentName",
         s.admission_number AS "admissionNumber",
         i.fee_type AS "feeType",
         i.amount_paise::text AS "amountPaise",
         i.paid_paise::text AS "paidPaise",
         i.due_date::text AS "dueDate",
         i.status,
         i.created_at AS "createdAt"
       FROM fee_invoices i
       JOIN students s
         ON s.tenant_id = i.tenant_id
        AND s.id = i.student_id
       WHERE i.tenant_id = $1::uuid
         AND i.academic_session_id = $2::uuid
       ORDER BY i.created_at DESC
       LIMIT 500`,
      [tenantId, sessionId],
    ),
    client.query<PaymentRow>(
      `SELECT
         p.id,
         p.invoice_id AS "invoiceId",
         trim(s.first_name || ' ' || s.last_name) AS "studentName",
         p.amount_paise::text AS "amountPaise",
         p.method::text AS method,
         p.reference,
         p.paid_on::date::text AS "paidOn"
       FROM fee_payments p
       JOIN students s
         ON s.tenant_id = p.tenant_id
        AND s.id = p.student_id
       JOIN fee_invoices i
         ON i.tenant_id = p.tenant_id
        AND i.id = p.invoice_id
       WHERE p.tenant_id = $1::uuid
         AND i.academic_session_id = $2::uuid
       ORDER BY p.paid_on DESC, p.created_at DESC
       LIMIT 200`,
      [tenantId, sessionId],
    ),
  ]);

  const attendance = attendanceResult.rows;
  const invoices = invoiceResult.rows.map((invoice) => ({
    ...invoice,
    amountPaise: moneyNumber(invoice.amountPaise),
    paidPaise: moneyNumber(invoice.paidPaise),
    createdAt: timestampString(invoice.createdAt),
  }));
  const payments = paymentResult.rows.map((payment) => ({
    ...payment,
    amountPaise: moneyNumber(payment.amountPaise),
  }));
  const today = new Date().toISOString().slice(0, 10);
  const todays = attendance.filter((entry) => entry.attendanceDate === today);
  const invoicedPaise = invoices.reduce((total, invoice) => total + invoice.amountPaise, 0);
  const collectedPaise = invoices.reduce((total, invoice) => total + invoice.paidPaise, 0);
  return {
    attendance,
    invoices,
    payments,
    metrics: {
      present: todays.filter((entry) => entry.status === "present").length,
      absent: todays.filter((entry) => entry.status === "absent").length,
      late: todays.filter((entry) => entry.status === "late").length,
      attendanceMarked: todays.length,
      invoicedPaise,
      collectedPaise,
      outstandingPaise: invoicedPaise - collectedPaise,
    },
  };
}

async function readReplay(
  client: PoolClient,
  tenantId: string,
  key: string,
  actorEmail: string,
  operation: string,
): Promise<OperationsState | null> {
  const result = await client.query<ReplayRow>(
    `SELECT response
     FROM idempotency_records
     WHERE tenant_id = $1::uuid
       AND key = $2::text
       AND actor_email = $3::text
       AND operation = $4::text
       AND expires_at > now()
     LIMIT 1`,
    [tenantId, key, actorEmail.toLowerCase(), operation],
  );
  return result.rows[0]?.response as OperationsState | undefined ?? null;
}

async function activeSessionId(
  client: PoolClient,
  tenantId: string,
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `SELECT id
     FROM academic_sessions
     WHERE tenant_id = $1::uuid
       AND status = 'active'
     ORDER BY starts_on DESC
     LIMIT 1`,
    [tenantId],
  );
  return result.rows[0]?.id ?? null;
}

async function requireStudent(
  client: PoolClient,
  tenantId: string,
  studentId: string,
): Promise<void> {
  const result = await client.query<{ id: string }>(
    `SELECT id
     FROM students
     WHERE tenant_id = $1::uuid
       AND id = $2::uuid
     LIMIT 1`,
    [tenantId, studentId],
  );
  if (!result.rows[0]) throw new Error("Student not found");
}

async function insertAudit(
  client: PoolClient,
  tenantId: string,
  actorId: string,
  operation: string,
  resourceType: string,
  resourceId: string,
  action: OperationAction,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events (
       id, tenant_id, actor_id, action, resource_type, resource_id,
       reason, metadata, occurred_at
     ) VALUES (
       gen_random_uuid(), $1::uuid, $2::uuid, $3::text, $4::text, $5::text,
       'School operations workflow', $6::jsonb, now()
     )`,
    [
      tenantId,
      actorId,
      operation,
      resourceType,
      resourceId,
      JSON.stringify(action),
    ],
  );
}

async function insertOutbox(
  client: PoolClient,
  tenantId: string,
  topic: string,
  aggregateType: string,
  aggregateId: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO outbox_events (
       id, tenant_id, topic, aggregate_type, aggregate_id,
       payload, status, attempts, available_at, created_at, updated_at
     ) VALUES (
       gen_random_uuid(), $1::uuid, $2::text, $3::text, $4::text,
       $5::jsonb, 'pending', 0, now(), now(), now()
     )
     RETURNING id`,
    [tenantId, topic, aggregateType, aggregateId, JSON.stringify(payload)],
  );
  return requireReturnedId(result.rows[0], "Outbox event");
}

function operationName(action: OperationAction["action"]): string {
  if (action === "mark_attendance") return "attendance.mark";
  if (action === "create_invoice") return "fee.invoice.create";
  return "fee.payment.collect";
}

function moneyNumber(value: string): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) {
    throw new Error("Stored monetary value exceeds the safe integer contract");
  }
  return amount;
}

function requireReturnedId(
  row: { id: string } | undefined,
  label: string,
): string {
  if (!row) throw new Error(`${label} could not be saved`);
  return row.id;
}

function emptyState(): OperationsState {
  return {
    attendance: [],
    invoices: [],
    payments: [],
    metrics: {
      present: 0,
      absent: 0,
      late: 0,
      attendanceMarked: 0,
      invoicedPaise: 0,
      collectedPaise: 0,
      outstandingPaise: 0,
    },
  };
}
