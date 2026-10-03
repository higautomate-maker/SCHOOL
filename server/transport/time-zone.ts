import type { PoolClient } from "pg";

export const DEFAULT_TRANSPORT_TIME_ZONE = "Asia/Kolkata";

export function transportTimeZone(
  environment: Record<string, string | undefined> = process.env,
): string {
  const value = (
    environment.HIG_TRANSPORT_TIME_ZONE ?? DEFAULT_TRANSPORT_TIME_ZONE
  ).trim();

  if (!value || value.length > 64) {
    throw new Error("HIG_TRANSPORT_TIME_ZONE must be a valid IANA time zone");
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
  } catch {
    throw new Error("HIG_TRANSPORT_TIME_ZONE must be a valid IANA time zone");
  }

  return value;
}

export async function configureTransportTimeZone(
  client: PoolClient,
  environment: Record<string, string | undefined> = process.env,
): Promise<void> {
  await client.query(
    "SELECT set_config('TimeZone', $1::text, true)",
    [transportTimeZone(environment)],
  );
}
