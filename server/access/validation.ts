import { z } from "zod";
import { permissionCatalogue } from "./catalogue.ts";

const permissionValues = permissionCatalogue.map(([permission]) => permission) as [
  typeof permissionCatalogue[number][0],
  ...typeof permissionCatalogue[number][0][],
];

export const permissionSchema = z.enum(permissionValues);

export const createRoleSchema = z.object({
  action: z.literal("create"),
  name: z.string().trim().min(2).max(50),
  permissions: z.array(permissionSchema).max(permissionValues.length).default([]),
});

export const updateRoleSchema = z.object({
  action: z.literal("update_permissions"),
  roleId: z.string().uuid(),
  permissions: z.array(permissionSchema).max(permissionValues.length),
});

export const roleActionSchema = z.discriminatedUnion("action", [
  createRoleSchema,
  updateRoleSchema,
]);

export type RoleAction = z.infer<typeof roleActionSchema>;
