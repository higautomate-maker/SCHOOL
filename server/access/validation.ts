import { z } from "zod";

export const permissionSchema = z.enum([
  "students.view", "students.manage", "attendance.view", "attendance.manage",
  "fees.view", "fees.collect", "fees.export", "exams.view", "exams.publish",
  "reports.view", "settings.manage", "roles.manage",
]);

export const createRoleSchema = z.object({ action: z.literal("create"), name: z.string().trim().min(2).max(50), permissions: z.array(permissionSchema).max(12).default([]) });
export const updateRoleSchema = z.object({ action: z.literal("update_permissions"), roleId: z.string().uuid(), permissions: z.array(permissionSchema).max(12) });
export const roleActionSchema = z.discriminatedUnion("action", [createRoleSchema, updateRoleSchema]);

export type RoleAction = z.infer<typeof roleActionSchema>;
