import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { decodeAuditCursor, encodeAuditCursor } from "../server/company/audit-repository.ts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("company audit route is platform-authorized, bounded and metadata-free", () => {
  const route = source("app/api/v1/company/audit/route.ts");
  const postgres = source("server/company/audit-postgres-repository.ts");
  const migration = source("drizzle-postgres/0018_company_audit_read.sql");
  assert.match(route, /authorize\(request, policies\.companyAuditView\)/);
  assert.match(route, /requestedLimit > 100/);
  assert.match(postgres, /withPlatformReadDatabase/);
  assert.match(postgres, /ORDER BY e\.occurred_at DESC, e\.id DESC/);
  assert.doesNotMatch(postgres, /e\.metadata/);
  assert.match(migration, /FOR SELECT USING \(app_platform_read_enabled\(\)\)/);
  assert.doesNotMatch(migration, /FOR (?:INSERT|UPDATE|DELETE)/);
});

test("company audit cursor is validated before a database query", () => {
  const event = { id: "10000000-0000-4000-8000-000000000001", occurredAt: "2026-10-18T10:00:00.000Z" };
  assert.deepEqual(decodeAuditCursor(encodeAuditCursor(event as Parameters<typeof encodeAuditCursor>[0])), event);
  assert.throws(() => decodeAuditCursor("not-a-cursor"), /Invalid audit cursor/);
});

test("company navigation exposes real plans and audit without claiming billing collections", () => {
  const ui = source("app/page.tsx");
  assert.match(ui, /active === "Plans & billing"/);
  assert.match(ui, /active === "Audit log"/);
  assert.match(ui, /No charge is created here/i);
  assert.doesNotMatch(ui, /₹1,499|₹3,499|₹7,999/);
});
