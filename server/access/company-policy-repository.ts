import { database, type DatabasePreparedStatement } from "#db-runtime";
import type { ChatGPTUser } from "../../app/chatgpt-auth";
import {
  appAudiences,
  appFeatureCatalogue,
  resolveEffectiveAppFeatureAccess,
  schoolModuleCatalogue,
  type AppAudience,
  type SchoolModuleKey,
} from "./catalogue.ts";
import type { CompanyAccessAction } from "./company-policy-validation.ts";
import { repositoryBackend } from "../runtime/repository-backend.ts";

export type CompanyModulePolicy = {
  key: SchoolModuleKey;
  label: string;
  category: string;
  description: string;
  displayOrder: number;
  enabled: boolean;
  source: "plan" | "override" | "missing";
};

export type CompanyAppFeaturePolicy = {
  key: string;
  audience: AppAudience;
  label: string;
  description: string;
  displayOrder: number;
  requiredSchoolModule: SchoolModuleKey | null;
  requiredSchoolModuleLabel: string | null;
  policyEnabled: boolean;
  effectiveEnabled: boolean;
  dependencySatisfied: boolean;
  source: "tenant" | "plan" | "missing";
  blockedReason: string | null;
};

export type CompanyAccessConfiguration = {
  tenantId: string;
  schoolName: string;
  plan: string;
  modules: CompanyModulePolicy[];
  appFeatures: Record<AppAudience, CompanyAppFeaturePolicy[]>;
};

type SchoolRow = { id: string; name: string; plan_id: string | null; plan_name: string | null };
type ModuleRow = { module_key: string; enabled: number; source: string };
type AppPolicyRow = { audience: AppAudience; feature_key: string; enabled: number };
type ReplayRow = { response_json: string };

export async function getCompanyAccessConfiguration(
  tenantId: string,
): Promise<CompanyAccessConfiguration | null> {
  if (repositoryBackend() === "postgres") {
    return (await import("./company-policy-postgres-repository.ts"))
      .getPostgresCompanyAccessConfiguration(tenantId);
  }
  return readSqliteConfiguration(tenantId);
}

export async function applyCompanyAccessAction(
  tenantId: string,
  action: CompanyAccessAction,
  actor: ChatGPTUser,
  idempotencyKey: string,
): Promise<CompanyAccessConfiguration> {
  if (repositoryBackend() === "postgres") {
    return (await import("./company-policy-postgres-repository.ts"))
      .applyPostgresCompanyAccessAction(tenantId, action, actor, idempotencyKey);
  }

  const replay = await database.prepare(
    `SELECT response_json
     FROM idempotency_records
     WHERE key = ?
       AND actor_email = ?
       AND operation = 'company.access.manage'
       AND expires_at > ?`,
  ).bind(idempotencyKey, actor.email.toLowerCase(), new Date().toISOString())
    .first<ReplayRow>();
  if (replay) return JSON.parse(replay.response_json) as CompanyAccessConfiguration;

  const current = await readSqliteConfiguration(tenantId);
  if (!current) throw new Error("School not found");

  const now = new Date();
  const nowIso = now.toISOString();
  const actorId = await stableUserId(actor.email);
  const statements: DatabasePreparedStatement[] = [
    database.prepare(
      `INSERT INTO users (id, email, full_name, status, mfa_enabled, created_at, updated_at)
       VALUES (?, ?, ?, 'active', 1, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         full_name = excluded.full_name,
         status = 'active',
         updated_at = excluded.updated_at`,
    ).bind(
      actorId,
      actor.email.toLowerCase(),
      actor.fullName ?? actor.displayName,
      nowIso,
      nowIso,
    ),
  ];

  let auditAction: string;
  let metadata: Record<string, unknown>;

  if (action.action === "set_module") {
    statements.push(
      database.prepare(
        `INSERT INTO module_policies (
           tenant_id, module_key, enabled, source, updated_at, updated_by
         ) VALUES (?, ?, ?, 'override', ?, ?)
         ON CONFLICT(tenant_id, module_key) DO UPDATE SET
           enabled = excluded.enabled,
           source = 'override',
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`,
      ).bind(
        tenantId,
        action.moduleKey,
        action.enabled ? 1 : 0,
        nowIso,
        actorId,
      ),
    );
    auditAction = "module.policy_change";
    metadata = { moduleKey: action.moduleKey, enabled: action.enabled };
  } else {
    statements.push(
      database.prepare(
        `INSERT INTO tenant_app_feature_policies (
           tenant_id, audience, feature_key, enabled, source,
           configuration, updated_at, updated_by
         ) VALUES (?, ?, ?, ?, 'override', '{}', ?, ?)
         ON CONFLICT(tenant_id, audience, feature_key) DO UPDATE SET
           enabled = excluded.enabled,
           source = 'override',
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`,
      ).bind(
        tenantId,
        action.audience,
        action.featureKey,
        action.enabled ? 1 : 0,
        nowIso,
        actorId,
      ),
    );
    auditAction = "app_feature.policy_change";
    metadata = {
      audience: action.audience,
      featureKey: action.featureKey,
      enabled: action.enabled,
    };
  }

  statements.push(
    database.prepare(
      `INSERT INTO audit_events (
         id, tenant_id, actor_id, action, resource_type, resource_id,
         reason, metadata_json, occurred_at
       ) VALUES (?, ?, ?, ?, 'access_policy', ?,
         'Company access administration', ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      tenantId,
      actorId,
      auditAction,
      tenantId,
      JSON.stringify(metadata),
      nowIso,
    ),
  );

  await database.batch(statements);
  const updated = await readSqliteConfiguration(tenantId);
  if (!updated) throw new Error("School not found after access update");

  await database.prepare(
    `INSERT INTO idempotency_records (
       key, actor_email, operation, response_json, created_at, expires_at
     ) VALUES (?, ?, 'company.access.manage', ?, ?, ?)`,
  ).bind(
    idempotencyKey,
    actor.email.toLowerCase(),
    JSON.stringify(updated),
    nowIso,
    new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
  ).run();

  return updated;
}

async function readSqliteConfiguration(
  tenantId: string,
): Promise<CompanyAccessConfiguration | null> {
  const school = await database.prepare(
    `SELECT t.id, t.name, s.plan_id, p.name AS plan_name
     FROM tenants t
     LEFT JOIN subscriptions s ON s.tenant_id = t.id
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE t.id = ?
       AND t.status != 'archived'
     LIMIT 1`,
  ).bind(tenantId).first<SchoolRow>();
  if (!school) return null;

  const [moduleRows, planAppRows, tenantAppRows] = await Promise.all([
    database.prepare(
      `SELECT module_key, enabled, source
       FROM module_policies
       WHERE tenant_id = ?`,
    ).bind(tenantId).all<ModuleRow>(),
    school.plan_id
      ? database.prepare(
        `SELECT audience, feature_key, enabled
         FROM plan_app_feature_policies
         WHERE plan_id = ?`,
      ).bind(school.plan_id).all<AppPolicyRow>()
      : Promise.resolve({ results: [] as AppPolicyRow[] }),
    database.prepare(
      `SELECT audience, feature_key, enabled
       FROM tenant_app_feature_policies
       WHERE tenant_id = ?`,
    ).bind(tenantId).all<AppPolicyRow>(),
  ]);

  return buildConfiguration({
    tenantId,
    schoolName: school.name,
    plan: school.plan_name ?? "Starter",
    moduleRows: moduleRows.results.map((row) => ({
      moduleKey: row.module_key,
      enabled: Boolean(row.enabled),
      source: row.source,
    })),
    planAppRows: planAppRows.results.map((row) => ({
      audience: row.audience,
      featureKey: row.feature_key,
      enabled: Boolean(row.enabled),
    })),
    tenantAppRows: tenantAppRows.results.map((row) => ({
      audience: row.audience,
      featureKey: row.feature_key,
      enabled: Boolean(row.enabled),
    })),
  });
}

export function buildConfiguration(input: {
  tenantId: string;
  schoolName: string;
  plan: string;
  moduleRows: readonly { moduleKey: string; enabled: boolean; source: string }[];
  planAppRows: readonly { audience: AppAudience; featureKey: string; enabled: boolean }[];
  tenantAppRows: readonly { audience: AppAudience; featureKey: string; enabled: boolean }[];
}): CompanyAccessConfiguration {
  const modulePolicy = new Map(
    input.moduleRows.map((row) => [row.moduleKey, row] as const),
  );
  const modules = schoolModuleCatalogue.map((definition) => {
    const policy = modulePolicy.get(definition.key);
    return {
      key: definition.key,
      label: definition.label,
      category: definition.category,
      description: definition.description,
      displayOrder: definition.displayOrder,
      enabled: policy?.enabled ?? false,
      source: policy?.source === "override"
        ? "override" as const
        : policy
          ? "plan" as const
          : "missing" as const,
    };
  });
  const enabledSchoolModules = new Set(
    modules.filter((moduleDefinition) => moduleDefinition.enabled).map((moduleDefinition) => moduleDefinition.key),
  );
  const moduleLabels = new Map(
    schoolModuleCatalogue.map((moduleDefinition) => [moduleDefinition.key, moduleDefinition.label] as const),
  );

  const appFeatures = Object.fromEntries(appAudiences.map((audience) => {
    const resolved = resolveEffectiveAppFeatureAccess({
      audience,
      planPolicies: input.planAppRows,
      tenantPolicies: input.tenantAppRows,
      enabledSchoolModules,
    });
    return [audience, resolved.map((item) => ({
      key: item.feature.key,
      audience,
      label: item.feature.label,
      description: item.feature.description,
      displayOrder: item.feature.displayOrder,
      requiredSchoolModule: item.feature.requiredSchoolModule,
      requiredSchoolModuleLabel: item.feature.requiredSchoolModule
        ? moduleLabels.get(item.feature.requiredSchoolModule) ?? null
        : null,
      policyEnabled: item.enabledByPolicy,
      effectiveEnabled: item.accessible,
      dependencySatisfied: item.dependencySatisfied,
      source: item.source,
      blockedReason: item.enabledByPolicy && !item.dependencySatisfied
        ? `${moduleLabels.get(item.feature.requiredSchoolModule!) ?? "Required module"} is disabled for this school`
        : null,
    }))];
  })) as Record<AppAudience, CompanyAppFeaturePolicy[]>;

  return {
    tenantId: input.tenantId,
    schoolName: input.schoolName,
    plan: input.plan,
    modules,
    appFeatures,
  };
}

async function stableUserId(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `usr_${hash.slice(0, 24)}`;
}

export const companyAccessAppFeatureCount = appFeatureCatalogue.length;
