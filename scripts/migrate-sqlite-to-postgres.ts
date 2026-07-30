import {
  executeMigration,
  readSqliteMigrationSnapshot,
  writeReport,
} from "./sqlite-postgres-migration.ts";

const execute = process.argv.includes("--execute");
const source = process.env.HIG_SQLITE_SOURCE_PATH;
const reportPath = process.env.HIG_MIGRATION_REPORT_PATH
  || "/tmp/hig-school-sqlite-postgres-migration-report.json";
if (!source) {
  console.error("HIG_SQLITE_SOURCE_PATH is required.");
  process.exit(1);
}

try {
  const snapshot = readSqliteMigrationSnapshot(source);
  const report = {
    mode: execute ? "execute" : "dry-run",
    source,
    sourceDatabaseModified: false,
    counts: snapshot.counts,
    totals: snapshot.totals,
    tenantTotals: snapshot.tenantTotals,
    blockers: snapshot.issues,
    legacyIdentifiers: snapshot.legacyIdentifiers,
  };
  writeReport(reportPath, report);
  if (snapshot.issues.length) {
    console.error(`SQLite migration validation found ${snapshot.issues.length} blocker(s). Report: ${reportPath}`);
    process.exit(1);
  }
  if (execute) await executeMigration(snapshot);
  console.log(execute
    ? `SQLite-to-PostgreSQL controlled migration completed. Report: ${reportPath}`
    : `SQLite-to-PostgreSQL dry run passed without writes. Report: ${reportPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "SQLite migration validation failed");
  process.exitCode = 1;
}
