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

export function schedulePostgresShadowRead<Result>(
  label: string,
  sqliteResult: Result,
  postgresRead: () => Promise<Result>,
): void {
  if (!postgresShadowReadsEnabled()) return;
  void postgresRead().then((postgresResult) => {
    if (JSON.stringify(postgresResult) !== JSON.stringify(sqliteResult)) {
      console.warn(`PostgreSQL ${label} shadow-read mismatch`);
    }
  }).catch((error: unknown) => {
    console.warn(`PostgreSQL ${label} shadow-read failed`, {
      message: error instanceof Error ? error.message : "unknown error",
    });
  });
}
