import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

function encryptionKey(): Buffer {
  const secret = process.env.HIG_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("Mobile push token encryption is not configured");
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptMobilePushToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptMobilePushToken(value: string): string {
  const [version, ivValue, tagValue, payloadValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !payloadValue) {
    throw new Error("Mobile push token ciphertext is invalid");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(payloadValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
