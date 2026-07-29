import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";
import type {
  DatabaseAdapter,
  DatabaseAllResult,
  DatabasePreparedStatement,
  DatabaseRunResult,
} from "./database";

const databaseKey = Symbol.for("hig-school.node-database.v1");
type DatabaseGlobal = typeof globalThis & { [databaseKey]?: DatabaseSync };

function inputValues(values: readonly unknown[]): SQLInputValue[] {
  return values.map((value) => value as SQLInputValue);
}

class NodeSqlitePreparedStatement implements DatabasePreparedStatement {
  readonly #statement: StatementSync;
  #values: unknown[] = [];

  constructor(statement: StatementSync) {
    this.#statement = statement;
  }

  bind(...values: unknown[]): DatabasePreparedStatement {
    const bound = new NodeSqlitePreparedStatement(this.#statement);
    bound.#values = values;
    return bound;
  }

  async all<Row>(): Promise<DatabaseAllResult<Row>> {
    return {
      results: this.#statement.all(...inputValues(this.#values)) as Row[],
      success: true,
    };
  }

  async first<Row>(column?: string): Promise<Row | null> {
    const row = this.#statement.get(...inputValues(this.#values)) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as Row;
  }

  async run(): Promise<DatabaseRunResult> {
    const result = this.#statement.run(...inputValues(this.#values));
    return {
      success: true,
      meta: {
        changes: Number(result.changes),
        lastRowId: Number(result.lastInsertRowid),
      },
    };
  }
}

function migrationDirectory(): string {
  return process.env.HIG_SQLITE_MIGRATIONS_PATH?.trim() || resolve(process.cwd(), "drizzle");
}

function applyMigrations(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS hig_schema_migrations (
      migration_name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
  const applied = database.prepare("SELECT migration_name FROM hig_schema_migrations")
    .all() as Array<{ migration_name: string }>;
  const appliedNames = new Set(applied.map((row) => row.migration_name));
  const directory = migrationDirectory();
  const migrations = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
  const record = database.prepare(
    "INSERT INTO hig_schema_migrations (migration_name, applied_at) VALUES (?, ?)",
  );

  for (const migration of migrations) {
    if (appliedNames.has(migration)) continue;
    const source = readFileSync(resolve(directory, migration), "utf8")
      .replaceAll("--> statement-breakpoint", "");
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(source);
      record.run(migration, new Date().toISOString());
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw new Error(`SQLite migration ${migration} failed`, { cause: error });
    }
  }
}

function nodeDatabase(): DatabaseSync {
  const target = globalThis as DatabaseGlobal;
  if (target[databaseKey]) return target[databaseKey];

  const databasePath = process.env.HIG_DEMO_DB_PATH?.trim()
    || resolve(process.cwd(), ".data", "hig-school-demo.sqlite");
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  applyMigrations(database);
  target[databaseKey] = database;
  return database;
}

export const database: DatabaseAdapter = {
  prepare(sql) {
    return new NodeSqlitePreparedStatement(nodeDatabase().prepare(sql));
  },
  async batch(statements) {
    const native = nodeDatabase();
    native.exec("BEGIN IMMEDIATE");
    try {
      const results: DatabaseRunResult[] = [];
      for (const statement of statements) results.push(await statement.run());
      native.exec("COMMIT");
      return results;
    } catch (error) {
      native.exec("ROLLBACK");
      throw error;
    }
  },
};

export type { DatabaseAdapter, DatabasePreparedStatement } from "./database";
