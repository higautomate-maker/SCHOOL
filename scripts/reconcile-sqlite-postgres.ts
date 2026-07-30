import {
  readPostgresSnapshot,
  readSqliteMigrationSnapshot,
  writeReport,
} from "./sqlite-postgres-migration.ts";

const source = process.env.HIG_SQLITE_SOURCE_PATH;
const reportPath = process.env.HIG_RECONCILIATION_REPORT_PATH
  || "/tmp/hig-school-reconciliation-report.json";
if (!source) {
  console.error("HIG_SQLITE_SOURCE_PATH is required.");
  process.exit(1);
}

try {
  const sqlite = readSqliteMigrationSnapshot(source);
  if (sqlite.issues.length) throw new Error("SQLite source has unresolved migration blockers");
  const postgres = await readPostgresSnapshot();
  const mismatches: Array<{ scope: string; key: string; sqlite: unknown; postgres: unknown }> = [];
  compare("table", sqlite.counts, postgres.counts, mismatches);
  compare("total", sqlite.totals, postgres.totals, mismatches);
  const tenantIds = new Set([
    ...Object.keys(sqlite.tenantTotals),
    ...Object.keys(postgres.tenantTotals),
  ]);
  for (const tenantId of tenantIds) {
    compare(
      `tenant:${tenantId}`,
      sqlite.tenantTotals[tenantId] ?? {},
      postgres.tenantTotals[tenantId] ?? {},
      mismatches,
    );
  }
  writeReport(reportPath, {
    sqlite: { counts: sqlite.counts, totals: sqlite.totals, tenantTotals: sqlite.tenantTotals },
    postgres,
    mismatches,
  });
  if (mismatches.length) {
    console.error(`SQLite/PostgreSQL reconciliation found ${mismatches.length} mismatch(es). Report: ${reportPath}`);
    process.exit(1);
  }
  console.log(`SQLite/PostgreSQL reconciliation passed. Report: ${reportPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Reconciliation failed");
  process.exitCode = 1;
}

function compare(
  scope: string,
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  mismatches: Array<{ scope: string; key: string; sqlite: unknown; postgres: unknown }>,
) {
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    if (String(left[key] ?? 0) !== String(right[key] ?? 0)) {
      mismatches.push({ scope, key, sqlite: left[key] ?? 0, postgres: right[key] ?? 0 });
    }
  }
}
