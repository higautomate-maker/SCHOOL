import assert from "node:assert/strict";
import {
  getPostgresPool,
  withTenantDatabase,
} from "../server/runtime/postgres.ts";
import { getPostgresSchoolDetail } from "../server/schools/management-postgres-repository.ts";
import { listPostgresSchools } from "../server/schools/postgres-repository.ts";
import { listPostgresStudents } from "../server/students/postgres-repository.ts";
import {
  applyPostgresOperation,
  getPostgresOperations,
} from "../server/operations/postgres-repository.ts";

const tenantId = process.env.HIG_LOAD_TENANT_ID
  ?? "30000000-0000-4000-8000-000000000001";
const actor = {
  displayName: "Stage 5 Load",
  email: "stage5.load@higschool.test",
  fullName: "Stage 5 Load",
};
const concurrency = 4;
const runId = crypto.randomUUID();
const startedAt = performance.now();

async function boundedMap<Result>(
  tasks: Array<() => Promise<Result>>,
): Promise<Result[]> {
  const results: Result[] = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < tasks.length) {
      const index = cursor++;
      results[index] = await tasks[index]();
    }
  }));
  return results;
}

const pool = getPostgresPool();
try {
  const students = await listPostgresStudents(tenantId);
  const student = students[0];
  assert.ok(student, "Seeded student is required for the load check");

  const readTasks: Array<() => Promise<unknown>> = Array.from({ length: 24 }, (_, index) =>
    index % 4 === 0
      ? () => listPostgresSchools({ limit: 20 })
      : index % 4 === 1
        ? () => listPostgresStudents(tenantId)
        : index % 4 === 2
          ? () => getPostgresSchoolDetail(tenantId)
          : () => getPostgresOperations(tenantId));
  const reads = await boundedMap(readTasks);
  assert.equal(reads.length, 24);
  assert.ok(pool.totalCount <= 4, `Pool exceeded configured bound: ${pool.totalCount}`);

  await boundedMap(Array.from({ length: concurrency }, (_, index) => () =>
    applyPostgresOperation(
      tenantId,
      {
        action: "mark_attendance",
        studentId: student.id,
        attendanceDate: `2026-08-0${index + 1}`,
        status: index % 2 === 0 ? "present" : "late",
        note: "Stage 5 bounded load",
      },
      actor,
      `stage5-load-${runId}-attendance-${index + 1}`,
    )));

  const invoiceFeeType = `Stage 5 Load Invoice ${runId}`;
  const created = await applyPostgresOperation(
    tenantId,
    {
      action: "create_invoice",
      studentId: student.id,
      feeType: invoiceFeeType,
      amountPaise: 1_000,
      dueDate: "2026-09-01",
    },
    actor,
    `stage5-load-${runId}-invoice`,
  );
  const invoice = created.invoices.find((record) => record.feeType === invoiceFeeType);
  assert.ok(invoice);

  const paymentReplayKey = `stage5-load-${runId}-payment-replay`;
  const repeated = await Promise.all(Array.from({ length: concurrency }, () =>
    applyPostgresOperation(
      tenantId,
      {
        action: "record_payment",
        invoiceId: invoice.id,
        amountPaise: 400,
        method: "upi",
        reference: "STAGE5-REPLAY",
      },
      actor,
      paymentReplayKey,
    )));
  for (const state of repeated.slice(1)) assert.deepEqual(state, repeated[0]);

  const finalState = await getPostgresOperations(tenantId);
  assert.equal(
    finalState.payments.filter((payment) => payment.invoiceId === invoice.id).length,
    1,
  );
  assert.equal(
    finalState.invoices.find((record) => record.id === invoice.id)?.paidPaise,
    400,
  );

  const protectedFeeType = `Stage 5 Concurrent Protection ${runId}`;
  const protectedInvoiceState = await applyPostgresOperation(
    tenantId,
    {
      action: "create_invoice",
      studentId: student.id,
      feeType: protectedFeeType,
      amountPaise: 500,
      dueDate: "2026-09-02",
    },
    actor,
    `stage5-load-${runId}-protected-invoice`,
  );
  const protectedInvoice = protectedInvoiceState.invoices.find(
    (record) => record.feeType === protectedFeeType,
  );
  assert.ok(protectedInvoice);
  const protectedPayments = await Promise.allSettled([
    applyPostgresOperation(
      tenantId,
      {
        action: "record_payment",
        invoiceId: protectedInvoice.id,
        amountPaise: 400,
        method: "bank",
        reference: "STAGE5-PROTECTED-A",
      },
      actor,
      `stage5-load-${runId}-protected-payment-a`,
    ),
    applyPostgresOperation(
      tenantId,
      {
        action: "record_payment",
        invoiceId: protectedInvoice.id,
        amountPaise: 400,
        method: "bank",
        reference: "STAGE5-PROTECTED-B",
      },
      actor,
      `stage5-load-${runId}-protected-payment-b`,
    ),
  ]);
  assert.equal(protectedPayments.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(protectedPayments.filter((result) => result.status === "rejected").length, 1);
  const protectedFinal = await getPostgresOperations(tenantId);
  assert.equal(
    protectedFinal.payments.filter((payment) => payment.invoiceId === protectedInvoice.id).length,
    1,
  );
  assert.equal(
    protectedFinal.invoices.find((record) => record.id === protectedInvoice.id)?.paidPaise,
    400,
  );
  const databaseCounts = await withTenantDatabase(tenantId, async (_database, client) => {
    const result = await client.query<{ payments: number; records: number }>(
      `SELECT
         (SELECT count(*)::int FROM fee_payments WHERE tenant_id = $1::uuid AND invoice_id = $2::uuid) AS payments,
         (SELECT count(*)::int FROM idempotency_records WHERE tenant_id = $1::uuid AND key = $3::text) AS records`,
      [tenantId, invoice.id, paymentReplayKey],
    );
    return result.rows[0];
  });
  assert.deepEqual(databaseCounts, { payments: 1, records: 1 });
  assert.equal(pool.waitingCount, 0);
  assert.ok(pool.totalCount <= 4, `Pool exceeded configured bound: ${pool.totalCount}`);
  const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
  console.log(JSON.stringify({
    concurrency,
    readRequests: 24,
    attendanceWrites: concurrency,
    duplicatePaymentRequests: concurrency,
    concurrentOverpaymentAttempts: 2,
    expectedProtectedSuccesses: 1,
    expectedProtectedFailures: 1,
    durationMs,
    approximateThroughputPerSecond: Math.round(
      ((24 + concurrency + concurrency + 2) / durationMs) * 100_000,
    ) / 100,
    pool: {
      configuredMaximum: 4,
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    },
  }));
  console.log("Bounded PostgreSQL load, pool, replay, and payment-concurrency checks passed.");
} finally {
  await pool.end();
}
