import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("sales demo policy fails closed except in an explicit sales-demo deployment", () => {
  assert.equal(isSalesDemoAllowed({}), false);
  assert.equal(isSalesDemoAllowed({ NODE_ENV: "development" }), false);
  assert.equal(isSalesDemoAllowed({ NODE_ENV: "development", HIG_SALES_DEMO: "true" }), true);
  assert.equal(isSalesDemoAllowed({ NODE_ENV: "test", HIG_SALES_DEMO: "true" }), true);
  assert.equal(isSalesDemoAllowed({ NODE_ENV: "production", HIG_SALES_DEMO: "true" }), false);
  assert.equal(isSalesDemoAllowed({
    NODE_ENV: "production",
    HIG_SALES_DEMO: "true",
    HIG_DEPLOYMENT_ENV: "sales-demo",
  }), true);
  assert.equal(isSalesDemoAllowed({
    NODE_ENV: "production",
    HIG_SALES_DEMO: "false",
    HIG_DEPLOYMENT_ENV: "sales-demo",
  }), false);
  assert.throws(
    () => assertSalesDemoAllowed({ NODE_ENV: "production", HIG_SALES_DEMO: "true" }),
    /Sales demo mode is disabled/,
  );
});

test("all /api/v1/demo routes call assertSalesDemoAllowed before parsing requests", () => {
  for (const route of ["action", "login", "session", "state"]) {
    const source = readFileSync(
      new URL(`../app/api/v1/demo/${route}/route.ts`, import.meta.url),
      "utf8",
    );
    assert.match(source, /assertSalesDemoAllowed\(process\.env\)/);
  }
});
test("production demo runtime contains no bundled password or static authentication token",()=>{const source=["server/demo-store.ts","app/api/v1/demo/login/route.ts"].map(file=>readFileSync(file,"utf8")).join("\n");assert.match(source,/HIG_DEMO_ACCOUNTS_JSON/);assert.doesNotMatch(source,/(?:Company|School|Teacher|Student|Parent|Driver)@2026|demo_(?:company|school|staff|student|parent|driver)_2026/);});
