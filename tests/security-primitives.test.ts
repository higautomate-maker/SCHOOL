import assert from "node:assert/strict";
import test from "node:test";
import {
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_MIN_LENGTH,
  validIdempotencyKey,
} from "../server/http/idempotency.ts";
import {
  assertSalesDemoAllowed,
  isSalesDemoAllowed,
} from "../server/runtime/demo-mode.ts";

test("accepts only bounded idempotency keys", () => {
  assert.equal(validIdempotencyKey(null), false);
  assert.equal(validIdempotencyKey("x".repeat(IDEMPOTENCY_KEY_MIN_LENGTH - 1)), false);
  assert.equal(validIdempotencyKey("x".repeat(IDEMPOTENCY_KEY_MIN_LENGTH)), true);
  assert.equal(validIdempotencyKey("x".repeat(IDEMPOTENCY_KEY_MAX_LENGTH)), true);
  assert.equal(validIdempotencyKey("x".repeat(IDEMPOTENCY_KEY_MAX_LENGTH + 1)), false);
});

test("sales demo policy fails closed and can never run in production", () => {
  assert.equal(isSalesDemoAllowed({}), false);
  assert.equal(isSalesDemoAllowed({ NODE_ENV: "development" }), false);
  assert.equal(isSalesDemoAllowed({ NODE_ENV: "development", HIG_SALES_DEMO: "true" }), true);
  assert.equal(isSalesDemoAllowed({ NODE_ENV: "test", HIG_SALES_DEMO: "true" }), true);
  assert.equal(isSalesDemoAllowed({ NODE_ENV: "production", HIG_SALES_DEMO: "true" }), false);
  assert.throws(
    () => assertSalesDemoAllowed({ NODE_ENV: "production", HIG_SALES_DEMO: "true" }),
    /Sales demo mode is disabled/,
  );
});

test.todo("all /api/v1/demo routes call assertSalesDemoAllowed before parsing requests");
test.todo("production artifact contains no sales-demo password or static token");
