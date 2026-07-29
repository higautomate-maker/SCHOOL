import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { demoAccounts, getDemoState } from "../server/demo-store.ts";

const state = getDemoState();
const generatedAt = new Date().toISOString();
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const accountValues = demoAccounts.map((account) =>
  `(${[
    account.email,
    account.password,
    account.role,
    account.name,
    account.token,
    account.destination,
  ].map(quote).join(", ")})`
).join(",\n");

const sqlite = `-- Hig School complete demo seed
-- Database: SQLite 3
-- Generated: ${generatedAt}
-- WARNING: Demo passwords are intentionally readable. Never use these accounts in production.
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS demo_state (
  tenant_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS demo_accounts (
  email TEXT PRIMARY KEY,
  password TEXT NOT NULL,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  destination TEXT NOT NULL
);

DELETE FROM demo_accounts;
INSERT INTO demo_accounts (email, password, role, name, token, destination) VALUES
${accountValues};

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
-- WARNING: Demo passwords are intentionally readable. Never use these accounts in production.
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

CREATE TABLE IF NOT EXISTS demo_accounts (
  email VARCHAR(190) PRIMARY KEY,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(40) NOT NULL,
  name VARCHAR(190) NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  destination VARCHAR(255) NOT NULL
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

DELETE FROM demo_accounts;
INSERT INTO demo_accounts (email, password, role, name, token, destination) VALUES
${accountValues};

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
