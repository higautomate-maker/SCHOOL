import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("School session exposes only the authenticated tenant's real name", () => {
  const postgres = source("server/auth/postgres-repository.ts");
  const sqlite = source("server/auth/sqlite-repository.ts");
  assert.match(postgres, /JOIN tenants t ON t\.id = m\.tenant_id/);
  assert.match(sqlite, /LEFT JOIN tenants t ON t\.id=m\.tenant_id/);
  assert.match(source("app/api/v1/auth/session/route.ts"), /activeTenantName:actor\.activeTenantName/);
  assert.match(source("app/school/page.tsx"), /name:session\.activeTenantName\?\.trim\(\)/);
});

test("School login success is attributed to its tenant in the audit log", () => {
  const service = source("server/auth/service.ts");
  assert.match(service, /const actor=await resolveSession\(session\.token\)/);
  assert.match(service, /tenantId:actor\.activeTenantId,action:"auth\.login",outcome:"success"/);
});

test("live student admission offers persisted classes and their sections only", () => {
  const page = source("app/school/page.tsx");
  const admission = page.split("function SchoolStudentAdmission(")[1]?.split("function ReferenceStudentAdmission(")[0];
  assert.ok(admission);
  assert.match(admission, /foundation\.classes\.find/);
  assert.match(admission, /selectedClass\?\.sections\.map/);
  assert.doesNotMatch(admission, /name="studentPhoto"|name="nationalId"|name="bankAccount"/);
});
