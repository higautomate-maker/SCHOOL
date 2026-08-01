import { validateStagingEnvironment } from "../server/runtime/staging-environment.ts";

try {
  const staging = validateStagingEnvironment(process.env);
  console.log(
    `Staging environment is valid and production-protected: ${staging.name}.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Staging environment is invalid");
  process.exitCode = 1;
}
