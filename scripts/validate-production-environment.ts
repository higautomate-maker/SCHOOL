import {
  sanitizedConfigurationError,
  validateProductionEnvironment,
} from "../server/runtime/production-environment.ts";

try {
  const configuration = validateProductionEnvironment(process.env);
  console.log(configuration
    ? "Production PostgreSQL, Redis, queue, key-provider, and pool configuration is valid."
    : "SQLite production configuration is valid; PostgreSQL cutover remains disabled.");
} catch (error) {
  console.error(sanitizedConfigurationError(error));
  process.exitCode = 1;
}
