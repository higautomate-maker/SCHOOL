import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const dockerIndex = args.indexOf("--docker-container");
const fileIndex = args.indexOf("--file");
const container = dockerIndex >= 0 ? args[dockerIndex + 1] : null;
const file = fileIndex >= 0 ? args[fileIndex + 1] : null;
if (!file) {
  console.error("Usage: npm run db:pg:backup:validate -- --file <backup.dump> [--docker-container <name>]");
  process.exit(1);
}

let result;
if (container) {
  const present = spawnSync(
    "docker",
    ["exec", container, "test", "-s", file],
    { encoding: "utf8" },
  );
  if (present.status !== 0) {
    console.error("PostgreSQL backup is missing or empty inside the selected container.");
    process.exit(1);
  }
  result = spawnSync(
    "docker",
    ["exec", container, "pg_restore", "--list", file],
    { encoding: "utf8" },
  );
} else {
  if (!existsSync(file) || statSync(file).size === 0) {
    console.error("PostgreSQL backup is missing or empty.");
    process.exit(1);
  }
  result = spawnSync(
    process.env.PG_RESTORE_BIN || "pg_restore",
    ["--list", file],
    { encoding: "utf8" },
  );
}

if (result.error?.code === "ENOENT") {
  console.error("pg_restore is required to validate a PostgreSQL custom-format backup.");
  process.exit(1);
}
if (result.status !== 0) {
  console.error("PostgreSQL backup validation failed.");
  process.exit(1);
}
for (const table of ["tenants", "users", "students", "fee_invoices", "fee_payments"]) {
  if (!result.stdout.includes(`TABLE DATA public ${table}`)) {
    console.error(`PostgreSQL backup does not contain required table data: ${table}`);
    process.exit(1);
  }
}
console.log("PostgreSQL backup archive structure validation passed.");
