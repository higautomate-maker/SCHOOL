import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function randomToken(): string { return randomBytes(32).toString("base64url"); }
export function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
export function privacyHash(value: string, secret = privacySecret()): string {
  return createHash("sha256").update(`${secret}:${value}`, "utf8").digest("hex");
}
function privacySecret(): string {
  const secret=process.env.HIG_SECURITY_HASH_KEY??process.env.SESSION_SECRET;
  if(secret)return secret;
  if(process.env.NODE_ENV==="production"||process.env.HIG_DEPLOYMENT_ENV==="staging")throw new Error("Security hash key is unavailable");
  return "test-only-security-hash";
}
export function constantEqual(left: string, right: string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
