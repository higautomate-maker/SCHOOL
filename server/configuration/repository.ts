import { database } from "#db-runtime";
import type { ChatGPTUser } from "../../app/chatgpt-auth";
import {
  repositoryBackend,
  schedulePostgresShadowRead,
} from "../runtime/repository-backend.ts";
import {
  gatewaySettingsPayload,
  maskGatewayCredentials,
  mergeGatewayCredentialEdits,
  readGatewayCredentials,
} from "../payments/credentials.ts";
import { supportedPaymentGatewayId } from "../payments/providers.ts";
import type {
  ConfigurationAction,
  GatewaySettings,
} from "./validation";

export const defaultGatewaySettings: GatewaySettings = {
  enabled: false,
  gatewayId: "",
  paymentMode: "sandbox",
  credentials: {},
  surchargeEnabled: false,
  surchargeType: "percentage",
  surchargeValue: 0,
  surchargeLabel: "Online payment surcharge",
};

export type ConfigurationState = {
  gateway: GatewaySettings;
  documents: Record<string, Record<string, unknown>>;
};

export async function getConfiguration(
  tenantId: string,
): Promise<ConfigurationState> {
  if (repositoryBackend() === "postgres") {
    return (await import("./postgres-repository.ts"))
      .getPostgresConfiguration(tenantId);
  }

  await requireSchool(tenantId);

  const rows = await database
    .prepare(
      "SELECT config_key AS configKey, payload_json AS payloadJson " +
      "FROM school_configurations WHERE tenant_id = ?",
    )
    .bind(tenantId)
    .all<{ configKey: string; payloadJson: string }>();

  const row = rows.results.find(
    (item) => item.configKey === "payment_gateway",
  );

  const gateway = gatewayFromStored(
    tenantId,
    parseJson(row?.payloadJson),
  );

  const documents = Object.fromEntries(
    rows.results
      .filter((item) => item.configKey !== "payment_gateway")
      .map((item) => [
        item.configKey,
        parseJson(item.payloadJson),
      ]),
  );

  const configuration = {
    gateway: {
      ...gateway,
      credentials: maskGatewayCredentials(gateway.credentials),
    },
    documents,
  };

  schedulePostgresShadowRead(
    "configuration",
    configuration,
    async () =>
      (await import("./postgres-repository.ts"))
        .getPostgresConfiguration(tenantId),
  );

  return configuration;
}

export async function applyConfigurationAction(
  tenantId: string,
  action: ConfigurationAction,
  actor: ChatGPTUser,
): Promise<ConfigurationState> {
  if (repositoryBackend() === "postgres") {
    return (await import("./postgres-repository.ts"))
      .applyPostgresConfigurationAction(tenantId, action, actor);
  }

  await requireSchool(tenantId);

  const now = new Date().toISOString();
  const actorId = await stableUserId(actor.email);
  await ensureUser(actorId, actor, now);

  if (action.action === "update_document") {
    await database
      .prepare(
        "INSERT INTO school_configurations " +
        "(tenant_id, config_key, payload_json, updated_by, updated_at) " +
        "VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT(tenant_id, config_key) DO UPDATE SET " +
        "payload_json=excluded.payload_json, " +
        "updated_by=excluded.updated_by, updated_at=excluded.updated_at",
      )
      .bind(
        tenantId,
        action.configKey,
        JSON.stringify(action.payload),
        actorId,
        now,
      )
      .run();

    await database
      .prepare(
        "INSERT INTO audit_events " +
        "(id, tenant_id, actor_id, action, resource_type, resource_id, " +
        "reason, metadata_json, occurred_at) " +
        "VALUES (?, ?, ?, 'configuration.update_document', " +
        "'school_configuration', ?, 'School configuration updated', ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        tenantId,
        actorId,
        action.configKey,
        JSON.stringify({
          configKey: action.configKey,
          fields: Object.keys(action.payload),
        }),
        now,
      )
      .run();

    return getConfiguration(tenantId);
  }

  if (!supportedPaymentGatewayId(action.gatewayId)) {
    throw new Error("Unsupported payment gateway");
  }

  const existing = await database
    .prepare(
      "SELECT payload_json AS payloadJson " +
      "FROM school_configurations " +
      "WHERE tenant_id = ? AND config_key = 'payment_gateway'",
    )
    .bind(tenantId)
    .first<{ payloadJson: string }>();

  const previous = gatewayFromStored(
    tenantId,
    parseJson(existing?.payloadJson),
  );

  const credentials = mergeGatewayCredentialEdits(
    action.credentials,
    previous.credentials,
  );

  const settings: GatewaySettings = {
    enabled: action.enabled,
    gatewayId: action.gatewayId,
    paymentMode: action.paymentMode,
    credentials,
    surchargeEnabled: action.surchargeEnabled,
    surchargeType: action.surchargeType,
    surchargeValue: action.surchargeValue,
    surchargeLabel: action.surchargeLabel,
  };

  const persisted = gatewaySettingsPayload(tenantId, settings);

  await database
    .prepare(
      "INSERT INTO school_configurations " +
      "(tenant_id, config_key, payload_json, updated_by, updated_at) " +
      "VALUES (?, 'payment_gateway', ?, ?, ?) " +
      "ON CONFLICT(tenant_id, config_key) DO UPDATE SET " +
      "payload_json=excluded.payload_json, " +
      "updated_by=excluded.updated_by, updated_at=excluded.updated_at",
    )
    .bind(
      tenantId,
      JSON.stringify(persisted),
      actorId,
      now,
    )
    .run();

  await database
    .prepare(
      "INSERT INTO audit_events " +
      "(id, tenant_id, actor_id, action, resource_type, resource_id, " +
      "reason, metadata_json, occurred_at) " +
      "VALUES (?, ?, ?, 'configuration.update_gateway', " +
      "'payment_gateway', ?, 'Payment configuration updated', ?, ?)",
    )
    .bind(
      crypto.randomUUID(),
      tenantId,
      actorId,
      tenantId,
      JSON.stringify({
        enabled: settings.enabled,
        gatewayId: settings.gatewayId,
        paymentMode: settings.paymentMode,
        surchargeEnabled: settings.surchargeEnabled,
        credentialStorage: "encrypted",
      }),
      now,
    )
    .run();

  return getConfiguration(tenantId);
}

function gatewayFromStored(
  tenantId: string,
  value: Record<string, unknown>,
): GatewaySettings {
  const rawGatewayId =
    typeof value.gatewayId === "string" ? value.gatewayId : "";

  const gatewayId = supportedPaymentGatewayId(rawGatewayId)
    ? rawGatewayId as GatewaySettings["gatewayId"]
    : "";

  const paymentMode =
    value.paymentMode === "live" ? "live" : "sandbox";

  const surchargeType =
    value.surchargeType === "flat" ? "flat" : "percentage";

  const surchargeValue =
    typeof value.surchargeValue === "number" &&
    Number.isFinite(value.surchargeValue)
      ? value.surchargeValue
      : 0;

  return {
    ...defaultGatewaySettings,
    enabled: gatewayId ? value.enabled === true : false,
    gatewayId,
    paymentMode,
    credentials: readGatewayCredentials(tenantId, value),
    surchargeEnabled: value.surchargeEnabled === true,
    surchargeType,
    surchargeValue,
    surchargeLabel:
      typeof value.surchargeLabel === "string"
        ? value.surchargeLabel
        : defaultGatewaySettings.surchargeLabel,
  };
}

function parseJson(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function requireSchool(tenantId: string) {
  const school = await database
    .prepare(
      "SELECT id FROM tenants WHERE id = ? AND status != 'archived'",
    )
    .bind(tenantId)
    .first();

  if (!school) throw new Error("School not found");
}

async function ensureUser(
  id: string,
  actor: ChatGPTUser,
  now: string,
) {
  await database
    .prepare(
      "INSERT INTO users " +
      "(id,email,full_name,status,mfa_enabled,created_at,updated_at) " +
      "VALUES (?,?,?,'active',1,?,?) " +
      "ON CONFLICT(email) DO UPDATE SET " +
      "full_name=excluded.full_name, updated_at=excluded.updated_at",
    )
    .bind(
      id,
      actor.email.toLowerCase(),
      actor.fullName ?? actor.displayName,
      now,
      now,
    )
    .run();
}

async function stableUserId(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(
    email.trim().toLowerCase(),
  );

  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes),
    ),
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `usr_${hash.slice(0, 24)}`;
}
