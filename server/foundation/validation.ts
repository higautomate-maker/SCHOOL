import { z } from "zod";

const code = z.string().trim().min(1).max(16).transform((value) => value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""));

export const foundationActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_session"), name: z.string().trim().min(4).max(30), startsOn: z.iso.date(), endsOn: z.iso.date(), activate: z.boolean().default(true) }),
  z.object({ action: z.literal("activate_session"), sessionId: z.string().uuid() }),
  z.object({ action: z.literal("create_class"), name: z.string().trim().min(1).max(40), code, sections: z.array(z.string().trim().min(1).max(20)).min(1).max(12), capacity: z.number().int().min(1).max(500).default(40) }),
  z.object({ action: z.literal("create_subject"), name: z.string().trim().min(2).max(80), code, type: z.enum(["core", "elective", "cocurricular"]).default("core") }),
  z.object({ action: z.literal("update_settings"), shortName: z.string().trim().min(2).max(20), email: z.email(), phone: z.string().trim().min(8).max(18), principalName: z.string().trim().min(2).max(100), address: z.string().trim().min(5).max(300), currencyCode: z.enum(["INR", "USD", "KES", "NGN"]), admissionPrefix: code, receiptPrefix: code }),
]);

export type FoundationAction = z.infer<typeof foundationActionSchema>;
