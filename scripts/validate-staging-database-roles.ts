import { validateStagingDatabaseRoles } from "../server/runtime/staging-database-roles.ts";

try {
  const { staging } = await validateStagingDatabaseRoles(process.env);
  console.log(
    `Staging PostgreSQL runtime and migration roles are distinct and protected: ${staging.name}.`,
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Staging PostgreSQL role validation failed",
  );
  process.exitCode = 1;
}
