import { z } from "zod";

const postgresEnvironmentSchema = z.object({
  DATABASE_URL: z.string().url().refine(
    (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
    "DATABASE_URL must use the postgresql:// or postgres:// protocol",
  ),
  PG_POOL_MAX: z.coerce.number().int().min(1).max(20).default(10),
  PG_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  PG_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
  PG_SSL: z.enum(["require", "disable"]).default("require"),
});

export type PostgresEnvironment = z.infer<typeof postgresEnvironmentSchema>;

export function readPostgresEnvironment(
  environment: Record<string, string | undefined> = process.env,
): PostgresEnvironment {
  return postgresEnvironmentSchema.parse(environment);
}
