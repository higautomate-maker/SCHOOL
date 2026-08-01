import type { Options } from "@node-rs/argon2";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const ARGON2_PARAMETERS = Object.freeze({
  algorithm: 2,
  version: 1,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
} satisfies Options);

const commonPasswords = new Set([
  "password", "password123", "123456789012", "qwerty123456", "letmein123456",
  "admin123456", "welcome12345", "school@2026", "changeme1234",
]);

export function validatePassword(password: unknown): string[] {
  if (typeof password !== "string") return ["Password is required"];
  const length = [...password].length;
  const errors: string[] = [];
  if (length < PASSWORD_MIN_LENGTH) errors.push(`Password must contain at least ${PASSWORD_MIN_LENGTH} characters`);
  if (length > PASSWORD_MAX_LENGTH) errors.push(`Password must contain at most ${PASSWORD_MAX_LENGTH} characters`);
  if (commonPasswords.has(password.normalize("NFKC").trim().toLowerCase())) errors.push("Choose a less common password");
  return errors;
}

export async function hashPassword(password: string): Promise<string> {
  const errors = validatePassword(password);
  if (errors.length) throw new Error(errors[0]);
  const { hash } = await nativeArgon2();
  return hash(password, ARGON2_PARAMETERS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (typeof password !== "string" || [...password].length > PASSWORD_MAX_LENGTH) return { valid: false, needsRehash: false };
  const { verify } = await nativeArgon2();
  let valid = false;
  try { valid = await verify(passwordHash, password); } catch { return { valid: false, needsRehash: false }; }
  if (!valid) return { valid: false, needsRehash: false };
  const expected = "$argon2id$v=19$m=65536,t=3,p=1$";
  return { valid: true, needsRehash: !passwordHash.startsWith(expected) };
}

async function nativeArgon2(): Promise<typeof import("@node-rs/argon2")> {
  if (typeof process === "undefined" || (process.env.NODE_ENV === "production" && process.env.HIG_RUNTIME !== "node")) {
    throw new Error("Native password hashing is unavailable in this runtime");
  }
  // The variable import keeps platform-specific .node binaries out of the
  // Cloudflare bundle. Hostinger Node resolves its matching optional package
  // at runtime; unsupported runtimes fail closed above.
  const packageName = "@node-rs/argon2";
  return import(/* @vite-ignore */ packageName);
}
