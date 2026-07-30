import assert from "node:assert/strict";
import { evaluateReadiness, publicReadinessBody } from "../server/runtime/readiness.ts";
import { getPostgresPool } from "../server/runtime/postgres.ts";

try {
  const result = await evaluateReadiness();
  assert.deepEqual(result, { ready: true });
  const publicBody = JSON.stringify(publicReadinessBody(result.ready));
  for (const secret of [
    process.env.DATABASE_URL,
    process.env.REDIS_URL,
    process.env.SESSION_SECRET,
    process.env.HIG_ENCRYPTION_KEY,
  ]) {
    if (secret) assert.equal(publicBody.includes(secret), false);
  }
  console.log("PostgreSQL, Redis, queue, key-provider, and migration readiness checks passed.");
} finally {
  await getPostgresPool().end();
}
