import { database } from "@db-runtime";
import type { ChatGPTUser } from "../../app/chatgpt-auth";
import type { ConfigurationAction, GatewaySettings } from "./validation";

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

export async function getConfiguration(tenantId: string) {
  await requireSchool(tenantId);
  const rows = await database.prepare("SELECT config_key AS configKey, payload_json AS payloadJson FROM school_configurations WHERE tenant_id = ?").bind(tenantId).all<{ configKey:string;payloadJson:string }>();
  const row=rows.results.find(item=>item.configKey==="payment_gateway");
  let gateway = defaultGatewaySettings;
  if (row?.payloadJson) {
    try { gateway = { ...defaultGatewaySettings, ...JSON.parse(row.payloadJson) as GatewaySettings }; }
    catch { gateway = defaultGatewaySettings; }
  }
  const documents=Object.fromEntries(rows.results.filter(item=>item.configKey!=="payment_gateway").map(item=>{try{return [item.configKey,JSON.parse(item.payloadJson) as Record<string,string|number|boolean>];}catch{return [item.configKey,{}];}}));
  return { gateway: { ...gateway, credentials: maskSecrets(gateway.credentials) }, documents };
}

export async function applyConfigurationAction(tenantId: string, action: ConfigurationAction, actor: ChatGPTUser) {
  await requireSchool(tenantId);
  const now = new Date().toISOString();
  const actorId = await stableUserId(actor.email);
  await ensureUser(actorId, actor, now);
  if(action.action==="update_document"){
    await database.prepare("INSERT INTO school_configurations (tenant_id, config_key, payload_json, updated_by, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(tenant_id, config_key) DO UPDATE SET payload_json=excluded.payload_json, updated_by=excluded.updated_by, updated_at=excluded.updated_at").bind(tenantId,action.configKey,JSON.stringify(action.payload),actorId,now).run();
    await database.prepare("INSERT INTO audit_events (id, tenant_id, actor_id, action, resource_type, resource_id, reason, metadata_json, occurred_at) VALUES (?, ?, ?, 'configuration.update_document', 'school_configuration', ?, 'School configuration updated', ?, ?)").bind(crypto.randomUUID(),tenantId,actorId,action.configKey,JSON.stringify({configKey:action.configKey,fields:Object.keys(action.payload)}),now).run();
    return getConfiguration(tenantId);
  }
  const existing = await database.prepare("SELECT payload_json AS payloadJson FROM school_configurations WHERE tenant_id = ? AND config_key = 'payment_gateway'").bind(tenantId).first<{ payloadJson: string }>();
  let previous = defaultGatewaySettings;
  try { if (existing?.payloadJson) previous = { ...defaultGatewaySettings, ...JSON.parse(existing.payloadJson) as GatewaySettings }; } catch { previous = defaultGatewaySettings; }
  const credentials = Object.fromEntries(Object.entries(action.credentials).map(([key,value]) => [key, value === "••••••••" ? previous.credentials[key] ?? "" : value]));
  const payload: GatewaySettings = { enabled: action.enabled, gatewayId: action.gatewayId, paymentMode: action.paymentMode, credentials, surchargeEnabled: action.surchargeEnabled, surchargeType: action.surchargeType, surchargeValue: action.surchargeValue, surchargeLabel: action.surchargeLabel };
  await database.prepare("INSERT INTO school_configurations (tenant_id, config_key, payload_json, updated_by, updated_at) VALUES (?, 'payment_gateway', ?, ?, ?) ON CONFLICT(tenant_id, config_key) DO UPDATE SET payload_json=excluded.payload_json, updated_by=excluded.updated_by, updated_at=excluded.updated_at").bind(tenantId, JSON.stringify(payload), actorId, now).run();
  await database.prepare("INSERT INTO audit_events (id, tenant_id, actor_id, action, resource_type, resource_id, reason, metadata_json, occurred_at) VALUES (?, ?, ?, 'configuration.update_gateway', 'payment_gateway', ?, 'Payment configuration updated', ?, ?)").bind(crypto.randomUUID(), tenantId, actorId, tenantId, JSON.stringify({ enabled: payload.enabled, gatewayId: payload.gatewayId, paymentMode: payload.paymentMode, surchargeEnabled: payload.surchargeEnabled }), now).run();
  return getConfiguration(tenantId);
}

function maskSecrets(credentials: Record<string,string>) { return Object.fromEntries(Object.entries(credentials).map(([key,value]) => [key, /secret|password|passkey|salt|token|encryption|private/i.test(key) && value ? "••••••••" : value])); }
async function requireSchool(tenantId: string) { const school = await database.prepare("SELECT id FROM tenants WHERE id = ? AND status != 'archived'").bind(tenantId).first(); if (!school) throw new Error("School not found"); }
async function ensureUser(id: string, actor: ChatGPTUser, now: string) { await database.prepare("INSERT INTO users (id, email, full_name, status, mfa_enabled, created_at, updated_at) VALUES (?, ?, ?, 'active', 1, ?, ?) ON CONFLICT(email) DO UPDATE SET full_name=excluded.full_name, updated_at=excluded.updated_at").bind(id, actor.email.toLowerCase(), actor.fullName ?? actor.displayName, now, now).run(); }
async function stableUserId(email: string): Promise<string> { const bytes = new TextEncoder().encode(email.trim().toLowerCase()); const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((byte) => byte.toString(16).padStart(2, "0")).join(""); return `usr_${hash.slice(0, 24)}`; }
