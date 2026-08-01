import { validateStagingEnvironment } from "../server/runtime/staging-environment.ts";

try {
  const staging = validateStagingEnvironment(process.env);
  if (!staging.requireEmpty) {
    throw new Error("Greenfield initialization requires HIG_STAGING_REQUIRE_EMPTY=true");
  }
  await import("./test-greenfield-postgres.ts");
  console.log(
    `Synthetic greenfield staging initialization passed: ${staging.name}.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Staging initialization failed");
  process.exitCode = 1;
}
