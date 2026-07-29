import type { PoolClient } from "pg";
import type { ChatGPTUser } from "../../app/chatgpt-auth";
import type { ConfigurationState } from "./repository.ts";
import {
  ensurePostgresActor,
  jsonObject,
  requirePostgresSchool,
} from "../runtime/postgres-repository.ts";
import { withTenantDatabase } from "../runtime/postgres.ts";
import type { ConfigurationAction, GatewaySettings } from "./validation.ts";

type ConfigurationRow = { configKey: string; payload: unknown };

const defaultGatewaySettings: GatewaySettings = {
  enabled: false,
  gatewayId: "",
  paymentMode: "sandbox",
  credentials: {},
  surchargeEnabled: false,
  surchargeType: "percentage",
  surchargeValue: 0,
  surchargeLabel: "Online payment surcharge",
};

export function getPostgresConfiguration(tenantId: string): Promise<ConfigurationState> {
  return withTenantDatabase(tenantId, async (_database, client) => {
    await requirePostgresSchool(client, tenantId);
    return readConfiguration(client, tenantId);
  });
}

export function applyPostgresConfigurationAction(
  tenantId: string,
  action: ConfigurationAction,
  actor: ChatGPTUser,
): Promise<ConfigurationState> {
  return withTenantDatabase(tenantId, async (_database, client) => {
    await requirePostgresSchool(client, tenantId);
    const actorId = await ensurePostgresActor(client, actor);

    if (action.action === "update_document") {
      await client.query(
        `INSERT INTO school_configurations (
           tenant_id, config_key, payload, updated_by, updated_at
         ) VALUES ($1, $2, $3::jsonb, $4, now())
         ON CONFLICT (tenant_id, config_key) DO UPDATE
           SET payload = EXCLUDED.payload,
               updated_by = EXCLUDED.updated_by,
               updated_at = EXCLUDED.updated_at`,
        [tenantId, action.configKey, JSON.stringify(action.payload), actorId],
      );
      await insertAudit(
        client,
        tenantId,
        actorId,
        "configuration.update_document",
        "school_configuration",
        action.configKey,
        "School configuration updated",
        { configKey: action.configKey, fields: Object.keys(action.payload) },
      );
      return readConfiguration(client, tenantId);
    }

    const existing = await client.query<{ payload: unknown }>(
      `SELECT payload
       FROM school_configurations
       WHERE tenant_id = $1
         AND config_key = 'payment_gateway'
       LIMIT 1`,
      [tenantId],
    );
    const previous = gatewaySettings(existing.rows[0]?.payload);
    const credentials = Object.fromEntries(
      Object.entries(action.credentials).map(([key, value]) => [
        key,
        value === "••••••••" ? previous.credentials[key] ?? "" : value,
      ]),
    );
    const payload: GatewaySettings = {
      enabled: action.enabled,
      gatewayId: action.gatewayId,
      paymentMode: action.paymentMode,
      credentials,
      surchargeEnabled: action.surchargeEnabled,
      surchargeType: action.surchargeType,
      surchargeValue: action.surchargeValue,
      surchargeLabel: action.surchargeLabel,
    };

    await client.query(
      `INSERT INTO school_configurations (
         tenant_id, config_key, payload, updated_by, updated_at
       ) VALUES ($1, 'payment_gateway', $2::jsonb, $3, now())
       ON CONFLICT (tenant_id, config_key) DO UPDATE
         SET payload = EXCLUDED.payload,
             updated_by = EXCLUDED.updated_by,
             updated_at = EXCLUDED.updated_at`,
      [tenantId, JSON.stringify(payload), actorId],
    );
    await insertAudit(
      client,
      tenantId,
      actorId,
      "configuration.update_gateway",
      "payment_gateway",
      tenantId,
      "Payment configuration updated",
      {
        enabled: payload.enabled,
        gatewayId: payload.gatewayId,
        paymentMode: payload.paymentMode,
        surchargeEnabled: payload.surchargeEnabled,
      },
    );
    return readConfiguration(client, tenantId);
  });
}

async function readConfiguration(
  client: PoolClient,
  tenantId: string,
): Promise<ConfigurationState> {
  const result = await client.query<ConfigurationRow>(
    `SELECT config_key AS "configKey", payload
     FROM school_configurations
     WHERE tenant_id = $1
     ORDER BY config_key`,
    [tenantId],
  );
  const gatewayRow = result.rows.find((row) => row.configKey === "payment_gateway");
  const gateway = gatewaySettings(gatewayRow?.payload);
  const documents = Object.fromEntries(
    result.rows
      .filter((row) => row.configKey !== "payment_gateway")
      .map((row) => [row.configKey, jsonObject(row.payload)]),
  );
  return {
    gateway: {
      ...gateway,
      credentials: maskSecrets(gateway.credentials),
    },
    documents,
  };
}

function gatewaySettings(value: unknown): GatewaySettings {
  return {
    ...defaultGatewaySettings,
    ...jsonObject(value),
    credentials: jsonObject(jsonObject(value).credentials) as Record<string, string>,
  } as GatewaySettings;
}

function maskSecrets(credentials: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(credentials).map(([key, value]) => [
      key,
      /secret|password|passkey|salt|token|encryption|private/i.test(key) && value
        ? "••••••••"
        : value,
    ]),
  );
}

function insertAudit(
  client: PoolClient,
  tenantId: string,
  actorId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  reason: string,
  metadata: Record<string, unknown>,
): Promise<unknown> {
  return client.query(
    `INSERT INTO audit_events (
       id, tenant_id, actor_id, action, resource_type, resource_id,
       reason, metadata, occurred_at
     ) VALUES (
       gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::jsonb, now()
     )`,
    [tenantId, actorId, action, resourceType, resourceId, reason, JSON.stringify(metadata)],
  );
}
