import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const mode = process.argv.includes("--check") ? "check" : "apply";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !/^postgres(ql)?:\/\//.test(databaseUrl)) {
  console.error("DATABASE_URL is required and must use postgres:// or postgresql://.");
  process.exit(1);
}

const directory = resolve(process.cwd(), "drizzle-postgres");
const migrations = readdirSync(directory)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => {
    const source = readFileSync(resolve(directory, name), "utf8")
      .replaceAll("--> statement-breakpoint", "");
    return {
      name,
      source,
      checksum: createHash("sha256").update(source).digest("hex"),
    };
  });
const client = new Client({
  connectionString: databaseUrl,
  ssl: process.env.PG_SSL === "disable" ? false : { rejectUnauthorized: true },
});

try {
  await client.connect();
  await client.query("SELECT pg_advisory_lock(hashtextextended('hig-school:migrations', 0))");
  await client.query(`
    CREATE TABLE IF NOT EXISTS hig_schema_migrations (
      migration_name text PRIMARY KEY,
      checksum_sha256 text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const appliedResult = await client.query(
    "SELECT migration_name, checksum_sha256 FROM hig_schema_migrations ORDER BY migration_name",
  );
  const applied = new Map(
    appliedResult.rows.map((row) => [row.migration_name, row.checksum_sha256]),
  );
  const expectedNames = migrations.map((migration) => migration.name);
  const unexpected = [...applied.keys()].filter((name) => !expectedNames.includes(name));
  if (unexpected.length) {
    throw new Error(`Unknown applied PostgreSQL migrations: ${unexpected.join(", ")}`);
  }
  if (applied.size === 0) {
    const existing = await client.query(
      "SELECT to_regclass('public.tenants')::text AS tenants",
    );
    if (existing.rows[0]?.tenants) {
      throw new Error(
        "Existing PostgreSQL schema has no migration ledger; explicit baselining is required",
      );
    }
  }

  const pending = [];
  let encounteredPending = false;
  for (const migration of migrations) {
    const checksum = applied.get(migration.name);
    if (checksum && checksum !== migration.checksum) {
      throw new Error(`Applied migration checksum mismatch: ${migration.name}`);
    }
    if (!checksum) {
      encounteredPending = true;
      pending.push(migration);
    } else if (encounteredPending) {
      throw new Error(`PostgreSQL migration ledger is not an ordered prefix at ${migration.name}`);
    }
  }
  if (mode === "check") {
    if (pending.length) {
      throw new Error(`Pending PostgreSQL migrations: ${pending.map((item) => item.name).join(", ")}`);
    }
    console.log("PostgreSQL migration state is current.");
  } else {
    for (const migration of pending) {
      await client.query("BEGIN");
      try {
        await client.query(migration.source);
        await client.query(
          `INSERT INTO hig_schema_migrations (
             migration_name, checksum_sha256, applied_at
           ) VALUES ($1::text, $2::text, now())`,
          [migration.name, migration.checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`PostgreSQL migration failed: ${migration.name}`, { cause: error });
      }
    }
    console.log(
      pending.length
        ? `PostgreSQL migrations applied successfully (${pending.length} applied).`
        : "PostgreSQL migrations applied successfully (already current).",
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "PostgreSQL migration failed");
  process.exitCode = 1;
} finally {
  try {
    await client.query("SELECT pg_advisory_unlock(hashtextextended('hig-school:migrations', 0))");
  } catch {
    // Connection or lock acquisition failed; there is nothing safe to unlock.
  }
  await client.end().catch(() => undefined);
}
