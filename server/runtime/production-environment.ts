import { z } from "zod";
import { readPostgresEnvironment } from "./postgres-environment.ts";
import { repositoryBackend } from "./repository-backend.ts";

const httpsUrl = z.string().url().refine(
  (value) => value.startsWith("https://"),
  "must use https://",
);
const redisUrl = z.string().url().refine(
  (value) => value.startsWith("redis://") || value.startsWith("rediss://"),
  "must use redis:// or rediss://",
);

export type ProductionEnvironment = {
  appUrl: string;
  redisUrl: string;
  queueMode: "redis";
  keyProvider: "environment";
};

export function validateProductionEnvironment(
  environment: Record<string, string | undefined> = process.env,
): ProductionEnvironment | null {
  const backend = repositoryBackend(environment);
  if (backend === "sqlite" && environment.HIG_POSTGRES_SHADOW_READS !== "true") {
    return null;
  }

  const postgres = readPostgresEnvironment(environment);
  if (postgres.PG_SSL === "disable") {
    const url = new URL(postgres.DATABASE_URL);
    const localIntegrationTest = environment.NODE_ENV === "test"
      && environment.APP_URL === "https://stage5.integration.higschool.test"
      && url.hostname === "127.0.0.1"
      && url.port === "55432"
      && url.pathname === "/hig_school_test"
      && url.username === "hig_school_app";
    if (
      !localIntegrationTest && (
        environment.HIG_PRIVATE_POSTGRES !== "true"
        || url.hostname !== "postgres"
        || (url.port !== "" && url.port !== "5432")
        || url.pathname !== "/hig_school_production"
        || url.username !== "hig_school_production_app"
        || !url.password
        || url.searchParams.size !== 1
        || url.searchParams.get("sslmode") !== "disable"
      )
    ) {
      throw new Error("Unencrypted production PostgreSQL is permitted only on the private Compose database network");
    }
  }
  const parsed = z.object({
    APP_URL: httpsUrl,
    SESSION_SECRET: z.string().min(32),
    REDIS_URL: redisUrl,
    HIG_QUEUE_MODE: z.literal("redis"),
    HIG_KEY_PROVIDER: z.literal("environment"),
    HIG_ENCRYPTION_KEY: z.string().min(32),
  }).parse(environment);
  return {
    appUrl: parsed.APP_URL,
    redisUrl: parsed.REDIS_URL,
    queueMode: parsed.HIG_QUEUE_MODE,
    keyProvider: parsed.HIG_KEY_PROVIDER,
  };
}

export function sanitizedConfigurationError(error: unknown): string {
  if (!(error instanceof z.ZodError)) return "Production configuration is invalid";
  const names = [...new Set(error.issues.map((issue) => String(issue.path[0] ?? "configuration")))];
  return `Invalid production configuration: ${names.join(", ")}`;
}
