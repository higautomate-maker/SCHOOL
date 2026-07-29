import { z } from "zod";

export const createSchoolSchema = z.object({
  name: z.string().trim().min(3).max(120),
  city: z.string().trim().min(2).max(80),
  plan: z.enum(["Starter", "Growth", "Enterprise"]),
  adminEmail: z.string().trim().toLowerCase().email().max(254),
});

export type CreateSchoolInput = z.infer<typeof createSchoolSchema>;
