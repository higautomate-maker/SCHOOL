import { z } from "zod";
import { schoolModuleKeys } from "../access/catalogue.ts";

const schoolModuleValues = [...schoolModuleKeys] as [
  typeof schoolModuleKeys[number],
  ...typeof schoolModuleKeys[number][],
];

export const moduleKeySchema = z.enum(schoolModuleValues);

export const schoolActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update_plan"), plan: z.enum(["Starter", "Growth", "Enterprise"]) }),
  z.object({ action: z.literal("set_module"), moduleKey: moduleKeySchema, enabled: z.boolean() }),
  z.object({ action: z.literal("resend_invitation") }),
  z.object({ action: z.literal("revoke_invitation") }),
]);

export type SchoolAction = z.infer<typeof schoolActionSchema>;
