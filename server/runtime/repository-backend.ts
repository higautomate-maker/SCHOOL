import { z } from "zod";

const repositoryBackendSchema = z.enum(["sqlite", "postgres"]);

export function repositoryBackend(
  environment: Record<string, string | undefined> = process.env,
): "sqlite" | "postgres" {
  return repositoryBackendSchema.parse(environment.HIG_REPOSITORY_BACKEND ?? "sqlite");
}

export function postgresShadowReadsEnabled(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return environment.HIG_POSTGRES_SHADOW_READS === "true";
}
