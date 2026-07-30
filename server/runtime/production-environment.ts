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

  readPostgresEnvironment(environment);
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
