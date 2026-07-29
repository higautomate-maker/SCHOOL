export const IDEMPOTENCY_KEY_MIN_LENGTH = 16;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 120;

export function validIdempotencyKey(value: string | null): value is string {
  return Boolean(
    value &&
      value.length >= IDEMPOTENCY_KEY_MIN_LENGTH &&
      value.length <= IDEMPOTENCY_KEY_MAX_LENGTH,
  );
}
