import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDemoState } from "../server/demo-store.ts";

const state = getDemoState();
const generatedAt = new Date().toISOString();
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;

const sqlite = `-- Hig School complete demo seed
-- Database: SQLite 3
-- Generated: ${generatedAt}
-- No demo credentials or tokens are stored in this archive.
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS demo_state (
  tenant_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO demo_state (tenant_id, state_json, version, updated_at)
VALUES (${quote(state.school.tenantId)}, ${quote(JSON.stringify(state))}, ${state.version}, ${quote(state.updatedAt)})
ON CONFLICT(tenant_id) DO UPDATE SET
  state_json = excluded.state_json,
  version = excluded.version,
  updated_at = excluded.updated_at;

COMMIT;
`;

const mysql = `-- Hig School complete demo archive
-- Database: MySQL 8 / MariaDB 10.5+
-- Generated: ${generatedAt}
-- IMPORTANT: The current Hostinger Docker demo reads SQLite. This MySQL export is supplied
-- for phpMyAdmin inspection/migration and is not the active runtime database.
-- No demo credentials or tokens are stored in this archive.
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

CREATE TABLE IF NOT EXISTS demo_state (
  tenant_id VARCHAR(100) PRIMARY KEY,
  state_json LONGTEXT NOT NULL,
  version INT NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT demo_state_json_valid CHECK (JSON_VALID(state_json))
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO demo_state (tenant_id, state_json, version, updated_at)
VALUES (${quote(state.school.tenantId)}, ${quote(JSON.stringify(state))}, ${state.version}, ${quote(state.updatedAt)})
ON DUPLICATE KEY UPDATE
  state_json = VALUES(state_json),
  version = VALUES(version),
  updated_at = VALUES(updated_at);

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;
`;

writeFileSync(resolve("hostinger/hig-school-demo-sqlite.sql"), sqlite);
writeFileSync(resolve("hostinger/hig-school-demo-mysql.sql"), mysql);
