import assert from "node:assert/strict";
import { validateStagingEnvironment } from "../server/runtime/staging-environment.ts";
import {
  getPostgresPool,
  withTenantDatabase,
} from "../server/runtime/postgres.ts";
import { listPostgresSchools } from "../server/schools/postgres-repository.ts";

validateStagingEnvironment(process.env);
const pool = getPostgresPool();

try {
  const identity = await pool.query<{
    superuser: boolean;
    bypassRls: boolean;
  }>(
    `SELECT rolsuper AS superuser, rolbypassrls AS "bypassRls"
     FROM pg_roles
     WHERE rolname = current_user`,
  );
  assert.equal(identity.rows[0]?.superuser, false);
  assert.equal(identity.rows[0]?.bypassRls, false);

  const schools = (await listPostgresSchools({ limit: 20 })).schools;
  const schoolA = schools.find(
    (school) => school.name === "HIG Greenfield Acceptance School",
  );
  const schoolB = schools.find(
    (school) => school.name === "HIG Greenfield Isolation School",
  );
  assert.ok(schoolA);
  assert.ok(schoolB);
  assert.notEqual(schoolA.tenantId, schoolB.tenantId);

  const fromA = await crossTenantProbe(schoolA.tenantId, schoolB.tenantId);
  const fromB = await crossTenantProbe(schoolB.tenantId, schoolA.tenantId);
  assert.deepEqual(fromA, {
    tenants: 0,
    students: 0,
    roles: 0,
    modules: 0,
    writes: 0,
  });
  assert.deepEqual(fromB, {
    tenants: 0,
    students: 0,
    roles: 0,
    modules: 0,
    writes: 0,
  });

  assert.throws(
    () => withTenantDatabase("forged-tenant-id", async () => undefined),
    /valid UUID/,
  );
  assert.ok(schools.length >= 2, "Platform scope must list both staging schools");
  assert.equal(pool.waitingCount, 0);
  console.log(
    "Staging two-school platform separation, forged-tenant rejection, RLS, role, module, read, and write isolation checks passed.",
  );
} finally {
  await pool.end();
}

function crossTenantProbe(currentTenant: string, targetTenant: string) {
  return withTenantDatabase(currentTenant, async (_database, client) => {
    const result = await client.query<{
      tenants: number;
      students: number;
      roles: number;
      modules: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM tenants WHERE id = $1::uuid) AS tenants,
         (SELECT count(*)::int FROM students WHERE tenant_id = $1::uuid) AS students,
         (SELECT count(*)::int FROM roles WHERE tenant_id = $1::uuid) AS roles,
         (SELECT count(*)::int FROM module_policies WHERE tenant_id = $1::uuid) AS modules`,
      [targetTenant],
    );
    const write = await client.query(
      `UPDATE module_policies
       SET enabled = false
       WHERE tenant_id = $1::uuid`,
      [targetTenant],
    );
    return {
      ...result.rows[0],
      writes: write.rowCount,
    };
  });
}
