import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { validateStagingEnvironment } from "../server/runtime/staging-environment.ts";

const { Client } = pg;
const staging = validateStagingEnvironment(process.env);
const backupUrl = process.env.STAGING_BACKUP_DATABASE_URL;
if (!backupUrl) throw new Error("STAGING_BACKUP_DATABASE_URL is required");
validateStagingEnvironment({ ...process.env, DATABASE_URL: backupUrl });
if (new URL(backupUrl).pathname !== staging.databaseUrl.pathname) {
  throw new Error("Backup database must match the active staging database");
}
const restoreUrl = process.env.STAGING_RESTORE_DATABASE_URL;
if (!restoreUrl) throw new Error("STAGING_RESTORE_DATABASE_URL is required");
validateStagingEnvironment({ ...process.env, DATABASE_URL: restoreUrl });
if (restoreUrl === staging.databaseUrl.toString()) {
  throw new Error("Restore database must be separate from active staging");
}

mkdirSync(staging.backupPath, { recursive: true, mode: 0o700 });
const backupFile = join(staging.backupPath, "stage6-staging-rehearsal.dump");
const restoreClient = databaseClient(restoreUrl);
await restoreClient.connect();
try {
  const existing = await restoreClient.query<{ tenants: string | null }>(
    "SELECT to_regclass('public.tenants')::text AS tenants",
  );
  if (existing.rows[0]?.tenants) {
    throw new Error("Restore target is not empty; refusing to overwrite it");
  }
} finally {
  await restoreClient.end();
}

run("pg_dump", [
  "--format=custom",
  "--no-owner",
  "--no-acl",
  `--file=${backupFile}`,
], backupUrl);
run("pg_restore", ["--list", backupFile], undefined);
run("pg_restore", [
  "--exit-on-error",
  "--single-transaction",
  "--no-owner",
  "--no-acl",
  backupFile,
], restoreUrl);

const active = await totals(backupUrl);
const restored = await totals(restoreUrl);
assert.deepEqual(restored, active);
assert.ok(Number(active.tenants) >= 2);
assert.ok(Number(active.students) >= 1);
assert.equal(active.paidPaise, active.paymentPaise);
assert.equal(
  BigInt(active.invoicePaise) - BigInt(active.paidPaise),
  BigInt(active.outstandingPaise),
);
console.log(JSON.stringify({ rowAndFinancialTotals: active }));
console.log(
  `Staging PostgreSQL backup archive and separate restore database verification passed: ${staging.name}.`,
);

function databaseClient(connectionString: string) {
  return new Client({
    connectionString,
    ssl: process.env.PG_SSL === "disable" ? false : { rejectUnauthorized: true },
  });
}

async function totals(connectionString: string) {
  const client = databaseClient(connectionString);
  await client.connect();
  try {
    const result = await client.query<{
      tenants: string;
      students: string;
      attendance: string;
      invoices: string;
      payments: string;
      invoicePaise: string;
      paidPaise: string;
      paymentPaise: string;
      outstandingPaise: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM tenants) AS tenants,
         (SELECT count(*)::text FROM students) AS students,
         (SELECT count(*)::text FROM student_attendance) AS attendance,
         (SELECT count(*)::text FROM fee_invoices) AS invoices,
         (SELECT count(*)::text FROM fee_payments) AS payments,
         (SELECT coalesce(sum(amount_paise), 0)::text FROM fee_invoices) AS "invoicePaise",
         (SELECT coalesce(sum(paid_paise), 0)::text FROM fee_invoices) AS "paidPaise",
         (SELECT coalesce(sum(amount_paise), 0)::text FROM fee_payments) AS "paymentPaise",
         (SELECT coalesce(sum(amount_paise - paid_paise), 0)::text FROM fee_invoices) AS "outstandingPaise"`,
    );
    return result.rows[0];
  } finally {
    await client.end();
  }
}

function run(command: string, arguments_: string[], databaseUrl?: string): void {
  const result = spawnSync(command, databaseUrl ? [`--dbname=${databaseUrl}`, ...arguments_] : arguments_, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error?.message.includes("ENOENT")) {
    throw new Error(`${command} is required in the staging operator environment`);
  }
  if (result.status !== 0) throw new Error(`${command} failed`);
}
