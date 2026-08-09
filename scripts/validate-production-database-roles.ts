import { validateProductionDatabaseRoles } from "../server/runtime/production-database-roles.ts";

try {
  await validateProductionDatabaseRoles(process.env);
  console.log(
    "Production PostgreSQL runtime and migration roles are distinct, isolated and protected.",
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Production PostgreSQL role validation failed",
  );
  process.exitCode = 1;
}
