import type { PoolClient } from "pg";
import type { ChatGPTUser } from "../../app/chatgpt-auth";
import type { AppAudience } from "./catalogue.ts";
import {
  buildConfiguration,
  type CompanyAccessConfiguration,
} from "./company-policy-repository.ts";
import type { CompanyAccessAction } from "./company-policy-validation.ts";
import {
  ensurePostgresActor,
  sha256Hex,
} from "../runtime/postgres-repository.ts";
import { withPlatformPolicyManagementDatabase } from "../runtime/postgres.ts";

type SchoolRow = {
  id: string;
  name: string;
  planId: string | null;
  planName: string | null;
};
type ModuleRow = { moduleKey: string; enabled: boolean; source: string };
type AppPolicyRow = { audience: AppAudience; featureKey: string; enabled: boolean };
type ReplayRow = { response: unknown };

export function getPostgresCompanyAccessConfiguration(
  tenantId: string,
): Promise<CompanyAccessConfiguration | null> {
  return withPlatformPolicyManagementDatabase(
    tenantId,
    async (_database, client) => readConfiguration(client, tenantId),
  );
}

export function applyPostgresCompanyAccessAction(
  tenantId: string,
  action: CompanyAccessAction,
  actor: ChatGPTUser,
  idempotencyKey: string,
): Promise<CompanyAccessConfiguration> {
  return withPlatformPolicyManagementDatabase(
    tenantId,
    async (_database, client) => {
      const replay = await readReplay(client, tenantId, idempotencyKey, actor.email);
      if (replay) return replay;

      const current = await readConfiguration(client, tenantId);
      if (!current) throw new Error("School not found");
      const actorId = await ensurePostgresActor(client, actor);

      let auditAction: string;
      let metadata: Record<string, unknown>;

      if (action.action === "set_module") {
        await client.query(
          `INSERT INTO module_policies (
             tenant_id, module_key, enabled, source, configuration,
             updated_at, updated_by
           ) VALUES (
             $1::uuid, $2::text, $3::boolean, 'override', '{}'::jsonb,
             now(), $4::uuid
           )
           ON CONFLICT (tenant_id, module_key) DO UPDATE SET
             enabled = EXCLUDED.enabled,
             source = 'override',
             updated_at = now(),
             updated_by = EXCLUDED.updated_by`,
          [tenantId, action.moduleKey, action.enabled, actorId],
        );
        auditAction = "module.policy_change";
        metadata = { moduleKey: action.moduleKey, enabled: action.enabled };
      } else {
        await client.query(
          `INSERT INTO tenant_app_feature_policies (
             tenant_id, audience, feature_key, enabled, source,
             configuration, updated_at, updated_by
           ) VALUES (
             $1::uuid, $2::app_audience, $3::text, $4::boolean, 'override',
             '{}'::jsonb, now(), $5::uuid
           )
           ON CONFLICT (tenant_id, audience, feature_key) DO UPDATE SET
             enabled = EXCLUDED.enabled,
             source = 'override',
             updated_at = now(),
             updated_by = EXCLUDED.updated_by`,
          [
            tenantId,
            action.audience,
            action.featureKey,
            action.enabled,
            actorId,
          ],
        );
        auditAction = "app_feature.policy_change";
        metadata = {
          audience: action.audience,
          featureKey: action.featureKey,
          enabled: action.enabled,
        };
      }

      await client.query(
        `INSERT INTO audit_events (
           id, tenant_id, actor_id, action, resource_type, resource_id,
           reason, metadata, occurred_at
         ) VALUES (
           gen_random_uuid(), $1::uuid, $2::uuid, $3::text,
           'access_policy', $4::text, 'Company access administration',
           $5::jsonb, now()
         )`,
        [tenantId, actorId, auditAction, tenantId, JSON.stringify(metadata)],
      );

      const updated = await readConfiguration(client, tenantId);
      if (!updated) throw new Error("School not found after access update");

      await client.query(
        `INSERT INTO idempotency_records (
           tenant_id, key, actor_email, operation, request_hash,
           response, created_at, expires_at
         ) VALUES (
           $1::uuid, $2::text, $3::text, 'company.access.manage',
           $4::text, $5::jsonb, now(), now() + interval '24 hours'
         )`,
        [
          tenantId,
          idempotencyKey,
          actor.email.toLowerCase(),
          await sha256Hex(JSON.stringify(action)),
          JSON.stringify(updated),
        ],
      );
      return updated;
    },
  );
}

async function readConfiguration(
  client: PoolClient,
  tenantId: string,
): Promise<CompanyAccessConfiguration | null> {
  const schoolResult = await client.query<SchoolRow>(
    `SELECT
       t.id,
       t.name,
       s.plan_id AS "planId",
       p.name AS "planName"
     FROM tenants t
     LEFT JOIN subscriptions s ON s.tenant_id = t.id
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE t.id = $1::uuid
       AND t.status <> 'archived'
     LIMIT 1`,
    [tenantId],
  );
  const school = schoolResult.rows[0];
  if (!school) return null;

  const [moduleResult, tenantAppResult] = await Promise.all([
    client.query<ModuleRow>(
      `SELECT
         module_key AS "moduleKey",
         enabled,
         source::text AS source
       FROM module_policies
       WHERE tenant_id = $1::uuid`,
      [tenantId],
    ),
    client.query<AppPolicyRow>(
      `SELECT
         audience,
         feature_key AS "featureKey",
         enabled
       FROM tenant_app_feature_policies
       WHERE tenant_id = $1::uuid`,
      [tenantId],
    ),
  ]);

  const planAppResult = school.planId
    ? await client.query<AppPolicyRow>(
      `SELECT
         audience,
         feature_key AS "featureKey",
         enabled
       FROM plan_app_feature_policies
       WHERE plan_id = $1::uuid`,
      [school.planId],
    )
    : { rows: [] as AppPolicyRow[] };

  return buildConfiguration({
    tenantId,
    schoolName: school.name,
    plan: school.planName ?? "Starter",
    moduleRows: moduleResult.rows,
    planAppRows: planAppResult.rows,
    tenantAppRows: tenantAppResult.rows,
  });
}

async function readReplay(
  client: PoolClient,
  tenantId: string,
  key: string,
  actorEmail: string,
): Promise<CompanyAccessConfiguration | null> {
  const result = await client.query<ReplayRow>(
    `SELECT response
     FROM idempotency_records
     WHERE tenant_id = $1::uuid
       AND key = $2::text
       AND actor_email = $3::text
       AND operation = 'company.access.manage'
       AND expires_at > now()
     LIMIT 1`,
    [tenantId, key, actorEmail.toLowerCase()],
  );
  return result.rows[0]?.response as CompanyAccessConfiguration | undefined ?? null;
}
