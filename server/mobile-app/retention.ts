const DEFAULT_LOCATION_RETENTION_DAYS = 30;
const MIN_LOCATION_RETENTION_DAYS = 1;
const MAX_LOCATION_RETENTION_DAYS = 90;

export const LOCATION_RETENTION_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const LOCATION_RETENTION_BATCH_SIZE = 5_000;
export const LOCATION_RETENTION_MAX_BATCHES_PER_SWEEP = 8;

export function mobileTransportLocationRetentionDays(
  value = process.env.HIG_TRANSPORT_LOCATION_RETENTION_DAYS,
): number {
  if (!value) return DEFAULT_LOCATION_RETENTION_DAYS;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LOCATION_RETENTION_DAYS;
  return Math.min(
    Math.max(parsed, MIN_LOCATION_RETENTION_DAYS),
    MAX_LOCATION_RETENTION_DAYS,
  );
}
