import { z } from "zod";

export const moduleKeySchema = z.enum(["student_information", "fees_finance", "attendance", "examinations", "communication"]);

export const schoolActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update_plan"), plan: z.enum(["Starter", "Growth", "Enterprise"]) }),
  z.object({ action: z.literal("set_module"), moduleKey: moduleKeySchema, enabled: z.boolean() }),
  z.object({ action: z.literal("resend_invitation") }),
  z.object({ action: z.literal("revoke_invitation") }),
]);

export type SchoolAction = z.infer<typeof schoolActionSchema>;
