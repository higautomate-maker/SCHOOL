import { z } from "zod";

const credentialValue = z.string().trim().max(2000);

export const gatewaySettingsSchema = z.object({
  enabled: z.boolean(),
  gatewayId: z.enum(["", "3", "7", "12"]),
  paymentMode: z.enum(["sandbox", "live"]),
  credentials: z.record(z.string().trim().min(1).max(80), credentialValue).default({}),
  surchargeEnabled: z.boolean().default(false),
  surchargeType: z.enum(["flat", "percentage"]).default("percentage"),
  surchargeValue: z.number().min(0).max(100000).default(0),
  surchargeLabel: z.string().trim().max(100).default("Online payment surcharge"),
});

export const configurationActionSchema = z.discriminatedUnion("action", [
  gatewaySettingsSchema.extend({ action: z.literal("update_gateway") }),
  z.object({ action:z.literal("update_document"), configKey:z.enum(["school_settings","notification_settings","telegram_settings","social_media_settings","admission_settings","backup_settings","module_settings","landing_page","custom_fields","roles_ui","backup_records","subscription_ui","biometric_devices"]), payload:z.record(z.string().trim().min(1).max(100),z.union([z.string().max(12000),z.number(),z.boolean()])) }),
]);

export type GatewaySettings = z.infer<typeof gatewaySettingsSchema>;
export type ConfigurationAction = z.infer<typeof configurationActionSchema>;
